/**
 * The transcript in the side panel: the computer's sound at the left and
 * the microphone at the right, each turn of a speaker in one bubble with
 * its speaker and time, and the words still being spoken at the end. It
 * follows the end while the person has not scrolled up, and scrolls to a
 * moment a quote in the notes names. A turn's words can be fixed or the
 * turn deleted, and a speaker the diarization found can be given a name.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Popover, TextInput, useFloatingTips } from '@hearthscale/app-ui';
import { shortClock, speakerName, type Line, type Meeting, type Side } from '../shared/meeting.ts';
import { IconAction } from './parts.tsx';

/** How near the end the list must be, in pixels, to follow it. */
const END_PX = 48;

/** The longest pause, in seconds, inside one turn of a speaker. */
const TURN_GAP_S = 3;

/** The lines in order, each run of one speaker's lines a turn. */
function turnsOf(ordered: Line[]): Line[][] {
  const turns: Line[][] = [];
  for (const line of ordered) {
    const turn = turns[turns.length - 1];
    const last = turn?.[turn.length - 1];
    if (turn && last && last.side === line.side && last.speaker === line.speaker && line.start - last.end <= TURN_GAP_S) {
      turn.push(line);
    } else turns.push([line]);
  }
  return turns;
}

export function Transcript({
  meeting,
  lines,
  partial,
  me,
  focus,
  onEdit,
  onDelete,
  onName,
}: {
  meeting: Meeting;
  lines: Line[];
  partial: Record<Side, string>;
  me: string;
  focus: number | null;
  /** Fixes a line's words. */
  onEdit: (n: number, text: string) => void;
  /** Deletes lines by their numbers. */
  onDelete: (ns: number[]) => void;
  /** Names a speaker; an empty name takes the name away. */
  onName: (speaker: string, name: string) => void;
}) {
  const list = useRef<HTMLDivElement | null>(null);
  const following = useRef(true);
  const [editing, setEditing] = useState<number | null>(null);
  const [naming, setNaming] = useState<{ speaker: string; anchor: HTMLElement; name: string } | null>(null);
  const tips = useFloatingTips();
  const ordered = useMemo(() => [...lines].sort((a, b) => a.start - b.start || a.n - b.n), [lines]);
  const turns = useMemo(() => turnsOf(ordered), [ordered]);
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

  /** Keeps a line's changed words; empty words delete the line. */
  const keep = (line: Line, text: string) => {
    if (text === line.text) return;
    if (text.trim()) onEdit(line.n, text);
    else onDelete([line.n]);
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
          <span className="notes-lines-empty">No transcript yet</span>
        )}
        {turns.map((turn) => {
          const first = turn[0]!;
          const who = speakerName(first, meeting, me);
          const nameTip = tips(`name-${first.n}`, 'Name speaker');
          const several = turn.length > 1;
          return (
            <div
              key={first.n}
              data-side={first.side}
              data-focus={focused && turn.includes(focused) ? 'true' : undefined}
              className="notes-line"
            >
              <span className="notes-line-who">
                {first.speaker ? (
                  <span className="hs-tipwrap" {...nameTip.hover}>
                    <button
                      type="button"
                      className="notes-line-name"
                      onClick={(e) =>
                        setNaming({ speaker: first.speaker!, anchor: e.currentTarget, name: meeting.speakers?.[first.speaker!] ?? '' })
                      }
                    >
                      {who}
                    </button>
                    {nameTip.tip}
                  </span>
                ) : (
                  who
                )}
                <span className="notes-line-time">{shortClock(first.start)}</span>
                <span className="hs-flex-spacer" />
                <span className="notes-line-acts">
                  <IconAction
                    name={several ? 'Edit lines' : 'Edit line'}
                    icon="pencil-line"
                    size="sm"
                    onClick={() => setEditing(first.n)}
                  />
                  <IconAction
                    name={several ? 'Delete lines' : 'Delete line'}
                    icon="delete-bin-line"
                    size="sm"
                    onClick={() => onDelete(turn.map((l) => l.n))}
                  />
                </span>
              </span>
              {editing === first.n ? (
                <div
                  className="notes-line-edit"
                  onBlur={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget)) setEditing(null);
                  }}
                >
                  {turn.map((l, i) => (
                    <TextInput
                      key={l.n}
                      aria-label="Words"
                      autoFocus={i === 0}
                      defaultValue={l.text}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') setEditing(null);
                        if (e.key !== 'Enter') return;
                        keep(l, e.currentTarget.value);
                        const inputs = [...(e.currentTarget.closest('.notes-line-edit')?.querySelectorAll('input') ?? [])];
                        const next = inputs[inputs.indexOf(e.currentTarget) + 1];
                        if (next) next.focus();
                        else setEditing(null);
                      }}
                      onBlur={(e) => keep(l, e.currentTarget.value)}
                    />
                  ))}
                </div>
              ) : (
                <span className="notes-line-text">
                  {turn.map((l) => (
                    <span key={l.n} data-line={l.n}>
                      {l.text}{' '}
                    </span>
                  ))}
                </span>
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
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                // The speaker's name takes the focus back as the popover
                // closes; the key must not press it again.
                e.preventDefault();
                name();
              }}
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
