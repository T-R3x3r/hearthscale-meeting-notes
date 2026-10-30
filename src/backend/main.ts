/**
 * The backend of Meeting notes. It keeps the meetings as files, records a
 * meeting with the platform's captures and live transcription, finds the
 * speakers and writes the notes when a recording ends, and starts a
 * recording from the tray, the rail button's menu or a call that begins.
 *
 * The views hear it through events: `live` (the recording's state, or
 * null), `levels`, `line`, `partial`, `meeting` when a meeting's facts
 * change, `notes` when the assistant changed a meeting's notes, and
 * `meetings` when one was deleted.
 *
 * The app's assistant reads the meetings through `search_meetings`,
 * `list_meetings` and `read_meeting`, which other apps can call too, and
 * changes notes through `set_notes`.
 */
import type { AppContext, Backend, ToolRun } from '@hearthscale/app';
import type { Line, Meeting, Side } from '../shared/meeting.ts';
import { AUTO, TEMPLATES, template } from '../shared/templates.ts';
import { Answers } from './answers.ts';
import { Files } from './files.ts';
import { Recording, type Live } from './recorder.ts';
import { sentences } from './sentences.ts';
import { findSpeakers, run } from './speakers.ts';
import { Writer, personLines } from './writer.ts';

/** The settings the manifest declares, as the platform gives them. */
interface Settings {
  name: string;
  about: string;
  language: string;
  notesLanguage: string;
  words: string;
  template: string;
  askOnCall: boolean;
  recordOnCall: boolean;
}

/** The meeting languages of the settings, by the code a transcription
 *  model takes. */
const LANGUAGES: Record<string, string> = {
  English: 'en',
  German: 'de',
  French: 'fr',
  Spanish: 'es',
  Italian: 'it',
  Portuguese: 'pt',
  Dutch: 'nl',
  Polish: 'pl',
  Swedish: 'sv',
  Danish: 'da',
  Norwegian: 'no',
  Finnish: 'fi',
  Japanese: 'ja',
  Chinese: 'zh',
  Korean: 'ko',
};

/** How long a recording that a call started goes on after the call
 *  program lets the microphone go, in ms. */
const CALL_END_MS = 30_000;
/** How long after the last line the transcript file is written, in ms. */
const KEEP_MS = 1000;
/** How long after the last change of a meeting it goes into the index,
 *  in ms, so typing does not embed the meeting again at each pause. */
const INDEX_MS = 30_000;

let ctx: AppContext;
let files: Files;
let writer: Writer;
let answers: Answers;
let settings: Settings;
let recording: { rec: Recording; lines: Line[]; byCall: boolean } | null = null;
let keepTimer: ReturnType<typeof setTimeout> | null = null;
let callEnd: ReturnType<typeof setTimeout> | null = null;
const writing = new Map<string, AbortController>();
const indexing = new Map<string, ReturnType<typeof setTimeout>>();

const emit = (name: string, data: unknown) => void ctx.events!.emit!({ name, data, durable: false });

