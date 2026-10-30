/**
 * Dates and lengths the way the person reads them, in the locale and time
 * zone of the computer they use.
 */
import type { Meeting } from '../shared/meeting.ts';

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
