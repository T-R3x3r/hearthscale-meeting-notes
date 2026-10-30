/**
 * Dates and lengths the way the person reads them, in the locale and time
 * zone of the computer they use.
 */
import { shortClock, speakerName, type Line, type Meeting } from '../shared/meeting.ts';

/** When a meeting was made, such as "30 Oct, 14:05". */
export function when(iso: string, locale: string, timeZone: string): string {
  return new Date(iso).toLocaleString(locale, {
    timeZone,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** A meeting's name: its title, or else "Meeting" and when it was made. */
export function label(meeting: Meeting, locale: string, timeZone: string): string {
  return meeting.title || `Meeting, ${when(meeting.created, locale, timeZone)}`;
}

/** Notes as Markdown any program shows the same: without the marks around
 *  the model's words, and with each quote's link as its time alone. */
export function plainNotes(markdown: string): string {
  return markdown
    .replace(/<span data-model>|<\/span>/g, '')
    .replace(/\[(\d+(?::\d\d){1,2})\]\(#t[\d.]+\)/g, '($1)')
    .trim();
}

/** A meeting as one Markdown file: its title and time, the notes, the
 *  person's notes and the transcript. */
export function exported(
  meeting: Meeting,
  notes: string,
  mine: string,
  lines: Line[],
  me: string,
  locale: string,
  timeZone: string,
): string {
  const parts = [`# ${label(meeting, locale, timeZone)}`, when(meeting.created, locale, timeZone)];
  if (notes.trim()) parts.push('## Notes', plainNotes(notes));
  if (mine.trim()) parts.push('## My notes', mine.trim());
  if (lines.length > 0) {
    const ordered = [...lines].sort((a, b) => a.start - b.start);
    parts.push(
      '## Transcript',
      ordered.map((l) => `**${speakerName(l, meeting, me)}** (${shortClock(l.start)}): ${l.text}`).join('\n\n'),
    );
  }
  return `${parts.join('\n\n')}\n`;
}