function words(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

async function readSettings(): Promise<void> {
  settings = (await ctx.settings.get()) as unknown as Settings;
}

/** Puts a meeting into the shared index a while after its last change. */
function reindex(id: string): void {
  clearTimeout(indexing.get(id));
  indexing.set(
    id,
    setTimeout(() => {
      indexing.delete(id);
      void files
        .meeting(id)
        .then((meeting) => answers.put(meeting))
        .catch((e) => ctx.log('warn', `the index did not take the meeting: ${words(e)}`));
    }, INDEX_MS),
  );
}

async function saveMeeting(meeting: Meeting): Promise<void> {
  await files.saveMeeting(meeting);
  emit('meeting', meeting);
}

function keepLines(): void {
  if (keepTimer) return;
  keepTimer = setTimeout(() => {
    keepTimer = null;
    if (recording) void files.saveLines(recording.rec.meeting, recording.lines, settings.name);
  }, KEEP_MS);
}

/** The words the settings ask the transcription to expect. */
function hintWords(): string[] {
  return settings.words
    .split(',')
    .map((w) => w.trim())
    .filter((w) => w.length > 0);
}

/** The id of the microphone the person chose, or undefined for the
 *  system's default; refused when the chosen one is not connected. */
async function microphone(): Promise<string | undefined> {
  const chosen = (await ctx.store!.get('microphone')) as string | null;
  if (!chosen) return undefined;
  const found = (await ctx.capture!.devices('microphone')).find((d) => d.name === chosen);
  if (!found) throw new Error(`The microphone "${chosen}" is not connected. Choose another one.`);
  return found.id;
}

/** Starts recording a meeting, a new one when none is named. */
async function record(id: string | undefined, byCall: boolean): Promise<Meeting> {
  if (recording) {
    if (recording.rec.meeting.id === id) return recording.rec.meeting;
    throw new Error(`"${recording.rec.meeting.title || 'A meeting'}" records now. Stop it first.`);
  }
  const meeting = id ? await files.meeting(id) : await files.create('', new Date());
  const lines = await files.lines(meeting.id);
  const language = LANGUAGES[settings.language];
  const hint = hintWords();
  const device = await microphone();
  const rec = new Recording(
    ctx,
    meeting,
    lines,
    {
      line: (line) => {
        emit('line', { meeting: meeting.id, line });
        keepLines();
      },
      partial: (side: Side, text: string) => emit('partial', { meeting: meeting.id, side, text }),
      levels: (levels) => emit('levels', { meeting: meeting.id, ...levels }),
      ended: (reason) => void finish(reason),
      unheard: (reason) => {
        if (meeting.unheard === reason) return;
        meeting.unheard = reason;
        void saveMeeting(meeting);
      },
      live: (live: Live) => emit('live', live),
    },
    { ...(language && { language }), ...(hint.length > 0 && { words: hint }), ...(device && { device }) },
  );
  delete meeting.stopped;
  delete meeting.unheard;
  recording = { rec, lines, byCall };
  try {
    await rec.start();
  } catch (e) {
    recording = null;
    throw new Error(words(e));
  }
  meeting.state = 'recording';
  await saveMeeting(meeting);
  return meeting;
}

/** Ends the recording, finds the speakers and writes the notes. */
async function finish(reason?: string): Promise<void> {
  const held = recording;
  if (!held) return;
  recording = null;
  if (callEnd) clearTimeout(callEnd);
  callEnd = null;
  const { rec, lines } = held;
  const meeting = rec.meeting;
  meeting.seconds = await rec.stop();
  if (keepTimer) clearTimeout(keepTimer);
  keepTimer = null;
  if (reason) meeting.stopped = reason;
  meeting.state = 'writing';
  await files.saveLines(meeting, lines, settings.name);
  await saveMeeting(meeting);
  emit('live', null);
  try {
    if (await findSpeakers(ctx, rec.sound, lines, 2)) {
      await files.saveLines(meeting, lines, settings.name);
      emit('meeting', meeting);
    }
  } catch (e) {
    await ctx.log('warn', `the speakers were not found: ${words(e)}`);
  } finally {
    for (const s of rec.sound) await ctx.assets.release(s.asset);
  }
  await write(meeting.id, meeting.template ?? defaultTemplate());
}

function defaultTemplate(): string {
  return TEMPLATES.find((t) => t.name === settings.template)?.id ?? AUTO;
}

/** Writes a meeting's notes with a template, one writing at a time for
 *  each meeting; a meeting with no words and no notes of the person's gets
 *  none. */
async function write(id: string, templateId: string): Promise<Meeting> {
  writing.get(id)?.abort();
  const control = new AbortController();
  writing.set(id, control);
  const meeting = await files.meeting(id);
  const shape = template(templateId) ?? (await files.templates()).find((t) => t.id === templateId);
  if (!shape) throw new Error(`There is no template ${templateId}.`);
  const lines = await files.lines(id);
  const mine = await files.mine(id);
  delete meeting.failed;
  if (lines.length === 0 && personLines(mine).length === 0) {
    meeting.state = 'done';
    await saveMeeting(meeting);
    return meeting;
  }
  meeting.state = 'writing';
  meeting.template = shape.id;
  await saveMeeting(meeting);
  try {
    const written = await writer.write(
      {
        meeting,
        lines,
        mine,
        template: shape,
        me: settings.name,
        about: settings.about,
        language: settings.notesLanguage === 'As the meeting' ? null : settings.notesLanguage,
      },
      control.signal,
    );
    if (control.signal.aborted) return meeting;
    await files.saveNotes(id, written.markdown);
    if (!meeting.title && written.title) meeting.title = written.title;
    reindex(id);
  } catch (e) {
    if (control.signal.aborted) return meeting;
    meeting.failed = `The notes were not written: ${words(e)}`;
  } finally {
    if (writing.get(id) === control) writing.delete(id);
  }
  meeting.state = 'done';
  await saveMeeting(meeting);
  return meeting;
}

/** Makes a meeting from a recording the person gave: its transcript from a
 *  transcription job, its speakers, then its notes. The recording is let
 *  go once it is transcribed. */
async function transcribe(asset: string, name: string): Promise<Meeting> {
  const meeting = await files.create(name, new Date());
  meeting.state = 'writing';
  await saveMeeting(meeting);
  void (async () => {
    try {
      const language = LANGUAGES[settings.language];
      const hint = hintWords();
      const job = await run(ctx, 'transcription', {
        audio: asset,
        ...(language && { language }),
        ...(hint.length > 0 && { words: hint }),
      });
      const segments = (job.data as { segments?: { start: number; end: number; text: string }[] } | undefined)?.segments ?? [];
      const lines: Line[] = segments
        .filter((s) => s.text.trim())
        .flatMap(sentences)
        .map((s, i) => ({ n: i + 1, side: 'them', ...s }));
      meeting.seconds = lines.at(-1)?.end ?? 0;
      await files.saveLines(meeting, lines, settings.name);
      try {
        if (await findSpeakers(ctx, [{ side: 'them', asset, offset: 0 }], lines, 1)) {
          await files.saveLines(meeting, lines, settings.name);
        }
      } catch (e) {
        await ctx.log('warn', `the speakers were not found: ${words(e)}`);
      }
      await saveMeeting(meeting);
    } catch (e) {
      meeting.failed = `The recording was not transcribed: ${words(e)}`;
      meeting.state = 'done';
      await saveMeeting(meeting);
      return;
    } finally {
      await ctx.assets.release(asset);
    }
    await write(meeting.id, defaultTemplate());
  })().catch((e) => ctx.log('error', words(e)));
  return meeting;
}

async function notify(title: string, body: string, path: string, action?: { title: string; id: string }) {
  await ctx.notify!({
    title,
    body,
    open: { surface: 'meetings', path },
    ...(action && { actions: [action] }),
  });
}

/** Another program began or stopped using the microphone. */
async function call({ inUse }: { inUse: boolean }): Promise<void> {
  if (inUse) {
    if (callEnd) {
      clearTimeout(callEnd);
      callEnd = null;
    }
    if (recording) {
      recording.byCall = true;
      return;
    }
    if (settings.recordOnCall) {
      const meeting = await record(undefined, true);
      await notify('Recording this call', 'Meeting notes takes notes of this call.', `/meeting/${meeting.id}`, {
        title: 'Stop',
        id: 'stop',
      });
    } else if (settings.askOnCall) {
      await notify('A call started', 'Take notes of this call?', '/call', { title: 'Take notes', id: 'record' });
    }
    return;
  }
  if (!recording?.byCall || callEnd) return;
  const id = recording.rec.meeting.id;
  callEnd = setTimeout(() => {
    callEnd = null;
    void finish();
  }, CALL_END_MS);
  await notify('The call ended', 'The recording stops in 30 seconds.', `/meeting/${id}`, {
    title: 'Keep recording',
    id: 'keep',
  });
}

async function act({ id }: { id: string }): Promise<void> {
  if (id === 'record') await record(undefined, true);
  else if (id === 'stop') await finish();
  else if (id === 'keep' && callEnd) {
    clearTimeout(callEnd);
    callEnd = null;
    if (recording) recording.byCall = false;
  }
}

const input = <T>(value: unknown) => value as T;

const backend: Backend = {
  async activate(context) {
    ctx = context;
    files = new Files(ctx);
    writer = new Writer(ctx);
    answers = new Answers(ctx, files, () => settings.name);
    await readSettings();
    ctx.settings.on('changed', (values) => {
      settings = values as unknown as Settings;
    });
    ctx.capture!.on('chunk', (part) => void recording?.rec.hear(part));
    ctx.capture!.on('ended', ({ capture, reason, asset }) => void recording?.rec.ended(capture, reason, asset));
    ctx.triggers!.on('record', () => void record(undefined, false).catch((e) => ctx.log('warn', words(e))));
    ctx.triggers!.on('call', (data) => void call(data as { inUse: boolean }).catch((e) => ctx.log('warn', words(e))));
    ctx.notifications!.on('action', (press) => void act(press).catch((e) => ctx.log('warn', words(e))));
  },

  tools: {
    async meetings() {
      return { meetings: await files.list() };
    },

    async meeting(raw) {
      const { id } = input<{ id: string }>(raw);
      return {
        meeting: await files.meeting(id),
        mine: await files.mine(id),
        notes: await files.notes(id),
        lines: await files.lines(id),
      };
    },

    async transcribe_recording(raw) {
      const { asset, name } = input<{ asset: string; name: string }>(raw);
      return { meeting: await transcribe(asset, name) };
    },

    async search_meetings(raw) {
      const { query, limit } = input<{ query: string; limit?: number }>(raw);
      return answers.search(query, limit ?? 8);
    },

    async list_meetings(raw) {
      const { from, to, words: titled } = input<{ from?: string; to?: string; words?: string }>(raw);
      return answers.list(from, to, titled);
    },

    async read_meeting(raw) {
      const { id, part, from } = input<{ id: string; part: 'notes' | 'my notes' | 'transcript'; from?: number }>(raw);
      return answers.read(id, part, from ?? 0);
    },

    async set_notes(raw) {
      const { id, markdown } = input<{ id: string; markdown: string }>(raw);
      await files.meeting(id);
      await files.saveNotes(id, markdown);
      reindex(id);
      emit('notes', { id });
      return { saved: true };
    },

    async mention_meetings(raw) {
      const { query } = input<{ query: string }>(raw);
      return answers.mentions(query);
    },

    async new_meeting() {
      return { meeting: await files.create('', new Date()) };
    },

    async rename(raw) {
      const { id, title } = input<{ id: string; title: string }>(raw);
      const meeting = recording?.rec.meeting.id === id ? recording.rec.meeting : await files.meeting(id);
      meeting.title = title.trim();
      await saveMeeting(meeting);
      return { meeting };
    },

    async save_mine(raw) {
      const { id, text } = input<{ id: string; text: string }>(raw);
      await files.saveMine(id, text);
      reindex(id);
      return {};
    },

    async save_notes(raw) {
      const { id, text } = input<{ id: string; text: string }>(raw);
      await files.saveNotes(id, text);
      reindex(id);
      return {};
    },

    async edit_line(raw) {
      const { id, n, text } = input<{ id: string; n: number; text: string }>(raw);
      const live = recording?.rec.meeting.id === id ? recording : null;
      const meeting = live ? live.rec.meeting : await files.meeting(id);
      const lines = live ? live.lines : await files.lines(id);
      const at = lines.findIndex((l) => l.n === n);
      if (at < 0) throw new Error('The transcript has no such line.');
      if (text.trim()) lines[at] = { ...lines[at]!, text: text.trim() };
      else lines.splice(at, 1);
      await files.saveLines(meeting, lines, settings.name);
      if (!live) reindex(id);
      return { lines };
    },

    async name_speaker(raw) {
      const { id, speaker, name } = input<{ id: string; speaker: string; name: string }>(raw);
      const meeting = recording?.rec.meeting.id === id ? recording.rec.meeting : await files.meeting(id);
      const speakers = { ...meeting.speakers };
      if (name.trim()) speakers[speaker] = name.trim();
      else delete speakers[speaker];
      if (Object.keys(speakers).length > 0) meeting.speakers = speakers;
      else delete meeting.speakers;
      await saveMeeting(meeting);
      await files.saveLines(meeting, recording?.rec.meeting.id === id ? recording.lines : await files.lines(id), settings.name);
      reindex(id);
      return { meeting };
    },

    async delete_meeting(raw) {
      const { id } = input<{ id: string }>(raw);
      if (recording?.rec.meeting.id === id) throw new Error('Stop the recording before you delete the meeting.');
      writing.get(id)?.abort();
      clearTimeout(indexing.get(id));
      indexing.delete(id);
      await files.remove(id);
      await answers.remove(id);
      emit('meetings', null);
      return {};
    },

    async record(raw) {
      const { id } = input<{ id?: string }>(raw ?? {});
      return { meeting: await record(id, false) };
    },

    async pause() {
      await recording?.rec.pause();
      if (recording) {
        recording.rec.meeting.state = 'paused';
        recording.rec.meeting.seconds = recording.rec.elapsed;
        await saveMeeting(recording.rec.meeting);
        await files.saveLines(recording.rec.meeting, recording.lines, settings.name);
      }
      return {};
    },

    async resume() {
      if (!recording) throw new Error('No meeting is paused.');
      await recording.rec.start();
      recording.rec.meeting.state = 'recording';
      await saveMeeting(recording.rec.meeting);
      return {};
    },

    async stop() {
      void finish();
      return {};
    },

    async microphones() {
      const devices = await ctx.capture!.devices('microphone');
      return { devices: devices.map((d) => d.name), chosen: ((await ctx.store!.get('microphone')) as string | null) ?? '' };
    },

    async choose_microphone(raw) {
      const { name } = input<{ name: string }>(raw);
      if (name) await ctx.store!.set('microphone', name);
      else await ctx.store!.delete('microphone');
      return {};
    },

    async templates() {
      return { templates: await files.templates() };
    },

    async save_template(raw) {
      const t = input<{ id?: string; name: string; about: string; sections: { heading: string; guide: string }[] }>(raw);
      const id = t.id ?? `own-${Array.from(crypto.getRandomValues(new Uint8Array(3)), (b) => b.toString(16).padStart(2, '0')).join('')}`;
      const saved = { id, name: t.name.trim(), about: t.about.trim(), sections: t.sections.filter((x) => x.heading.trim()) };
      await files.saveTemplate(saved);
      return { template: saved };
    },

    async delete_template(raw) {
      const { id } = input<{ id: string }>(raw);
      await files.removeTemplate(id);
      return {};
    },

    async recipes() {
      return { recipes: (await ctx.skills!.list()).map((r) => ({ name: r.name, title: r.title, text: r.body })) };
    },

    async save_recipe(raw) {
      const { name, title, text } = input<{ name?: string; title: string; text: string }>(raw);
      const words = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      if (!words) throw new Error('A recipe needs a name with letters or digits.');
      const slug = `my-${words}`.slice(0, 64);
      if (name && name !== slug) await ctx.skills!.remove(name);
      await ctx.skills!.add({
        name: slug,
        title: title.trim(),
        description: `Use when the person asks for their recipe "${title.trim()}".`,
        body: text.trim(),
      });
      return { name: slug };
    },

    async delete_recipe(raw) {
      const { name } = input<{ name: string }>(raw);
      await ctx.skills!.remove(name);
      return {};
    },

    async recording() {
      return { live: recording?.rec.live ?? null };
    },

    async write_notes(raw, run: ToolRun) {
      const { id, template: chosen } = input<{ id: string; template: string }>(raw);
      run.signal.addEventListener('abort', () => writing.get(id)?.abort());
      return { meeting: await write(id, chosen) };
    },
  },
};

export default backend;
