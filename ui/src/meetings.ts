/**
 * The meetings and how the app's store keeps them: the list under
 * `meetings`, newest first, each meeting under `meeting:<id>`, and the
 * meeting last open under `open`.
 */
import type { Platform } from './platform.ts';

/** A meeting in the list. */
export interface MeetingEntry {
  id: string;
  title: string;
}

/** One meeting: its recording, as the WAV assets of its parts in order,
 *  the transcript of each part done so far, the transcription job of the
 *  next part while one runs, why the last one stopped, and the person's
 *  own notes. */
export interface Meeting {
  id: string;
  title: string;
  /** ISO time the meeting was made. */
  created: string;
  seconds: number;
  parts: string[];
  texts: string[];
  job?: string;
  error?: string;
  notes: string;
}

const key = (id: string) => `meeting:${id}`;

/** A new meeting's id: twelve hex digits. */
const newId = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');

/** Each change reads the list and writes it whole, so changes run one
 *  after another. */
export class Meetings {
  private last: Promise<unknown> = Promise.resolve();

  constructor(private readonly platform: Platform) {}

  private inTurn<T>(change: () => Promise<T>): Promise<T> {
    const next = this.last.then(change, change);
    this.last = next.catch(() => undefined);
    return next;
  }

  async list(): Promise<MeetingEntry[]> {
    return (await this.platform.get<MeetingEntry[]>('meetings')) ?? [];
  }

  async get(id: string): Promise<Meeting | null> {
    return this.platform.get<Meeting>(key(id));
  }

  /** A new meeting, named by when it starts, first in the list. */
  create(): Promise<{ meeting: Meeting; list: MeetingEntry[] }> {
    const now = new Date();
    const title = `Meeting, ${now.toLocaleString(undefined, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })}`;
    const meeting: Meeting = {
      id: newId(),
      title,
      created: now.toISOString(),
      seconds: 0,
      parts: [],
      texts: [],
      notes: '',
    };
    return this.inTurn(async () => {
      await this.platform.set(key(meeting.id), meeting);
      const list = [{ id: meeting.id, title }, ...(await this.list())];
      await this.platform.set('meetings', list);
      return { meeting, list };
    });
  }

  /** Keeps a meeting; answers the list, its title brought up to date. */
  save(meeting: Meeting): Promise<MeetingEntry[]> {
    return this.inTurn(async () => {
      await this.platform.set(key(meeting.id), meeting);
      const list = (await this.list()).map((e) =>
        e.id === meeting.id ? { id: e.id, title: meeting.title } : e,
      );
      await this.platform.set('meetings', list);
      return list;
    });
  }

  remove(id: string): Promise<MeetingEntry[]> {
    return this.inTurn(async () => {
      const list = (await this.list()).filter((e) => e.id !== id);
      await this.platform.set('meetings', list);
      await this.platform.delete(key(id));
      return list;
    });
  }

  async lastOpen(): Promise<string | null> {
    return this.platform.get<string>('open');
  }

  async keepOpen(id: string): Promise<void> {
    await this.platform.set('open', id);
  }
}
