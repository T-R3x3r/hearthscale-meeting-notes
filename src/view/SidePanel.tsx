/**
 * The panel at the right of the view: the open meeting's transcript, or
 * Ask, where Hearthscale draws the chat of the app's assistant in a slot
 * the panel reserves. Ask keeps one conversation for each meeting, named
 * after it, and one about all meetings on the start page; the panel makes
 * the conversation when Ask first opens there, and a meeting's starts
 * with the meeting as a chip only that chat shows. Until the person
 * sends the first message there, the panel shows Hearthscale's composer
 * alone with the starters above it, both in the panel's middle; then the
 * whole chat. The conversation the slot names becomes the rail tab's
 * conversation too.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button, SegmentedControl } from '@hearthscale/app-ui';
import { shortClock, speakerName, type Line, type Meeting, type Side } from '../shared/meeting.ts';
import type { Host } from './host.ts';
import { IconAction } from './parts.tsx';
import { Transcript } from './Transcript.tsx';

export type PanelMode = 'transcript' | 'ask';

/** The slots of Ask: the whole chat, and the composer alone before a
 *  meeting's first message, which carries the meeting as a chip. */
const CHAT = 'ask';
const OPENING = 'ask-opening';

/** The store's key of the Ask conversation of a meeting, or of the one
 *  about all meetings. */
export const askKey = (meeting: string | null) => `ask:${meeting ?? 'all'}`;

/** Questions an empty chat about a meeting offers with one press. */
const STARTERS = [
  { label: 'Catch me up', text: 'What did I miss in this meeting?' },
  { label: 'List the next steps', text: 'List the next steps of this meeting.' },
  { label: 'Write a follow-up mail', text: 'Write a follow-up mail for this meeting.' },
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
  onDelete,
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
  onDelete: (ns: number[]) => void;
  onName: (speaker: string, name: string) => void;
}) {
  const place = useRef<HTMLDivElement | null>(null);
  const room = useRef<HTMLDivElement | null>(null);
  const [composer, setComposer] = useState<number | null>(null);
  const [session, setSession] = useState<string | undefined>(undefined);
  const [fresh, setFresh] = useState(false);
  const [round, setRound] = useState(0);
  const [copied, setCopied] = useState(false);
  const key = askKey(meeting?.id ?? null);
  const opening = fresh && meeting !== null;

  const copy = async () => {
    if (!meeting) return;
    const ordered = [...lines].sort((a, b) => a.start - b.start || a.n - b.n);
    await navigator.clipboard.writeText(
      ordered.map((l) => `${speakerName(l, meeting, me)} (${shortClock(l.start)}): ${l.text}`).join('\n'),
    );
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  /** The conversation kept for this panel's key, if it still exists; the
   *  person may have deleted it in Hearthscale while the panel was closed.
   *  The store gives back what any version of the app wrote. */
  const stored = async () => {
    const { value } = await host.call('hearthscale/store/get', { key });
    if (typeof value !== 'string') return null;
    const { sessions } = await host.call('hearthscale/sessions/list', {});
    return sessions.some((s) => s.id === value) ? value : null;
  };

  /** Whether the person has sent nothing in the conversation yet. */
  const check = async (id: string) => {
    const { entries } = await host.call('hearthscale/sessions/entries', { id });
    setFresh(!entries.some((e) => e.type === 'user.message'));
  };

  useEffect(() => {
    if (mode !== 'ask') return;
    let gone = false;
    setSession(undefined);
    void (async () => {
      let id = await stored();
      if (!id) {
        const { session: made } = await host.call('hearthscale/sessions/create', {
          title: meeting ? name : 'All meetings',
        });
        await host.call('hearthscale/store/set', { key, value: made.id });
        id = made.id;
      }
      await check(id);
      if (gone) return;
      setSession(id);
    })();
    return () => {
      gone = true;
    };
  }, [host, key, mode, meeting, name, round]);

  useEffect(() => {
    const offs = [
      host.on('hearthscale/sessions/deleted', ({ id }) => {
        if (id !== session) return;
        void host.call('hearthscale/store/delete', { key }).then(() => setRound((r) => r + 1));
      }),
      host.on('hearthscale/sessions/changed', ({ session: changed }) => {
        if (changed === session) void check(changed);
      }),
      host.on('hearthscale/ui/slot-session', ({ id, session: now }) => {
        if ((id !== CHAT && id !== OPENING) || !now || now === session) return;
        setSession(now);
        void host.call('hearthscale/store/set', { key, value: now });
      }),
      host.on('hearthscale/ui/slot-size', ({ id, height }) => {
        if (id === OPENING) setComposer(height);
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [host, key, session]);

  useLayoutEffect(() => {
    const el = opening ? room.current : place.current;
    if (mode !== 'ask' || !el || session === undefined) {
      void host.call('hearthscale/ui/slots', { slots: [] });
      return;
    }
    const reserve = () => {
      const box = el.getBoundingClientRect();
      void host.call('hearthscale/ui/slots', {
        slots: [
          {
            id: opening ? OPENING : CHAT,
            kind: opening ? 'composer' : 'chat',
            session,
            // The app's models are chosen on its settings page alone.
            modelPicker: false,
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
      void host.call('hearthscale/ui/slots', { slots: [] });
    };
  }, [host, mode, session, opening]);

  useEffect(() => {
    if (mode !== 'ask' || !session || !opening || !meeting) return;
    void host.call('ui/update-model-context', {
      content: [
        {
          type: 'text',
          text: `The meeting "${name}", id ${meeting.id}, of ${meeting.created.slice(0, 10)}.`,
          _meta: { 'openai/title': name },
        },
      ],
      _meta: { 'hearthscale/modelContext': { slot: OPENING } },
    });
  }, [host, mode, session, opening, meeting, name]);

  const ask = async (text: string) => {
    await host.call('ui/message', { role: 'user', content: [{ type: 'text', text }] });
    if (session) await check(session);
  };

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
          onDelete={onDelete}
          onName={onName}
        />
      ) : (
        <div ref={place} className="notes-ask" data-opening={opening ? 'true' : undefined}>
          {opening && (
            <>
              <div className="notes-starters">
                {STARTERS.map((s) => (
                  <Button key={s.label} size="sm" onClick={() => void ask(s.text)}>
                    {s.label}
                  </Button>
                ))}
              </div>
              <div ref={room} className="notes-compose-room" style={composer === null ? undefined : { height: composer }} />
            </>
          )}
        </div>
      )}
    </aside>
  );
}
