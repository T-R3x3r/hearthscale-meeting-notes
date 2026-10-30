/**
 * What the app's assistant, other apps and the composer's `@` list read of
 * the meetings: a search of the meeting files in the shared index, the
 * list of meetings, and one meeting's notes, the person's notes or its
 * transcript, the transcript in pages.
 */
import type { AppContext } from '@hearthscale/app';
import { MEETINGS, shortClock, speakerName, type Meeting } from '../shared/meeting.ts';
import type { Files } from './files.ts';

/** Transcript lines in one page of `read_meeting`. */
const PAGE = 200;

const FILES: Record<string, string> = {
  'notes.md': 'notes',
  'my-notes.md': 'my notes',
  'transcript.md': 'transcript',
};

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

  /** Keeps every meeting file in the shared index. */
  async watch(): Promise<void> {
    await this.ctx.fs.mkdir({ root: 'data', path: MEETINGS });
    await this.ctx.index!.watch({ root: 'data', path: MEETINGS });
  }

  async search(query: string, limit: number) {
    const hits = await this.ctx.index!.search(query, limit);
    const meetings = new Map((await this.files.list()).map((m) => [m.id, m]));
    return {
      hits: hits.flatMap((hit) => {
        const m = /meetings\/([^/]+)\/([^/]+)$/.exec(hit.source);
        const meeting = m ? meetings.get(m[1]!) : undefined;
        if (!m || !meeting) return [];
        return [{ meeting: meeting.id, title: meeting.title, date: meeting.created, part: FILES[m[2]!] ?? m[2], text: plain(hit.text) }];
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
      text: page.map((l) => `[${shortClock(l.start)}] ${speakerName(l, meeting, this.me())}: ${l.text}`).join('\n'),
      ...(from + PAGE < lines.length && { next: from + PAGE }),
    };
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
