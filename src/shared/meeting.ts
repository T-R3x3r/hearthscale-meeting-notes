/**
 * A meeting as files in the app's data folder, one folder per meeting under
 * `meetings/<id>/`, each file plain Markdown that any program reads:
 *
 * - `meeting.md`: front matter with the meeting's facts, then its title.
 * - `my-notes.md`: what the person wrote.
 * - `notes.md`: the notes the model wrote from both; a model's words sit
 *   in `<span data-model>`, and a link `[mm:ss](#t<seconds>)` points at the
 *   moment of the transcript they came from.
 * - `transcript.md`: one line per stretch of speech, its speaker, its time
 *   and its words, then a comment that Markdown readers do not show, with
 *   the line's number, side, start and end in seconds and speaker key.
 *
 * The form only grows: a later version adds keys and files, and reads
 * every file an earlier one wrote.
 */

/** Who a line came from: the person's microphone, or the computer's sound. */
export type Side = 'me' | 'them';

export interface Line {
  /** Counted from 1 in the order the lines were heard. */
  n: number;
  side: Side;
  /** Seconds from the start of the recording. */
  start: number;
  end: number;
  text: string;
  /** The speaker diarization found, such as `s2`, the same on both sides
   *  of one meeting. */
  speaker?: string;
}

/** Where a meeting stands: before its recording, while it records or
 *  pauses, while its notes are written, and once they are there. */
/** `transcribing`, `speakers` and `writing` are the steps after a meeting
 *  ends: its words, its speakers, then its notes. */
export type MeetingState = 'new' | 'recording' | 'paused' | 'transcribing' | 'speakers' | 'writing' | 'done';

/** The states in which the app works on a meeting by itself. */
export const BUSY: MeetingState[] = ['transcribing', 'speakers', 'writing'];

export interface Meeting {
  id: string;
  /** '' until the person or the notes give the meeting a title. */
  title: string;
  /** ISO time the meeting was made. */
  created: string;
  /** Seconds of sound recorded. */
  seconds: number;
  state: MeetingState;
  /** ISO time the work under way began, while the state is one of BUSY. */
  since?: string;
  /** The template the notes were last written with. */
  template?: string;
  /** Why the recording ended before the person stopped it. */
  stopped?: string;
  /** Why the computer's sound was not heard. */
  unheard?: string;
  /** Why the notes could not be written. */
  failed?: string;
  /** The names the person gave the speakers, by speaker key. */
  speakers?: Record<string, string>;
}

export const MEETINGS = 'meetings';

export const meetingFolder = (id: string) => `${MEETINGS}/${id}`;
export const meetingPath = (id: string) => `${meetingFolder(id)}/meeting.md`;
export const minePath = (id: string) => `${meetingFolder(id)}/my-notes.md`;
export const notesPath = (id: string) => `${meetingFolder(id)}/notes.md`;
export const transcriptPath = (id: string) => `${meetingFolder(id)}/transcript.md`;

const FENCE = '---';

/** `meeting.md`: each fact on a line of its own as `key: <JSON>`, which
 *  is also YAML, then the title as a heading. */
export function writeMeeting(meeting: Meeting): string {
  const facts = Object.entries(meeting)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
  const heading = meeting.title.replace(/\n/g, ' ') || `Meeting of ${meeting.created.slice(0, 10)}`;
  return `${FENCE}\n${facts.join('\n')}\n${FENCE}\n\n# ${heading}\n`;
}

export function readMeeting(text: string): Meeting {
  const lines = text.split(/\r?\n/);
  if (lines[0] !== FENCE) throw new Error('meeting.md does not start with its facts');
  const facts: Record<string, unknown> = {};
  for (const line of lines.slice(1)) {
    if (line === FENCE) break;
    const at = line.indexOf(': ');
    if (at < 0) continue;
    facts[line.slice(0, at)] = JSON.parse(line.slice(at + 2));
  }
  return facts as unknown as Meeting;
}

/** A time from the start of the recording, as `hh:mm:ss`. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(Math.floor(s / 3600))}:${two(Math.floor((s % 3600) / 60))}:${two(s % 60)}`;
}

/** The day a meeting was made, in words, in the person's locale and time
 *  zone: its weekday, day, month and year. */
export function dayOf(iso: string, locale: string, timeZone: string): string {
  return new Date(iso).toLocaleDateString(locale, { timeZone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

/** A time as `m:ss`, or `h:mm:ss` from an hour on. */
export function shortClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const ss = String(s % 60).padStart(2, '0');
  if (s < 3600) return `${Math.floor(s / 60)}:${ss}`;
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${ss}`;
}

/** The name a line shows: the name the person gave its speaker, else the
 *  speaker's number, else the person's own name or "Them" by its side. */
export function speakerName(line: Line, meeting: Meeting, me: string): string {
  if (line.speaker) {
    return meeting.speakers?.[line.speaker] ?? `Speaker ${line.speaker.slice(1)}`;
  }
  return line.side === 'me' ? me : 'Them';
}

const LINE =
  /^\*\*(.*?)\*\* (\d\d:\d\d:\d\d): (.*) <!-- (\d+) (me|them) (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)(?: (s\d+))? -->$/;

/** The words of a line, kept from closing the comment that follows them. */
const safe = (text: string) => text.replace(/-->/g, '- ->').replace(/\s*\n\s*/g, ' ');

export function writeTranscript(lines: Line[], meeting: Meeting, me: string): string {
  const body = lines.map(
    (l) =>
      `**${speakerName(l, meeting, me)}** ${clock(l.start)}: ${safe(l.text)} ` +
      `<!-- ${l.n} ${l.side} ${l.start.toFixed(2)} ${l.end.toFixed(2)}${l.speaker ? ` ${l.speaker}` : ''} -->`,
  );
  return `# Transcript\n\n${body.join('\n\n')}\n`;
}

export function readTranscript(text: string): Line[] {
  const lines: Line[] = [];
  for (const row of text.split(/\r?\n/)) {
    const m = LINE.exec(row);
    if (!m) continue;
    const line: Line = {
      n: Number(m[4]),
      side: m[5] as Side,
      start: Number(m[6]),
      end: Number(m[7]),
      text: m[3]!,
    };
    if (m[8]) line.speaker = m[8];
    lines.push(line);
  }
  return lines;
}

/** A new meeting's id: the day it was made, then six hex digits. */
export function newId(now: Date): string {
  const day = now.toISOString().slice(0, 10);
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(3)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
  return `${day}-${hex}`;
}

/** The link the notes put after a model's words: the moment of the
 *  transcript they came from. */
export const quoteLink = (seconds: number) =>
  `[${shortClock(seconds)}](#t${seconds.toFixed(1)})`;

/** The seconds a quote link points at, or null for another link. */
export function quoteSeconds(href: string): number | null {
  const m = /^#t(\d+(?:\.\d+)?)$/.exec(href);
  return m ? Number(m[1]) : null;
}
