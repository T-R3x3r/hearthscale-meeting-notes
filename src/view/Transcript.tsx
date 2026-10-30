/**
 * The transcript in the side panel: the computer's sound at the left and
 * the microphone at the right, each line with its speaker and time, and
 * the words still being spoken at the end. It follows the end while the
 * person has not scrolled up, and scrolls to a moment a quote in the notes
 * names. A line's words can be fixed or the line deleted, and a speaker
 * the diarization found can be given a name.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Popover, TextInput, useFloatingTips } from '@hearthscale/app-ui';
import { shortClock, speakerName, type Line, type Meeting, type Side } from '../shared/meeting.ts';
import { IconAction } from './parts.tsx';

/** How near the end the list must be, in pixels, to follow it. */
const END_PX = 48;

export function Transcript({
  meeting,
  lines,
  partial,
  me,
  focus,
  onEdit,
  onName,
}: {
  meeting: Meeting;
  lines: Line[];
  partial: Record<Side, string>;
  me: string;
  focus: number | null;
  /** Fixes a line's words; empty words delete the line. */
  onEdit: (n: number, text: string) => void;
  /** Names a speaker; an empty name takes the name away. */
  onName: (speaker: string, name: string) => void;
}) {
  const list = useRef<HTMLDivElement | null>(null);
  const following = useRef(true);
  const [editing, setEditing] = useState<number | null>(null);
  const [naming, setNaming] = useState<{ speaker: string; anchor: HTMLElement; name: string } | null>(null);
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

  const name = () => {
    if (!naming) return;
    onName(naming.speaker, naming.name);
    setNaming(null);
  };

  return (
    <div className="notes-transcript">
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
        {ordered.map((l) => {
          const name = speakerName(l, meeting, me);
          const nameTip = tips(`name-${l.n}`, 'Name speaker');
          return (
            <div
              key={l.n}
              data-line={l.n}
              data-side={l.side}
              data-focus={focused?.n === l.n ? 'true' : undefined}
              className="notes-line"
            >
              <span className="notes-line-who">
                {l.speaker ? (
                  <span className="hs-tipwrap" {...nameTip.hover}>
                    <button
                      type="button"
                      className="notes-line-name"
                      onClick={(e) => setNaming({ speaker: l.speaker!, anchor: e.currentTarget, name: meeting.speakers?.[l.speaker!] ?? '' })}
                    >
                      {name}
                    </button>
                    {nameTip.tip}
                  </span>
                ) : (
                  name
                )}
                <span className="notes-line-time">{shortClock(l.start)}</span>
                <span className="hs-flex-spacer" />
                <span className="notes-line-acts">
                  <IconAction name="Fix" icon="pencil-line" size="sm" onClick={() => setEditing(l.n)} />
                  <IconAction name="Delete line" icon="delete-bin-line" size="sm" onClick={() => onEdit(l.n, '')} />
                </span>
              </span>
              {editing === l.n ? (
                <TextInput
                  aria-label="Words"
                  autoFocus
                  defaultValue={l.text}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      onEdit(l.n, e.currentTarget.value);
                      setEditing(null);
                    } else if (e.key === 'Escape') setEditing(null);
                  }}
                  onBlur={(e) => {
                    if (e.currentTarget.value !== l.text) onEdit(l.n, e.currentTarget.value);
                    setEditing(null);
                  }}
                />
              ) : (
                <span className="notes-line-text">{l.text}</span>
              )}
            </div>
          );
        })}
        {(['them', 'me'] as const).map(
          (side) =>
            partial[side] && (
              <div key={`partial-${side}`} data-side={side} data-partial="true" className="notes-line">
                <span className="notes-line-text">{partial[side]}</span>
              </div>
            ),
        )}
      </div>
      {naming && (
        <Popover anchor={naming.anchor} label="Name the speaker" onDismiss={() => setNaming(null)}>
          <div className="notes-naming">
            <TextInput
              aria-label="Name"
              data-autofocus
              placeholder={`Speaker ${naming.speaker.slice(1)}`}
              value={naming.name}
              onChange={(e) => setNaming({ ...naming, name: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && name()}
            />
            <Button size="sm" variant="primary" onClick={name}>
              Name
            </Button>
          </div>
        </Popover>
      )}
    </div>
  );
}
