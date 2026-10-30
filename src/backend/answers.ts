/**
 * What the app's assistant, other apps and the composer's `@` list read of
 * the meetings: a search of the meetings in the shared index, the list of
 * meetings, and one meeting's notes, the person's notes or its transcript,
 * the transcript in pages.
 *
 * Each part of a meeting is one document of the index, under the source
 * `meeting:<id>:<part>`. A meeting goes into the index when its notes are
 * written or changed, not while it records, so the index's embedding model
 * runs once for each change of a part.
 */
import type { AppContext } from '@hearthscale/app';
import { shortClock, speakerName, type Line, type Meeting } from '../shared/meeting.ts';
import type { Files } from './files.ts';

/** Transcript lines in one page of `read_meeting`. */
const PAGE = 200;

const PARTS = { notes: 'notes', mine: 'my notes', transcript: 'transcript' } as const;

/** Text of a meeting file without what only the app reads: the comments
 *  after transcript lines and the marks around a model's words. */
const plain = (text: string) =>
  text
    .replace(/ <!--[^>]*-->/g, '')
    .replace(/<span data-model>|<\/span>/g, '')
    .trim();

export class Answers {
  constructor(
    private readonly ctx: AppContext,
    private readonly files: Files,
    private readonly me: () => string,
  ) {}

  /** Puts a meeting's parts into the shared index as they are now; an
   *  empty part leaves the index. */
  async put(meeting: Meeting): Promise<void> {
    const lines = (await this.files.lines(meeting.id)).sort((a, b) => a.start - b.start);
    const texts = {
      notes: plain(await this.files.notes(meeting.id)),
      mine: (await this.files.mine(meeting.id)).trim(),
      transcript: lines.map((l) => this.line(l, meeting)).join('\n'),
    };
    const title = meeting.title || meeting.created.slice(0, 10);
    for (const part of Object.keys(PARTS) as (keyof typeof PARTS)[]) {
      const source = `meeting:${meeting.id}:${part}`;
      if (texts[part]) await this.ctx.index!.put({ source, title, pages: [{ text: texts[part] }] });
      else await this.ctx.index!.remove(source);
    }
  }

  async remove(id: string): Promise<void> {
    for (const part of Object.keys(PARTS)) await this.ctx.index!.remove(`meeting:${id}:${part}`);
  }

  async search(query: string, limit: number) {
    const hits = await this.ctx.index!.search(query, limit);
    const meetings = new Map((await this.files.list()).map((m) => [m.id, m]));
    return {
      hits: hits.flatMap((hit) => {
        const m = /^meeting:([^:]+):(notes|mine|transcript)$/.exec(hit.source);
        const meeting = m ? meetings.get(m[1]!) : undefined;
        if (!m || !meeting) return [];
        const part = PARTS[m[2] as keyof typeof PARTS];
        return [{ meeting: meeting.id, title: meeting.title, date: meeting.created, part, text: hit.text }];
      }),
    };
  }

  async list(from: string | undefined, to: string | undefined, words: string | undefined) {
    const lower = words?.toLowerCase();
    const shown = (await this.files.list()).filter(
      (m: Meeting) =>
        (!from || m.created >= from) && (!to || m.created <= to) && (!lower || m.title.toLowerCase().includes(lower)),
    );
    return {
      meetings: shown.map((m) => ({ id: m.id, title: m.title, date: m.created, length: shortClock(m.seconds), state: m.state })),
    };
  }

  async read(id: string, part: 'notes' | 'my notes' | 'transcript', from: number) {
    const meeting = await this.files.meeting(id);
    const head = { id, title: meeting.title, date: meeting.created };
    if (part === 'notes') return { ...head, text: plain(await this.files.notes(id)) };
    if (part === 'my notes') return { ...head, text: plain(await this.files.mine(id)) };
    const lines = (await this.files.lines(id)).sort((a, b) => a.start - b.start);
    const page = lines.slice(from, from + PAGE);
    return {
      ...head,
      lines: lines.length,
      from,
      text: page.map((l) => this.line(l, meeting)).join('\n'),
      ...(from + PAGE < lines.length && { next: from + PAGE }),
    };
  }

  /** A transcript line as the index and the assistant read it. */
  private line(l: Line, meeting: Meeting): string {
    return `[${shortClock(l.start)}] ${speakerName(l, meeting, this.me())}: ${l.text}`;
  }

  /** The meetings whose titles hold the typed words, for the `@` list. */
  async mentions(query: string) {
    const lower = query.toLowerCase();
    const found = (await this.files.list()).filter((m) => m.title.toLowerCase().includes(lower)).slice(0, 20);
    return {
      items: found.map((m) => ({
        uri: `meeting-notes://meeting/${m.id}`,
        name: m.title || m.id,
        title: m.title || `Meeting of ${m.created.slice(0, 10)}`,
      })),
    };
  }
}
