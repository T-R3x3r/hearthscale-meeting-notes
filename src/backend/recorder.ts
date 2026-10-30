/**
 * The recording of a meeting: the microphone ("me") and the computer's
 * sound ("them"), each captured by the platform and written into a
 * transcription stream of its own, so each side's lines come apart with
 * no speaker detection. A pause ends the captures and the streams; a
 * resume starts new ones that add to the same transcript, its times going
 * on from where the pause left them.
 *
 * Every capture keeps its whole sound, so that after the meeting a
 * diarization job can tell the speakers of a side apart; the meeting then
 * lets the sound go.
 */
import type { AppContext, CapturedPart, Listening } from '@hearthscale/app';
import type { Line, Meeting, Side } from '../shared/meeting.ts';
import { sentences } from './sentences.ts';

export interface Levels {
  me: number;
  /** Null while the computer's sound is not heard. */
  them: number | null;
}

/** What the view shows of the recording now. */
export interface Live {
  meeting: string;
  state: 'recording' | 'paused';
  /** Seconds recorded before `since`. */
  seconds: number;
  /** When the clock last started, in ms since the epoch; null while paused. */
  since: number | null;
  /** True when the computer's sound has stayed silent while the
   *  microphone heard a voice. */
  quiet: boolean;
}

/** The whole sound of one capture, and the second of the meeting it
 *  starts at. */
export interface Sound {
  side: Side;
  asset: string;
  offset: number;
}

interface Source {
  side: Side;
  capture: string;
  /** The second of the meeting the capture's first sample is at. */
  offset: number;
  stream: Listening;
  done: Promise<void>;
  /** Set once the capture ended: its sound's asset, or null. */
  asset?: string | null;
}

export interface Hooks {
  line(line: Line): void;
  partial(side: Side, text: string): void;
  levels(levels: Levels): void;
  /** The recording must end without the person: why, in words. */
  ended(reason: string): void;
  /** The computer's sound cannot be heard: why, in words. */
  unheard(reason: string): void;
  live(live: Live): void;
}

export interface Options {
  language?: string;
  words?: string[];
  /** The microphone's device id; the system's default when absent. */
  device?: string;
}

/** A level in dBFS as a share from 0 to 1 for the meter. */
const share = (dbfs: number) => Math.max(0, Math.min(1, (dbfs + 60) / 60));
/** How often the levels go to the view, in ms. */
const LEVELS_MS = 200;
/** With no voice on either side for this long, the recording stops. */
const SILENCE_MS = 15 * 60 * 1000;
/** After this long with a voice from the microphone and none from the
 *  computer's sound, the page says so. */
const QUIET_MS = 2 * 60 * 1000;
/** How long a stream's last segments may take after its end. */
const DRAIN_MS = 30_000;

const words = (e: unknown) => (e instanceof Error ? e.message : String(e));

export class Recording {
  private sources: Source[] = [];
  /** The stretch that records now: the seconds recorded before it, and
   *  when its microphone capture started. */
  private stretch: { base: number; startedAt: number } | null = null;
  private seconds: number;
  private began = Date.now();
  private lastVoice = Date.now();
  private heard = { me: false, them: false };
  private levels: Levels = { me: 0, them: null };
  private levelsAt = 0;
  private watch: ReturnType<typeof setInterval> | null = null;
  private quiet = false;
  /** The sound of every capture that ended. */
  readonly sound: Sound[] = [];

  constructor(
    private readonly ctx: AppContext,
    readonly meeting: Meeting,
    private readonly lines: Line[],
    private readonly hooks: Hooks,
    private readonly options: Options,
  ) {
    this.seconds = meeting.seconds;
  }

  get live(): Live {
    return {
      meeting: this.meeting.id,
      state: this.stretch ? 'recording' : 'paused',
      seconds: this.seconds,
      since: this.stretch ? this.stretch.startedAt : null,
      quiet: this.quiet,
    };
  }

  /** The seconds recorded until now. */
  get elapsed(): number {
    return this.stretch ? this.stretch.base + (Date.now() - this.stretch.startedAt) / 1000 : this.seconds;
  }

  /** Starts a stretch of recording: a stream and a capture for each side.
   *  Where the computer cannot give its sound, the stretch records the
   *  microphone alone and says why. */
  async start(): Promise<void> {
    const me = await this.open('me', 'microphone', {
      echo: true,
      keep: true,
      ...(this.options.device && { device: this.options.device }),
    });
    this.sources = [me];
    try {
      this.sources.push(await this.open('them', 'system-sound', { keep: true }));
      this.levels.them = 0;
    } catch (e) {
      this.levels.them = null;
      this.hooks.unheard(words(e));
    }
    this.began = Date.now();
    this.lastVoice = this.began;
    this.watch ??= setInterval(() => this.check(), 10_000);
    this.hooks.live(this.live);
  }

