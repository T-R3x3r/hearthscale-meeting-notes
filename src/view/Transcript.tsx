/**
 * The transcript in the side panel: the computer's sound at the left and
 * the microphone at the right, each line with its speaker and time, and
 * the words still being spoken at the end. It follows the end while the
 * person has not scrolled up, and scrolls to a moment a quote in the notes
 * names.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon, IconButton, useFloatingTips } from '@hearthscale/app-ui';
import { shortClock, speakerName, type Line, type Meeting, type Side } from '../shared/meeting.ts';

/** How near the end the list must be, in pixels, to follow it. */
const END_PX = 48;

export function Transcript({
  meeting,
  lines,
  partial,
  me,
  focus,
}: {
  meeting: Meeting;
  lines: Line[];
  partial: Record<Side, string>;
  me: string;
  focus: number | null;
}) {
  const list = useRef<HTMLDivElement | null>(null);
  const following = useRef(true);
  const [copied, setCopied] = useState(false);
  const tips = useFloatingTips();
  const ordered = useMemo(() => [...lines].sort((a, b) => a.start - b.start || a.n - b.n), [lines]);
  const focused = useMemo(() => {
    if (focus === null) return null;
    let best: Line | null = null;
    for (const l of ordered) if (l.start <= focus + 0.5) best = l;
    return best ?? ordered[0] ?? null;
  }, [focus, ordered]);

  useEffect(() => {
    const el = list.current;
    if (el && following.current && focused === null) el.scrollTop = el.scrollHeight;
  }, [ordered.length, partial.me, partial.them, focused]);

  useEffect(() => {
    if (!focused) return;
    list.current?.querySelector(`[data-line="${focused.n}"]`)?.scrollIntoView({ block: 'center' });
  }, [focused]);

  const copy = async () => {
    const text = ordered.map((l) => `${speakerName(l, meeting, me)} (${shortClock(l.start)}): ${l.text}`).join('\n');
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };
  const copyTip = tips('copy', copied ? 'Copied' : 'Copy transcript');

  return (
    <div className="notes-transcript">
      {ordered.length > 0 && (
        <span className="hs-tipwrap notes-copy" {...copyTip.hover}>
          <IconButton aria-label="Copy transcript" onClick={() => void copy()}>
            <Icon name={copied ? 'check-line' : 'file-copy-line'} size={16} />
          </IconButton>
          {copyTip.tip}
        </span>
      )}
      <div
        ref={list}
        className="hs-scroll notes-lines"
        onScroll={(e) => {
          const el = e.currentTarget;
          following.current = el.scrollHeight - el.scrollTop - el.clientHeight < END_PX;
        }}
      >
        {ordered.length === 0 && !partial.me && !partial.them && (
          <span className="notes-lines-empty">Lines show here as people speak.</span>
        )}
        {ordered.map((l) => (
          <div
            key={l.n}
            data-line={l.n}
            data-side={l.side}
            data-focus={focused?.n === l.n ? 'true' : undefined}
            className="notes-line"
          >
            <span className="notes-line-who">
              {speakerName(l, meeting, me)}
              <span className="notes-line-time">{shortClock(l.start)}</span>
            </span>
            <span className="notes-line-text">{l.text}</span>
          </div>
        ))}
        {(['them', 'me'] as const).map(
          (side) =>
            partial[side] && (
              <div key={`partial-${side}`} data-side={side} data-partial="true" className="notes-line">
                <span className="notes-line-text">{partial[side]}</span>
              </div>
            ),
        )}
      </div>
    </div>
  );
}
