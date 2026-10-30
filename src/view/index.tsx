/**
 * The meeting-notes view's start: it connects to its host, reads the
 * meetings and the recording that runs now, and opens the meeting a link
 * names or the one that records.
 */
import { createRoot } from 'react-dom/client';
import { App, PostMessageTransport } from '@modelcontextprotocol/ext-apps';
import type { Meeting } from '../shared/meeting.ts';
import type { Live } from '../backend/recorder.ts';
import { Host } from './host.ts';
import { MeetingNotes } from './MeetingNotes.tsx';
import sheet from './ui.css?inline';

const style = document.createElement('style');
style.textContent = sheet;
document.head.append(style);

const app = new App({ name: 'Meeting notes', version: '2.0.0' }, {}, { autoResize: false });
const host = new Host(app);
await app.connect(new PostMessageTransport(window.parent, window.parent));

const context = app.getHostContext() ?? {};
const extra = context as {
  'openai/deepLink'?: { url: string };
  'hearthscale/settings'?: { name?: string };
};
const locale = context.locale ?? navigator.language;
const timeZone = context.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
const [{ meetings }, { live }] = await Promise.all([
  host.tool<{ meetings: Meeting[] }>('meetings'),
  host.tool<{ live: Live | null }>('recording'),
]);

const root = document.createElement('div');
root.className = 'notes-root';
document.body.append(root);
createRoot(root).render(
  <MeetingNotes
    host={host}
    first={{ list: meetings, live, path: extra['openai/deepLink']?.url ?? null }}
    locale={locale}
    timeZone={timeZone}
    me={extra['hearthscale/settings']!.name!}
  />,
);
