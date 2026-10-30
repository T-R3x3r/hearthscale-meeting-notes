/**
 * The meetings in the app's data folder: each meeting's Markdown files,
 * read and written whole through `ctx.fs` on the `data` mount.
 */
import type { AppContext } from '@hearthscale/app';
import {
  MEETINGS,
  meetingFolder,
  meetingPath,
  minePath,
  newId,
  notesPath,
  readMeeting,
  readTranscript,
  transcriptPath,
  writeMeeting,
  writeTranscript,
  type Line,
  type Meeting,
} from '../shared/meeting.ts';
import { TEMPLATES_FOLDER, readTemplate, templatePath, writeTemplate } from '../shared/own.ts';
import type { Template } from '../shared/templates.ts';

const data = (path: string) => ({ root: 'data', path });
const decoder = new TextDecoder();

export class Files {
  constructor(private readonly ctx: AppContext) {}

  /** A file's text, or '' for a file that is not there. */
  private async text(path: string): Promise<string> {
    if (!(await this.ctx.fs.stat(data(path)))) return '';
    return decoder.decode(await this.ctx.fs.readBytes(data(path)));
  }

  /** Every meeting, newest first. */
  async list(): Promise<Meeting[]> {
    if (!(await this.ctx.fs.stat(data(MEETINGS)))) return [];
    const { dirs } = await this.ctx.fs.list(data(MEETINGS));
    const meetings: Meeting[] = [];
    for (const id of dirs) {
      const text = await this.text(meetingPath(id));
      if (text) meetings.push(readMeeting(text));
    }
    return meetings.sort((a, b) => b.created.localeCompare(a.created));
  }

  async meeting(id: string): Promise<Meeting> {
    const text = await this.text(meetingPath(id));
    if (!text) throw new Error('This meeting no longer exists.');
    return readMeeting(text);
  }

  async create(title: string, now: Date): Promise<Meeting> {
    const meeting: Meeting = {
      id: newId(now),
      title,
      created: now.toISOString(),
      seconds: 0,
      state: 'new',
    };
    await this.ctx.fs.mkdir(data(meetingFolder(meeting.id)));
    await this.saveMeeting(meeting);
    return meeting;
  }

  async saveMeeting(meeting: Meeting): Promise<void> {
    await this.ctx.fs.write(data(meetingPath(meeting.id)), writeMeeting(meeting));
  }

  async remove(id: string): Promise<void> {
    await this.ctx.fs.remove(data(meetingFolder(id)), { recursive: true });
  }

  async lines(id: string): Promise<Line[]> {
    return readTranscript(await this.text(transcriptPath(id)));
  }

  async saveLines(meeting: Meeting, lines: Line[], me: string): Promise<void> {
    const ordered = [...lines].sort((a, b) => a.start - b.start || a.n - b.n);
    await this.ctx.fs.write(data(transcriptPath(meeting.id)), writeTranscript(ordered, meeting, me));
  }

  mine(id: string): Promise<string> {
    return this.text(minePath(id));
  }

  async saveMine(id: string, text: string): Promise<void> {
    await this.ctx.fs.write(data(minePath(id)), text);
  }

  notes(id: string): Promise<string> {
    return this.text(notesPath(id));
  }

  async saveNotes(id: string, text: string): Promise<void> {
    await this.ctx.fs.write(data(notesPath(id)), text);
  }

  /** The person's own templates, by name. */
  async templates(): Promise<Template[]> {
    if (!(await this.ctx.fs.stat(data(TEMPLATES_FOLDER)))) return [];
    const { files } = await this.ctx.fs.list(data(TEMPLATES_FOLDER));
    const found: Template[] = [];
    for (const file of files.filter((f) => f.endsWith('.md'))) {
      found.push(readTemplate(await this.text(`${TEMPLATES_FOLDER}/${file}`)));
    }
    return found.sort((a, b) => a.name.localeCompare(b.name));
  }

  async saveTemplate(template: Template): Promise<void> {
    await this.ctx.fs.mkdir(data(TEMPLATES_FOLDER));
    await this.ctx.fs.write(data(templatePath(template.id)), writeTemplate(template));
  }

  async removeTemplate(id: string): Promise<void> {
    await this.ctx.fs.remove(data(templatePath(id)));
  }
}
