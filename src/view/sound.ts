/**
 * A sound file the person picks, made into what a transcription job takes:
 * a mono 16-bit PCM WAV. Such a WAV goes as it is; any other file the
 * browser can decode is mixed down to one channel at 16 kHz.
 */

const RATE = 16_000;

/** Whether the bytes are a WAV file of one channel of 16-bit PCM. */
function isMonoPcm(bytes: ArrayBuffer): boolean {
  if (bytes.byteLength < 44) return false;
  const view = new DataView(bytes);
  const text = (at: number) => String.fromCharCode(...new Uint8Array(bytes, at, 4));
  if (text(0) !== 'RIFF' || text(8) !== 'WAVE' || text(12) !== 'fmt ') return false;
  return view.getUint16(20, true) === 1 && view.getUint16(22, true) === 1 && view.getUint16(34, true) === 16;
}

function wav(samples: Float32Array): Blob {
  const bytes = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(bytes);
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
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([bytes], { type: 'audio/wav' });
}

/** The file as a WAV a transcription job takes. */
export async function forTranscription(file: File): Promise<Blob> {
  const bytes = await file.arrayBuffer();
  if (isMonoPcm(bytes)) return file;
  const decoded = await new AudioContext().decodeAudioData(bytes);
  const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * RATE), RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  return wav((await offline.startRendering()).getChannelData(0));
}
