/**
 * The meeting-notes view's start: it connects to its host, reads the
 * meetings from the app's store, and opens the meeting open last; with no
 * meeting yet it starts the first one.
 */
import { createRoot } from 'react-dom/client';
import { App, PostMessageTransport } from '@modelcontextprotocol/ext-apps';
import { MeetingNotes } from './MeetingNotes.tsx';
import { Meetings } from './meetings.ts';
import { Platform } from './platform.ts';
import sheet from './ui.css?inline';

const style = document.createElement('style');
style.textContent = sheet;
document.head.append(style);

const app = new App({ name: 'Meeting notes', version: '1.0.0' }, {}, { autoResize: false });
await app.connect(new PostMessageTransport(window.parent, window.parent));
const platform = new Platform(app);
const meetings = new Meetings(platform);

let list = await meetings.list();
const last = await meetings.lastOpen();
const id = list.find((e) => e.id === last)?.id ?? list[0]?.id;
let meeting = id ? await meetings.get(id) : null;
if (!meeting) ({ meeting, list } = await meetings.create());

const root = document.createElement('div');
root.className = 'notes-root';
document.body.append(root);
createRoot(root).render(
  <MeetingNotes platform={platform} meetings={meetings} first={{ list, meeting }} />,
);
