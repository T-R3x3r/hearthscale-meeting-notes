/**
 * Writes a meeting's notes from its transcript and the person's own notes,
 * on the app's chat model, in the shape of a template.
 *
 * The person's lines stay word for word; the model adds points under the
 * template's headings, details under the person's lines, and the next
 * steps, each with the transcript lines it came from. The transcript goes
 * to the model fenced as untrusted text, and the request has no tools, so
 * words in the transcript change nothing but the words of the notes.
 *
 * A transcript longer than the model's window goes in parts that fit: each
 * part gives its points, and a last request puts them under headings.
 */
import type { AppContext, ChatContentPart, ChatMessage } from '@hearthscale/app';
import { quoteLink, shortClock, speakerName, type Line, type Meeting } from '../shared/meeting.ts';
import type { Template } from '../shared/templates.ts';

export interface Brief {
  meeting: Meeting;
  lines: Line[];
  mine: string;
  template: Template;
  /** The person's name in the transcript. */
  me: string;
  /** What the person said about themselves, for context. */
  about: string;
  /** The language to write in, or null for the meeting's own. */
  language: string | null;
}

export interface Written {
  title: string;
  markdown: string;
}

interface Point {
  text: string;
  lines: number[];
}

interface Step extends Point {
  owner: string;
}

/** About how many characters one token of text takes. */
const CHARS_PER_TOKEN = 3.5;
/** The share of the model's window kept for its answer. */
const ANSWER_SHARE = 0.25;

const point = {
  type: 'object',
  properties: {
    text: { type: 'string' },
    lines: { type: 'array', items: { type: 'integer' } },
  },
  required: ['text', 'lines'],
  additionalProperties: false,
};

const step = {
  type: 'object',
  properties: {
    text: { type: 'string' },
    owner: { type: 'string' },
    lines: { type: 'array', items: { type: 'integer' } },
  },
  required: ['text', 'owner', 'lines'],
  additionalProperties: false,
};

const detail = {
  type: 'object',
  properties: {
    note: { type: 'integer' },
    details: { type: 'array', items: point },
  },
  required: ['note', 'details'],
  additionalProperties: false,
};

/** What "next" holds, for the request of the whole transcript and of a part. */
const NEXT =
  '"next" lists only the tasks someone agreed to do, never a status or a fact. Give each as a short task and, in ' +
  '"owner", the name of the person who does it: a name said in the meeting, as when a speaker is called by name and ' +
  'answers; or "" when no name is said.';

const tokens = (text: string) => Math.ceil(text.length / CHARS_PER_TOKEN);

/** The words the meeting's own words treat as names: those written with a
 *  capital where no sentence starts, and those never written in lower
 *  case. */
