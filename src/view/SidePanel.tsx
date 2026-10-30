/**
 * The panel at the right of the view: the open meeting's transcript, or
 * Ask, where Hearthscale draws the chat of the app's assistant in a slot
 * the panel reserves. Ask keeps one conversation for each meeting, named
 * after it, and one about all meetings on the start page; the panel makes
 * the conversation when Ask first opens there, and a meeting's starts
 * with the meeting as a chip only that chat shows. The first chat slot of
 * a rail tab shows the conversation the tab holds, so the panel opens the
 * conversation in the tab as well.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button, SegmentedControl } from '@hearthscale/app-ui';
import { shortClock, speakerName, type Line, type Meeting, type Side } from '../shared/meeting.ts';
import type { Host } from './host.ts';
import { IconAction } from './parts.tsx';
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
  const [session, setSession] = useState<string | undefined>(undefined);
  const [fresh, setFresh] = useState(false);
  const [round, setRound] = useState(0);
  const [copied, setCopied] = useState(false);
  const key = `ask:${meeting?.id ?? 'all'}`;

  const copy = async () => {
    if (!meeting) return;
    const ordered = [...lines].sort((a, b) => a.start - b.start || a.n - b.n);
    await navigator.clipboard.writeText(
      ordered.map((l) => `${speakerName(l, meeting, me)} (${shortClock(l.start)}): ${l.text}`).join('\n'),
    );
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  /** Whether the person has sent nothing in the conversation yet. */
  const check = async (id: string) => {
    const { entries } = await host.request<{ entries: { type: string }[] }>('hearthscale/sessions/entries', { id });
    setFresh(!entries.some((e) => e.type === 'user.message'));
  };

  useEffect(() => {
    if (mode !== 'ask') return;
    let gone = false;
    setSession(undefined);
    void (async () => {
      const { value } = await host.request<{ value: string | null }>('hearthscale/store/get', { key });
      let id = value;
      if (!id) {
        const { session: made } = await host.request<{ session: { id: string } }>('hearthscale/sessions/create', {
          title: meeting ? name : 'All meetings',
        });
        await host.request('hearthscale/store/set', { key, value: made.id });
        id = made.id;
      }
      await check(id);
      if (gone) return;
      await host.request('hearthscale/surfaces/open', { session: id });
      setSession(id);
    })();
    return () => {
      gone = true;
    };
  }, [host, key, mode, meeting, name, round]);

  useEffect(() => {
    const offs = [
      host.on<{ id: string }>('hearthscale/sessions/deleted', ({ id }) => {
        if (id !== session) return;
        void host.request('hearthscale/store/delete', { key }).then(() => setRound((r) => r + 1));
      }),
      host.on<{ session: { id: string } }>('hearthscale/sessions/changed', ({ session: changed }) => {
        if (changed.id === session) void check(changed.id);
      }),
      host.on<{ id: string; session: string | null }>('hearthscale/ui/slot-session', ({ id, session: now }) => {
        if (id !== SLOT || !now || now === session) return;
        setSession(now);
        void host.request('hearthscale/store/set', { key, value: now });
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [host, key, session]);

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
    if (mode !== 'ask' || !session || !fresh || !meeting) return;
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
  }, [host, mode, session, fresh, meeting, name]);

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
        {mode === 'transcript' && meeting && lines.length > 0 && (
          <IconAction
            name={copied ? 'Copied' : 'Copy transcript'}
            icon={copied ? 'check-line' : 'file-copy-line'}
            onClick={() => void copy()}
          />
        )}
        <IconAction name="Close" icon="close-line" onClick={onClose} />
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
          {fresh && meeting && (
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
