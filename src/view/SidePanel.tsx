/**
 * The panel at the right of the view: the open meeting's transcript, or
 * Ask, where Hearthscale draws the chat of the app's assistant in a slot
 * the panel reserves. Ask keeps one conversation for each meeting, and one
 * about all meetings on the start page; a new conversation about a meeting
 * starts with the meeting as a chip only that chat shows.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon, IconButton, SegmentedControl, useFloatingTips, Button } from '@hearthscale/app-ui';
import type { Line, Meeting, Side } from '../shared/meeting.ts';
import type { Host } from './host.ts';
import { Transcript } from './Transcript.tsx';

export type PanelMode = 'transcript' | 'ask';

const SLOT = 'ask';

/** Questions an empty chat about a meeting offers with one press. */
const STARTERS = [
  { label: 'What did I miss?', text: 'What did I miss in this meeting?' },
  { label: 'Next steps', text: 'List the next steps of this meeting.' },
  { label: 'Follow-up mail', text: 'Write a follow-up mail for this meeting.' },
];

export function SidePanel({
  host,
  mode,
  onMode,
  onClose,
  meeting,
  name,
  lines,
  partial,
  me,
  focus,
  onEdit,
  onName,
}: {
  host: Host;
  mode: PanelMode;
  onMode: (mode: PanelMode) => void;
  onClose: () => void;
  /** The open meeting; null on the start page, where Ask covers all. */
  meeting: Meeting | null;
  /** The open meeting's name as the person reads it. */
  name: string;
  lines: Line[];
  partial: Record<Side, string>;
  me: string;
  focus: number | null;
  onEdit: (n: number, text: string) => void;
  onName: (speaker: string, name: string) => void;
}) {
  const place = useRef<HTMLDivElement | null>(null);
  const [session, setSession] = useState<string | null | undefined>(undefined);
  const key = `ask:${meeting?.id ?? 'all'}`;
  const tips = useFloatingTips();
  const closeTip = tips('close-panel', 'Close');

  useEffect(() => {
    setSession(undefined);
    void host.request<{ value: string | null }>('hearthscale/store/get', { key }).then(({ value }) => setSession(value));
  }, [host, key]);

  useEffect(
    () =>
      host.on<{ id: string; session: string | null }>('hearthscale/ui/slot-session', ({ id, session: now }) => {
        if (id !== SLOT || !now) return;
        setSession(now);
        void host.request('hearthscale/store/set', { key, value: now });
      }),
    [host, key],
  );

  useLayoutEffect(() => {
    const el = place.current;
    if (mode !== 'ask' || !el || session === undefined) {
      void host.request('hearthscale/ui/slots', { slots: [] });
      return;
    }
    const reserve = () => {
      const box = el.getBoundingClientRect();
      void host.request('hearthscale/ui/slots', {
        slots: [
          {
            id: SLOT,
            kind: 'chat',
            session,
            insets: {
              left: box.left,
              top: box.top,
              right: window.innerWidth - box.right,
              bottom: window.innerHeight - box.bottom,
            },
          },
        ],
      });
    };
    reserve();
    const sizes = new ResizeObserver(reserve);
    sizes.observe(el);
    sizes.observe(document.body);
    return () => {
      sizes.disconnect();
      void host.request('hearthscale/ui/slots', { slots: [] });
    };
  }, [host, mode, session]);

  useEffect(() => {
    if (mode !== 'ask' || session !== null || !meeting) return;
    void host.request('ui/update-model-context', {
      content: [
        {
          type: 'text',
          text: `The meeting "${name}", id ${meeting.id}, of ${meeting.created.slice(0, 10)}.`,
          _meta: { 'openai/title': name },
        },
      ],
      _meta: { 'hearthscale/modelContext': { slot: SLOT } },
    });
  }, [host, mode, session, meeting, name]);

  const ask = (text: string) =>
    void host.request('ui/message', { role: 'user', content: [{ type: 'text', text }] });

  return (
    <aside className="notes-panel" data-mode={mode}>
      <div className="notes-panel-bar">
        {meeting ? (
          <SegmentedControl
            label="Panel"
            value={mode}
            options={[
              { value: 'transcript', label: 'Transcript' },
              { value: 'ask', label: 'Ask' },
            ]}
            onChange={onMode}
          />
        ) : (
          <span className="notes-panel-title">Ask</span>
        )}
        <span className="hs-flex-spacer" />
        <span className="hs-tipwrap" {...closeTip.hover}>
          <IconButton aria-label="Close" onClick={onClose}>
            <Icon name="close-line" size={16} />
          </IconButton>
          {closeTip.tip}
        </span>
      </div>
      {mode === 'transcript' && meeting ? (
        <Transcript
          meeting={meeting}
          lines={lines}
          partial={partial}
          me={me}
          focus={focus}
          onEdit={onEdit}
          onName={onName}
        />
      ) : (
        <>
          {session === null && meeting && (
            <div className="notes-starters">
              {STARTERS.map((s) => (
                <Button key={s.label} size="sm" onClick={() => ask(s.text)}>
                  {s.label}
                </Button>
              ))}
            </div>
          )}
          <div ref={place} className="notes-ask" />
        </>
      )}
    </aside>
  );
}