  /** A stream, then its capture, so the stream hears the capture from its
   *  first part. */
  private async open(
    side: Side,
    source: 'microphone' | 'system-sound',
    options: { echo?: boolean; keep: boolean; device?: string },
  ): Promise<Source> {
    const stream = await this.ctx.models!.listen({
      ...(this.options.language && { language: this.options.language }),
      ...(this.options.words?.length && { words: this.options.words }),
    });
    let finish = () => {};
    const done = new Promise<void>((resolve) => (finish = resolve));
    let started: { capture: string; startedAt: number };
    try {
      started = await this.ctx.capture!.start(source, options);
    } catch (e) {
      await stream.close();
      throw e;
    }
    if (!this.stretch) this.stretch = { base: this.seconds, startedAt: started.startedAt };
    const found: Source = {
      side,
      capture: started.capture,
      offset: this.stretch.base + (started.startedAt - this.stretch.startedAt) / 1000,
      stream,
      done,
    };
    stream.on('segment', ({ text, start, end }) => {
      if (!text.trim()) return;
      for (const said of sentences({ start: found.offset + start, end: found.offset + end, text })) {
        const line: Line = { n: this.lines.length + 1, side, ...said };
        this.lines.push(line);
        this.hooks.line(line);
      }
    });
    stream.on('partial', ({ text }) => this.hooks.partial(side, text));
    stream.on('error', ({ message, index }) => {
      if (index !== undefined) void this.ctx.log('warn', `a segment of ${side} failed: ${message}`);
      else if (side === 'them') this.hooks.unheard(message);
      else this.hooks.ended(`The transcription stopped: ${message}`);
    });
    stream.on('done', () => finish());
    return found;
  }

  /** A part of a capture of this recording; false for another capture. */
  hear(part: CapturedPart): boolean {
    if (part.kind !== 'audio') return false;
    const source = this.sources.find((s) => s.capture === part.capture);
    if (!source) return false;
    void source.stream.write(part.pcm);
    if (part.voice) {
      this.lastVoice = Date.now();
      this.heard[source.side] = true;
    }
    this.levels[source.side] = share(part.level);
    const now = Date.now();
    if (now - this.levelsAt >= LEVELS_MS) {
      this.levelsAt = now;
      this.hooks.levels({ ...this.levels });
    }
    return true;
  }

  /** A capture of this recording ended without the app; false for
   *  another capture. */
  ended(capture: string, reason: string, asset?: string): boolean {
    const source = this.sources.find((s) => s.capture === capture);
    if (!source) return false;
    source.asset = asset ?? null;
    this.sources = this.sources.filter((s) => s !== source);
    void this.finish([source]);
    if (source.side === 'them') {
      this.levels.them = null;
      this.hooks.unheard(reason);
    } else {
      this.hooks.ended(reason);
    }
    return true;
  }

  private check(): void {
    if (!this.stretch) return;
    const now = Date.now();
    if (now - this.lastVoice > SILENCE_MS) {
      this.hooks.ended('The recording stopped after 15 minutes with no sound.');
      return;
    }
    const quiet =
      this.levels.them !== null && this.heard.me && !this.heard.them && now - this.began > QUIET_MS;
    if (quiet !== this.quiet) {
      this.quiet = quiet;
      this.hooks.live(this.live);
    }
  }

  /** Ends the streams of sources whose captures ended, waits for their
   *  last lines, and keeps their sound. */
  private async finish(sources: Source[]): Promise<void> {
    await Promise.all(
      sources.map(async (s) => {
        await s.stream.end();
        await Promise.race([s.done, new Promise((r) => setTimeout(r, DRAIN_MS))]);
        if (s.asset) this.sound.push({ side: s.side, asset: s.asset, offset: s.offset });
      }),
    );
  }

  /** Ends the stretch: stops its captures, then waits for its last lines. */
  async pause(): Promise<void> {
    if (!this.stretch) return;
    this.seconds = this.elapsed;
    this.stretch = null;
    const ending = this.sources;
    this.sources = [];
    for (const source of ending) {
      const asset = await this.ctx.capture!.stop(source.capture);
      source.asset = typeof asset === 'string' ? asset : null;
    }
    await this.finish(ending);
    this.levels = { me: 0, them: this.levels.them === null ? null : 0 };
    this.hooks.live(this.live);
  }

  /** Ends the recording for good; answers the seconds it recorded. */
  async stop(): Promise<number> {
    await this.pause();
    if (this.watch) clearInterval(this.watch);
    this.watch = null;
    return this.seconds;
  }
}
