/**
 * The recorder: the microphone's sound, mixed to one channel at 16 kHz,
 * the form the Server's transcription takes, kept as 16-bit samples, and
 * written out as WAV files of at most ten minutes each, because a view
 * hands the platform at most 64 MiB at once.
 */

export const RATE = 16_000;
/** The longest part of a recording one WAV file holds, in seconds. */
const PART_SECONDS = 600;
/** Samples the page takes from the sound at a time. */
const BLOCK = 4096;

export class Recorder {
  private readonly blocks: Int16Array[] = [];
  private samples = 0;

  private constructor(
    private readonly stream: MediaStream,
    private readonly audio: AudioContext,
    private readonly tap: ScriptProcessorNode,
  ) {}

  /** Opens the microphone and records until `stop`; `onLevel` hears the
   *  loudness of each block, from 0 to 1. */
  static async start(onLevel: (level: number) => void): Promise<Recorder> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
    const audio = new AudioContext({ sampleRate: RATE });
    const source = audio.createMediaStreamSource(stream);
    const tap = audio.createScriptProcessor(BLOCK, 1, 1);
    const recorder = new Recorder(stream, audio, tap);
    tap.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      const block = new Int16Array(input.length);
      let sum = 0;
      for (let i = 0; i < input.length; i++) {
        const s = Math.max(-1, Math.min(1, input[i]!));
        block[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        sum += s * s;
      }
      recorder.blocks.push(block);
      recorder.samples += block.length;
      onLevel(Math.min(1, Math.sqrt(sum / input.length) * 4));
    };
    source.connect(tap);
    tap.connect(audio.destination);
    return recorder;
  }

  /** How long the recording runs, in seconds. */
  get seconds(): number {
    return this.samples / RATE;
  }

  /** Ends the recording and answers it as WAV files in base64, in order. */
  async stop(): Promise<string[]> {
    this.tap.disconnect();
    for (const track of this.stream.getTracks()) track.stop();
    await this.audio.close();
    const all = new Int16Array(this.samples);
    let at = 0;
    for (const block of this.blocks) {
      all.set(block, at);
      at += block.length;
    }
    const parts: string[] = [];
    const size = PART_SECONDS * RATE;
    for (let start = 0; start < all.length; start += size) {
      parts.push(base64(wav(all.subarray(start, start + size))));
    }
    return parts;
  }
}

/** A mono 16-bit WAV file of samples at `RATE`. */
function wav(samples: Int16Array): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const text = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i));
  };
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
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
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) view.setInt16(44 + i * 2, samples[i]!, true);
  return bytes;
}

function base64(bytes: Uint8Array): string {
  let out = '';
  for (let at = 0; at < bytes.length; at += 0x8000) {
    out += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  }
  return btoa(out);
}
