/**
 * Who spoke when, after the meeting. A diarization job hears the sound of
 * one side, joined across the meeting's pauses into one recording so that
 * a speaker keeps one number, and each line of that side takes the speaker
 * whose turns cover most of it, or the speaker of the nearest turn.
 *
 * The side is the computer's sound when it carried a line, as the people
 * on the far side of a call share it; else the microphone, as in a meeting
 * in one room.
 */
import type { AppContext, Job } from '@hearthscale/app';
import type { Line, Side } from '../shared/meeting.ts';
import type { Sound } from './recorder.ts';

interface Turn {
  start: number;
  end: number;
  speaker: number;
}

const RATE = 16_000;

/** The PCM samples of a 16-bit WAV file, after its header. */
function samples(wav: Uint8Array): Uint8Array {
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  let at = 12;
  while (at + 8 <= wav.length) {
    const id = String.fromCharCode(wav[at]!, wav[at + 1]!, wav[at + 2]!, wav[at + 3]!);
    const size = view.getUint32(at + 4, true);
    if (id === 'data') return wav.subarray(at + 8, Math.min(wav.length, at + 8 + size));
    at += 8 + size + (size % 2);
  }
  throw new Error('a recording holds no sound');
}

/** A mono 16-bit WAV file of PCM at 16 kHz. */
function wav(pcm: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(44 + pcm.length);
  const view = new DataView(bytes.buffer);
  const text = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i));
  };
  text(0, 'RIFF');
  view.setUint32(4, 36 + pcm.length, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, RATE, true);
  view.setUint32(28, RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, pcm.length, true);
  bytes.set(pcm, 44);
  return bytes;
}

/** Runs a job to its end; answers it, or rejects with why it failed. The
 *  signal cancels the job. */
export async function run(ctx: AppContext, kind: string, input: Record<string, unknown>, signal: AbortSignal): Promise<Job> {
  const jobs = ctx.jobs;
  const job = await jobs.submit({ kind, input });
  return new Promise<Job>((resolve, reject) => {
    const settle = (now: Job) => {
      if (now.id !== job.id || now.status === 'queued' || now.status === 'running') return;
      stop();
      signal.removeEventListener('abort', cancel);
      if (now.status === 'completed') resolve(now);
      else reject(new Error(now.error ?? `the ${kind} job was ${now.status}`));
    };
    const cancel = () => void jobs.cancel(job.id).catch(() => undefined);
    const stop = jobs.on('progress', settle);
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) cancel();
    void jobs.get(job.id).then(settle, reject);
  });
}

/** One recording of a side: the parts of a meeting's captures, which share
 *  one rate, joined in order; a single sound as it is. Each piece maps a
 *  stretch of the recording to the second of the meeting it starts at. */
async function recording(
  ctx: AppContext,
  parts: Sound[],
): Promise<{ asset: string; joined: boolean; pieces: { from: number; to: number; offset: number }[] }> {
  if (parts.length === 1) {
    return { asset: parts[0]!.asset, joined: false, pieces: [{ from: 0, to: Infinity, offset: parts[0]!.offset }] };
  }
  const pcm: Uint8Array[] = [];
  const pieces: { from: number; to: number; offset: number }[] = [];
  let length = 0;
  for (const part of parts) {
    const { bytes } = await ctx.assets.get(part.asset);
    const body = samples(bytes);
    pieces.push({ from: length / 2 / RATE, to: (length + body.length) / 2 / RATE, offset: part.offset });
    pcm.push(body);
    length += body.length;
  }
  const whole = new Uint8Array(length);
  let at = 0;
  for (const body of pcm) {
    whole.set(body, at);
    at += body.length;
  }
  return { asset: await ctx.assets.put(wav(whole), 'audio/wav', 'speakers.wav'), joined: true, pieces };
}

/** The turn closest in time to a line that no turn covers. */
function nearest(turns: Turn[], line: Line): Turn {
  const gap = (t: Turn) => Math.max(t.start - line.end, line.start - t.end);
  return turns.reduce((best, t) => (gap(t) < gap(best) ? t : best));
}

/** Gives every line of one side a speaker when the diarization job finds
 *  at least `least` of them; answers whether it did. */
export async function findSpeakers(
  ctx: AppContext,
  sound: Sound[],
  lines: Line[],
  least: number,
  signal: AbortSignal,
): Promise<boolean> {
  const side: Side = lines.some((l) => l.side === 'them') ? 'them' : 'me';
  const parts = sound.filter((s) => s.side === side).sort((a, b) => a.offset - b.offset);
  if (parts.length === 0 || !lines.some((l) => l.side === side)) return false;
  const { asset, joined, pieces } = await recording(ctx, parts);
  try {
    const job = await run(ctx, 'diarization', { audio: asset }, signal);
    const turns = ((job.data as { turns?: Turn[] } | undefined)?.turns ?? []).map((t) => {
      const piece = pieces.find((p) => t.start >= p.from && t.start < p.to) ?? pieces[pieces.length - 1]!;
      const shift = piece.offset - piece.from;
      return { start: t.start + shift, end: t.end + shift, speaker: t.speaker };
    });
    if (new Set(turns.map((t) => t.speaker)).size < least) return false;
    for (const line of lines) {
      if (line.side !== side) continue;
      const cover = new Map<number, number>();
      for (const t of turns) {
        const overlap = Math.min(line.end, t.end) - Math.max(line.start, t.start);
        if (overlap > 0) cover.set(t.speaker, (cover.get(t.speaker) ?? 0) + overlap);
      }
      const best = [...cover.entries()].sort((a, b) => b[1] - a[1])[0];
      line.speaker = `s${best ? best[0] : nearest(turns, line).speaker}`;
    }
    return true;
  } finally {
    if (joined) await ctx.assets.release(asset);
  }
}
