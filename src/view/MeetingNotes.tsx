/**
 * The meeting-notes view, which fills the app's tab: the meetings in a
 * sidebar at the left with New meeting, the open meeting beside it, and at
 * the right the panel of its transcript or of Ask. A narrow tab shows the
 * list, the meeting or the panel. The backend tells the view of every
 * change by its events; the view asks for a meeting's files when it opens
 * one, and again when its notes are written or changed.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { EmptyState, Icon, ShellConfirm, useFloatingTips, Button } from '@hearthscale/app-ui';
import type { Line, Meeting, Side } from '../shared/meeting.ts';
import type { Live } from '../backend/recorder.ts';
import { words, type Host } from './host.ts';
import { MeetingPage, type Opened } from './MeetingPage.tsx';
import { label } from './format.ts';
import { forTranscription } from './sound.ts';
import { SidePanel, type PanelMode } from './SidePanel.tsx';
import { RecipesPage, TemplatesPage } from './Library.tsx';

/** The narrowest tab that shows the list beside the meeting. */
const WIDE = 720;

export interface Levels {
  me: number;
  them: number | null;
}

export function MeetingNotes({
  host,
  first,
  locale,
  timeZone,
  me,
}: {
  host: Host;
  first: { list: Meeting[]; live: Live | null; path: string | null };
  locale: string;
  timeZone: string;
  me: string;
}) {
  const [list, setList] = useState(first.list);
  const [open, setOpen] = useState<Opened | null>(null);
  const [live, setLive] = useState<Live | null>(first.live);
  const [levels, setLevels] = useState<Levels>({ me: 0, them: null });
  const [partial, setPartial] = useState<Record<Side, string>>({ me: '', them: '' });
  const [problem, setProblem] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Meeting | null>(null);
  const [picked, setPicked] = useState<{ name: string; asset: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [panel, setPanel] = useState<PanelMode | null>(first.live ? 'transcript' : null);
  const [section, setSection] = useState<'meetings' | 'templates' | 'recipes'>('meetings');
  const [focus, setFocus] = useState<number | null>(null);
  const [wide, setWide] = useState(true);
  const [listShown, setListShown] = useState(false);
  const root = useRef<HTMLDivElement | null>(null);
  const openId = useRef<string | null>(null);
  const tips = useFloatingTips();

  const show = useCallback(
    async (id: string) => {
      setProblem(null);
      try {
        const got = await host.tool<{ meeting: Meeting; mine: string; notes: string; lines: Line[] }>('meeting', { id });
        openId.current = id;
        setSection('meetings');
        setOpen((before) => ({ ...got, version: (before?.version ?? 0) + 1 }));
        setPartial({ me: '', them: '' });
        setListShown(false);
      } catch (e) {
        setProblem(words(e));
      }
    },
    [host],
  );

  const reload = useCallback(async () => {
    setList((await host.tool<{ meetings: Meeting[] }>('meetings')).meetings);
  }, [host]);

  useEffect(() => {
    const path = first.path;
    const target = path?.startsWith('/meeting/') ? path.slice('/meeting/'.length) : first.live?.meeting;
    if (target) void show(target);
  }, [first, show]);

  useEffect(() => {
    const offs = [
      host.on<Meeting>('meeting', (meeting) => {
        setList((l) =>
          l.some((m) => m.id === meeting.id)
            ? l.map((m) => (m.id === meeting.id ? meeting : m))
            : [meeting, ...l],
        );
        if (meeting.id !== openId.current) return;
        setOpen((o) => {
          if (!o) return o;
          if (o.meeting.state === 'writing' && meeting.state === 'done') {
            void show(meeting.id);
            return o;
          }
          return { ...o, meeting };
        });
      }),
      host.on('meetings', () => void reload()),
      host.on<{ id: string }>('notes', ({ id }) => {
        if (id === openId.current) void show(id);
      }),
      host.on<Live | null>('live', (now) => {
        setLive(now);
        if (now && now.meeting !== openId.current) void show(now.meeting);
      }),
      host.on<{ meeting: string } & Levels>('levels', ({ meeting, me, them }) => {
        if (meeting === openId.current) setLevels({ me, them });
      }),
      host.on<{ meeting: string; side: Side; text: string }>('partial', ({ meeting, side, text }) => {
        if (meeting === openId.current) setPartial((p) => ({ ...p, [side]: text }));
      }),
      host.on<{ meeting: string; line: Line }>('line', ({ meeting, line }) => {
        if (meeting !== openId.current) return;
        setPartial((p) => ({ ...p, [line.side]: '' }));
        setOpen((o) => (o && !o.lines.some((l) => l.n === line.n) ? { ...o, lines: [...o.lines, line] } : o));
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [host, reload, show]);

  const tabTitle = open ? label(open.meeting, locale, timeZone) : 'Meeting notes';
  useEffect(() => {
    void host.request('hearthscale/ui/set-tab', { title: tabTitle });
  }, [host, tabTitle]);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const sizes = new ResizeObserver(() => setWide(el.clientWidth >= WIDE));
    sizes.observe(el);
    return () => sizes.disconnect();
  }, []);

  useEffect(() => {
    host.app.onhostcontextchanged = (changed) => {
      const link = (changed as { 'openai/deepLink'?: { url: string } })['openai/deepLink']?.url;
      if (link?.startsWith('/meeting/')) void show(link.slice('/meeting/'.length));
      else if (link === '/call') {
        openId.current = null;
        setOpen(null);
        setListShown(false);
      }
    };
  }, [host, show]);

  const create = async () => {
    setProblem(null);
    try {
      const { meeting } = await host.tool<{ meeting: Meeting }>('new_meeting', {}, 'New meeting');
      setList((l) => [meeting, ...l]);
      await show(meeting.id);
    } catch (e) {
      setProblem(words(e));
    }
  };

  /** Takes a sound file the person picked as an asset of the app; the
   *  person then starts its transcription with a press. */
  const pick = async (file: File) => {
    setProblem(null);
    setUploading(true);
    try {
      const blob = await forTranscription(file);
      const asset = await host.upload({
        name: `${file.name.replace(/\.[^.]+$/, '')}.wav`,
        mediaType: 'audio/wav',
        blob,
      });
      setPicked({ name: file.name.replace(/\.[^.]+$/, ''), asset });
    } catch (e) {
      setProblem(words(e));
    } finally {
      setUploading(false);
    }
  };

  const transcribe = async () => {
    if (!picked) return;
    const { name, asset } = picked;
    setPicked(null);
    try {
      const { meeting } = await host.tool<{ meeting: Meeting }>('transcribe_recording', { asset, name }, 'Transcribe');
      setList((l) => [meeting, ...l.filter((m) => m.id !== meeting.id)]);
      await show(meeting.id);
    } catch (e) {
      setProblem(words(e));
    }
  };

  const remove = async (meeting: Meeting) => {
    setDeleting(null);
    try {
      await host.tool('delete_meeting', { id: meeting.id }, 'Delete');
      const next = list.filter((m) => m.id !== meeting.id);
      setList(next);
      if (openId.current === meeting.id) {
        openId.current = null;
        setOpen(null);
      }
    } catch (e) {
      setProblem(words(e));
    }
  };

  const sideShown = wide || listShown;
  const pageShown = wide || !listShown;
  const newTip = tips('new', 'New meeting');

  return (
    <div ref={root} className="hs-app-surface notes" data-wide={wide ? 'true' : 'false'}>
      {sideShown && (
        <div className="hs-sidebar-column notes-side">
          <div className="hs-plugrow hs-inktext hs-app-row">
            <span className="hs-sidebar-mark">
              <Icon name="mic-line" size={16} />
            </span>
            Meeting notes
            <span className="hs-flex-spacer" />
            <span
              role="button"
              tabIndex={0}
              aria-label="New meeting"
              className="hs-tipwrap hs-hovink hs-inkmut hs-sidebar-rowact"
              onClick={() => void create()}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && void create()}
              {...newTip.hover}
            >
              <span className="hs-sidebar-plus">
                <Icon name="add-fill" size={16} />
              </span>
              {newTip.tip}
            </span>
          </div>
          <div className="hs-scroll hs-sidebar-scroll notes-list">
            {list.map((meeting) => {
              const del = tips(`delete-${meeting.id}`, 'Delete meeting');
              return (
                <div key={meeting.id} className="hs-session-slot">
                  <div
                    className={`hs-sessrow hs-hovbox-ink hs-inkmut hs-session-row${
                      section === 'meetings' && meeting.id === open?.meeting.id ? ' hs-boxsel' : ''
                    }`}
                    onClick={() => void show(meeting.id)}
                  >
                    <span className="hs-session-mark">
                      <Icon
                        name={live?.meeting === meeting.id ? 'record-circle-line' : 'file-list-3-line'}
                        size={15}
                      />
                    </span>
                    <span className="hs-stitle hs-session-label">{label(meeting, locale, timeZone)}</span>
                    <span className="hs-rowact hs-session-actions">
                      <span
                        role="button"
                        tabIndex={0}
                        aria-label="Delete meeting"
                        className="hs-tipwrap hs-hovink hs-inkmut hs-session-menu-action"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleting(meeting);
                        }}
                        {...del.hover}
                      >
                        <Icon name="delete-bin-line" size={15} />
                        {del.tip}
                      </span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="notes-library">
            {(
              [
                ['templates', 'Templates', 'layout-2-line'],
                ['recipes', 'Recipes', 'quill-pen-line'],
              ] as const
            ).map(([key, name, icon]) => (
              <div key={key} className="hs-session-slot">
                <div
                  className={`hs-sessrow hs-hovbox-ink hs-inkmut hs-session-row${section === key ? ' hs-boxsel' : ''}`}
                  onClick={() => {
                    setSection(key);
                    setListShown(false);
                  }}
                >
                  <span className="hs-session-mark">
                    <Icon name={icon} size={15} />
                  </span>
                  <span className="hs-stitle hs-session-label">{name}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {pageShown && section === 'templates' && <TemplatesPage host={host} />}
      {pageShown && section === 'recipes' && <RecipesPage host={host} />}
      {pageShown &&
        section === 'meetings' &&
        (open ? (
          <MeetingPage
            key={open.meeting.id}
            host={host}
            opened={open}
            live={live?.meeting === open.meeting.id ? live : null}
            otherLive={live !== null && live.meeting !== open.meeting.id}
            levels={levels}
            locale={locale}
            timeZone={timeZone}
            me={me}
            panel={panel}
            onPanel={setPanel}
            onQuote={(seconds) => {
              setFocus(seconds);
              setPanel('transcript');
            }}
            problem={problem}
            onProblem={setProblem}
            onBack={wide ? null : () => setListShown(true)}
          />
        ) : (
          <main className="notes-page">
            <div className="hs-empty-view">
              <EmptyState icon={<Icon name="mic-line" size={30} />} title="Meeting notes">
                <div className="notes-start">
                  <Button
                    variant="primary"
                    icon={<Icon name="record-circle-line" size={14} />}
                    onClick={() =>
                      void host
                        .tool<{ meeting: Meeting }>('record', {}, 'Record')
                        .then(({ meeting }) => show(meeting.id), (e) => setProblem(words(e)))
                    }
                  >
                    Record
                  </Button>
                  <Button icon={<Icon name="add-line" size={14} />} onClick={() => void create()}>
                    New meeting
                  </Button>
                  <label className="hs-button notes-file" data-variant="secondary" data-size="sm">
                    <Icon name={uploading ? 'loader-4-line' : 'upload-2-line'} size={14} className={uploading ? 'hs-spin' : ''} />
                    Transcribe a recording
                    <input
                      type="file"
                      accept="audio/*"
                      hidden
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (file) void pick(file);
                      }}
                    />
                  </label>
                  <Button icon={<Icon name="question-answer-line" size={14} />} onClick={() => setPanel('ask')}>
                    Ask
                  </Button>
                </div>
                {picked && (
                  <div className="notes-picked">
                    <span className="notes-picked-name">{picked.name}</span>
                    <Button variant="primary" icon={<Icon name="file-text-line" size={14} />} onClick={() => void transcribe()}>
                      Transcribe
                    </Button>
                    <Button variant="ghost" onClick={() => setPicked(null)}>
                      Cancel
                    </Button>
                  </div>
                )}
                {problem && <div className="hs-notice">{problem}</div>}
              </EmptyState>
            </div>
          </main>
        ))}
      {panel && section === 'meetings' && (open || panel === 'ask') && (
        <SidePanel
          host={host}
          mode={open ? panel : 'ask'}
          onMode={setPanel}
          onClose={() => setPanel(null)}
          meeting={open?.meeting ?? null}
          name={open ? label(open.meeting, locale, timeZone) : ''}
          lines={open?.lines ?? []}
          partial={live && live.meeting === open?.meeting.id ? partial : { me: '', them: '' }}
          me={me}
          focus={focus}
          onEdit={(n, text) => {
            const id = open?.meeting.id;
            if (!id) return;
            void host
              .tool<{ lines: Line[] }>('edit_line', { id, n, text }, text ? 'Fix' : 'Delete line')
              .then(({ lines }) => setOpen((o) => (o?.meeting.id === id ? { ...o, lines } : o)), (e) => setProblem(words(e)));
          }}
          onName={(speaker, name) => {
            const id = open?.meeting.id;
            if (!id) return;
            void host
              .tool<{ meeting: Meeting }>('name_speaker', { id, speaker, name }, 'Name')
              .then(({ meeting }) => setOpen((o) => (o?.meeting.id === id ? { ...o, meeting } : o)), (e) => setProblem(words(e)));
          }}
        />
      )}
      {deleting && (
        <ShellConfirm
          title={`Delete “${label(deleting, locale, timeZone)}”?`}
          body={null}
          action="Delete"
          tone="danger"
          onConfirm={() => void remove(deleting)}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