function properWords(texts: string[]): Set<string> {
  const proper = new Set<string>();
  const capital = new Set<string>();
  const lower = new Set<string>();
  for (const text of texts) {
    for (const [word] of text.matchAll(/(?<!^|[.!?:]\s+|[\p{L}\p{N}'’])\p{Lu}[\p{Ll}\p{M}]+/gmu)) proper.add(word);
    for (const [word] of text.matchAll(/\p{Lu}[\p{Ll}\p{M}]+/gu)) capital.add(word);
    for (const [word] of text.matchAll(/(?<![\p{L}\p{N}])\p{Ll}[\p{Ll}\p{M}]*/gu)) lower.add(word);
  }
  for (const word of capital) if (!lower.has(word.toLowerCase())) proper.add(word);
  return proper;
}

/** A heading in sentence case: a word after the first that is capitalized
 *  only as a title capitalizes it goes to lower case. */
function sentenceCase(heading: string, proper: Set<string>): string {
  return heading.replace(/(?<=\S\s+)\p{Lu}[\p{Ll}\p{M}]+/gu, (word) => (proper.has(word) ? word : word.toLowerCase()));
}

/** The person's notes as separate lines, without list marks or heading
 *  marks, which the notes give back word for word. */
export function personLines(mine: string): string[] {
  return mine
    .split(/\r?\n/)
    .map((l) =>
      l
        .replace(/^\s*#{1,6}\s+/, '')
        .replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/, '')
        .trim(),
    )
    .filter((l) => l.length > 0);
}

/** A task's owner as the model gives it, kept only when the meeting said
 *  that name: each word of it that does not start in lower case is in the
 *  spoken words, the person's notes or a speaker's name. */
const named = (who: string, said: string) => {
  const words = who.split(/[\s,]+/).filter((w) => w && !/^\p{Ll}/u.test(w));
  return words.length > 0 && words.every((w) => said.includes(w)) ? who : '';
};

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const model = (text: string) => `<span data-model>${escapeHtml(text.trim())}</span>`;

export class Writer {
  constructor(private readonly ctx: AppContext) {}

  /** The chat model's window in tokens, where its provider states it. */
  private async window(): Promise<number | null> {
    const { cards, chosen } = await this.ctx.models.list({ kind: 'chat' });
    const picked = chosen.chat;
    if (!picked || picked.card === null) {
      throw new Error(picked?.reason ?? 'No chat model can write the notes. Choose one in Settings > Apps > Meeting notes.');
    }
    return cards.find((c) => c.id === picked.card)?.contextTokens ?? null;
  }

  /** One request for JSON that matches the schema, answered parsed. */
  private async ask<T>(
    messages: ChatMessage[],
    name: string,
    schema: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<T> {
    let text = '';
    // A model that reasons first can spend its whole window on reasoning
    // before the answer starts; the notes need none.
    for await (const delta of this.ctx.models.complete(
      {
        messages,
        format: { name, schema },
        reasoning: 'none',
        sampling: { temperature: 0.2 },
      },
      signal,
    )) {
      if ('text' in delta) {
        if (!delta.reasoning) text += delta.text;
      } else if (delta.stop === 'error') {
        throw new Error(delta.error ?? 'The chat model stopped before the notes were done. Try again.');
      } else if (delta.stop === 'length') {
        throw new Error('The chat model could not finish the notes. Try again, or choose a larger model in Settings > Apps > Meeting notes.');
      }
    }
    return JSON.parse(text) as T;
  }

  private system(brief: Brief): ChatMessage {
    const language = brief.language
      ? `Write in ${brief.language}.`
      : 'Write in the language most of the meeting was in.';
    return {
      role: 'system',
      content:
        'You write meeting notes from the transcript of a meeting and the notes the person took during it. ' +
        `${language} Write each point in your own words, short: at most 15 words. Never copy a transcript line. ` +
        "Use only what the transcript and the person's notes say: never invent names, numbers or dates. " +
        'Give each point the numbers of the transcript lines it comes from. ' +
        'Answer only with JSON that matches the schema.',
    };
  }

  private facts(brief: Brief): string {
    const day = new Date(brief.meeting.created).toUTCString().slice(0, 16);
    const about = brief.about.trim() ? `\nAbout the person who took the notes: ${brief.about.trim()}` : '';
    return `Meeting: ${brief.meeting.title}\nDate: ${day}\nThe person who took the notes is "${brief.me}" in the transcript.${about}`;
  }

  private shape(template: Template): string {
    if (template.sections.length === 0) {
      return (
        'Choose two to five short headings for the topics of this meeting, and put under them what was said and ' +
        'decided. Write each heading in sentence case: only its first word and names start with a capital letter. ' +
        'Tasks go only in "next", never in a section.'
      );
    }
    const list = template.sections.map((s, i) => `${i + 1}. ${s.heading}: ${s.guide}`).join('\n');
    return `Use exactly these sections, in this order, with these headings:\n${list}`;
  }

  private transcript(lines: Line[], brief: Brief): Extract<ChatContentPart, { type: 'untrusted' }> {
    return {
      type: 'untrusted',
      source: 'the meeting transcript',
      text: lines
        .map((l) => `[${l.n}] ${shortClock(l.start)} ${speakerName(l, brief.meeting, brief.me)}: ${l.text}`)
        .join('\n'),
    };
  }

  private notesPart(person: string[]): string {
    if (person.length === 0) return 'The person took no notes.';
    return `The person's notes, numbered:\n${person.map((l, i) => `${i + 1}. ${l}`).join('\n')}`;
  }

  /** Writes the notes in one request, or in parts when the transcript
   *  does not fit the model's window. */
  async write(brief: Brief, signal: AbortSignal): Promise<Written> {
    const window = await this.window();
    const room = window === null ? null : Math.floor(window * (1 - ANSWER_SHARE));
    const whole = this.transcript(brief.lines, brief).text;
    const fixed = tokens(this.system(brief).content as string) + tokens(this.facts(brief)) + 400;
    const person = personLines(brief.mine);
    const notesTokens = tokens(this.notesPart(person));
    if (room === null || fixed + notesTokens + tokens(whole) <= room) {
      return this.once(brief, person, signal);
    }
    const partRoom = room - fixed - notesTokens;
    if (partRoom < 200) throw new Error('The chat model is too small for these notes. Choose a larger one in Settings > Apps > Meeting notes.');
    return this.inParts(brief, person, partRoom, signal);
  }

  private async once(brief: Brief, person: string[], signal: AbortSignal): Promise<Written> {
    const properties: Record<string, object> = {
      title: { type: 'string' },
      sections: {
        type: 'array',
        items: {
          type: 'object',
          properties: { heading: { type: 'string' }, points: { type: 'array', items: point } },
          required: ['heading', 'points'],
          additionalProperties: false,
        },
      },
      next: { type: 'array', items: step },
    };
    const required = ['title', 'sections', 'next'];
    if (person.length > 0) {
      properties.mine = {
        type: 'array',
        items: { ...detail, properties: { ...detail.properties, section: { type: 'integer' } }, required: ['note', 'section', 'details'] },
      };
      required.push('mine');
    }
    const ask =
      `Write the notes. "title" is a short title for the meeting. ${NEXT}` +
      (person.length > 0
        ? ' In "mine", give each of the person’s notes by its number, the number of the section it belongs to ' +
          '(counted from 1), and up to two details from the transcript about it.'
        : '');
    const answer = await this.ask<{
      title: string;
      sections: { heading: string; points: Point[] }[];
      next: Step[];
      mine?: { note: number; section: number; details: Point[] }[];
    }>(
      [
        this.system(brief),
        {
          role: 'user',
          content: [
            { type: 'text', text: `${this.facts(brief)}\n\n${this.shape(brief.template)}\n\n${this.notesPart(person)}` },
            this.transcript(brief.lines, brief),
            { type: 'text', text: ask },
          ],
        },
      ],
      'notes',
      { type: 'object', properties, required, additionalProperties: false },
      signal,
    );
    const sections = this.headings(brief, answer.sections.map((s) => s.heading)).map((heading, i) => ({
      heading,
      points: answer.sections[i]?.points ?? [],
    }));
    return {
      title: answer.title.trim(),
      markdown: this.render(brief, person, sections, answer.mine ?? [], answer.next),
    };
  }

  private async inParts(brief: Brief, person: string[], partRoom: number, signal: AbortSignal): Promise<Written> {
    const parts: Line[][] = [];
    let part: Line[] = [];
    let size = 0;
    for (const line of brief.lines) {
      const t = tokens(`[${line.n}] 00:00 ${speakerName(line, brief.meeting, brief.me)}: ${line.text}\n`);
      if (part.length > 0 && size + t > partRoom) {
        parts.push(part);
        part = [];
        size = 0;
      }
      part.push(line);
      size += t;
    }
    if (part.length > 0) parts.push(part);

    const points: Point[] = [];
    const next: Step[] = [];
    const details = new Map<number, Point[]>();
    for (const [i, lines] of parts.entries()) {
      const properties: Record<string, object> = {
        points: { type: 'array', items: point },
        next: { type: 'array', items: step },
      };
      const required = ['points', 'next'];
      if (person.length > 0) {
        properties.mine = { type: 'array', items: detail };
        required.push('mine');
      }
      const answer = await this.ask<{ points: Point[]; next: Step[]; mine?: { note: number; details: Point[] }[] }>(
        [
          this.system(brief),
          {
            role: 'user',
            content: [
              { type: 'text', text: `${this.facts(brief)}\n\nThis is part ${i + 1} of ${parts.length} of the transcript.\n\n${this.notesPart(person)}` },
              this.transcript(lines, brief),
              {
                type: 'text',
                text:
                  `List the points of this part in "points". ${NEXT}` +
                  (person.length > 0
                    ? ' In "mine", give details from this part about the person’s notes, by the note’s number.'
                    : ''),
              },
            ],
          },
        ],
        'part',
        { type: 'object', properties, required, additionalProperties: false },
        signal,
      );
      points.push(...answer.points);
      next.push(...answer.next);
      for (const m of answer.mine ?? []) details.set(m.note, [...(details.get(m.note) ?? []), ...m.details]);
    }

    const numbered = points.map((p, i) => `P${i + 1}. ${p.text}`).join('\n');
    const properties: Record<string, object> = {
      title: { type: 'string' },
      sections: {
        type: 'array',
        items: {
          type: 'object',
          properties: { heading: { type: 'string' }, points: { type: 'array', items: { type: 'integer' } } },
          required: ['heading', 'points'],
          additionalProperties: false,
        },
      },
    };
    const required = ['title', 'sections'];
    if (person.length > 0) {
      properties.mine = {
        type: 'array',
        items: {
          type: 'object',
          properties: { note: { type: 'integer' }, section: { type: 'integer' } },
          required: ['note', 'section'],
          additionalProperties: false,
        },
      };
      required.push('mine');
    }
    const answer = await this.ask<{
      title: string;
      sections: { heading: string; points: number[] }[];
      mine?: { note: number; section: number }[];
    }>(
      [
        this.system(brief),
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text:
                `${this.facts(brief)}\n\n${this.shape(brief.template)}\n\n${this.notesPart(person)}\n\n` +
                `The points of the whole meeting, numbered:\n${numbered}\n\n` +
                'Put each point under a section by its number (P3 is 3), leave out repeats, and give a short title ' +
                'for the meeting.' +
                (person.length > 0
                  ? ' In "mine", give each of the person’s notes by its number and the section it belongs to (counted from 1).'
                  : ''),
            },
          ],
        },
      ],
      'sections',
      { type: 'object', properties, required, additionalProperties: false },
      signal,
    );
    const headings = this.headings(brief, answer.sections.map((s) => s.heading));
    const sections = headings.map((heading, i) => ({
      heading,
      points: (answer.sections[i]?.points ?? []).map((n) => points[n - 1]).filter((p): p is Point => !!p),
    }));
    const mine = (answer.mine ?? []).map((m) => ({ ...m, details: details.get(m.note) ?? [] }));
    for (const [note, d] of details) if (!mine.some((m) => m.note === note)) mine.push({ note, section: 1, details: d });
    return { title: answer.title.trim(), markdown: this.render(brief, person, sections, mine, next) };
  }

  /** A template's headings as it names them; Auto's as the model wrote
   *  them, in sentence case. */
  private headings(brief: Brief, written: string[]): string[] {
    if (brief.template.sections.length > 0) return brief.template.sections.map((s) => s.heading);
    const proper = properWords([...brief.lines.map((l) => l.text), brief.mine]);
    for (const name of [brief.me, ...Object.values(brief.meeting.speakers ?? {})]) {
      for (const word of name.split(/\s+/)) proper.add(word);
    }
    const kept = written.map((h) => sentenceCase(h.trim(), proper)).filter((h) => h.length > 0);
    return kept.length > 0 ? kept : ['Notes'];
  }

  /** The notes as Markdown: each section's heading, the person's lines that
   *  belong to it with the details under them, the model's points, then
   *  the next steps as tasks. */
  private render(
    brief: Brief,
    person: string[],
    sections: { heading: string; points: Point[] }[],
    mine: { note: number; section: number; details: Point[] }[],
    next: Step[],
  ): string {
    const byNumber = new Map(brief.lines.map((l) => [l.n, l]));
    const quote = (lines: number[]) => {
      const first = lines.map((n) => byNumber.get(n)).find((l) => l !== undefined);
      return first ? ` ${quoteLink(first.start)}` : '';
    };
    const placed = new Map<number, number[]>();
    for (const m of mine) {
      if (m.note < 1 || m.note > person.length) continue;
      const at = m.section >= 1 && m.section <= sections.length ? m.section - 1 : 0;
      if ([...placed.values()].some((notes) => notes.includes(m.note))) continue;
      placed.set(at, [...(placed.get(at) ?? []), m.note]);
    }
    const unplaced = person.map((_, i) => i + 1).filter((n) => ![...placed.values()].some((ns) => ns.includes(n)));
    if (unplaced.length > 0) placed.set(0, [...(placed.get(0) ?? []), ...unplaced]);
    const detailsOf = new Map(mine.map((m) => [m.note, m.details]));

    const out: string[] = [];
    sections.forEach((s, i) => {
      out.push(`## ${s.heading}`, '');
      for (const note of (placed.get(i) ?? []).sort((a, b) => a - b)) {
        out.push(`- ${person[note - 1]}`);
        for (const d of (detailsOf.get(note) ?? []).slice(0, 2)) {
          if (d.text.trim()) out.push(`  - ${model(d.text)}${quote(d.lines)}`);
        }
      }
      for (const p of s.points) if (p.text.trim()) out.push(`- ${model(p.text)}${quote(p.lines)}`);
      out.push('');
    });
    const steps = next.filter((s) => s.text.trim());
    const said = [
      ...brief.lines.map((l) => l.text),
      ...person,
      brief.me,
      ...Object.values(brief.meeting.speakers ?? {}),
    ].join('\n');
    if (steps.length > 0) {
      out.push('## Next steps', '');
      for (const s of steps) {
        const who = named(s.owner.trim(), said);
        const owner = who ? ` ${model(`(${who})`)}` : '';
        out.push(`- [ ] ${model(s.text)}${owner}${quote(s.lines)}`);
      }
      out.push('');
    }
    return out.join('\n');
  }
}
