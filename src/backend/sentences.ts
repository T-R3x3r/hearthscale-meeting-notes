/**
 * A stretch of speech as a transcription gives it, cut into its sentences.
 * A transcription times a stretch as a whole, so each sentence takes a
 * share of the stretch's time in proportion to its length; the sentences
 * of a stretch can then belong to different speakers, and a quote points
 * at the sentence it came from.
 */

export interface Spoken {
  start: number;
  end: number;
  text: string;
}

/** A sentence ends at a stop that a space follows, so "2.5" stays whole. */
const END = /(?<=[.!?]["')\]]*)\s+/;

export function sentences({ start, end, text }: Spoken): Spoken[] {
  const parts = text
    .split(END)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (parts.length < 2) return [{ start, end, text: text.trim() }];
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const span = end - start;
  let at = start;
  return parts.map((p) => {
    const from = at;
    at += (span * p.length) / total;
    return { start: from, end: at, text: p };
  });
}
