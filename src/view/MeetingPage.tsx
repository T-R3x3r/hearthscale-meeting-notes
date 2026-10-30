/**
 * One meeting: its title, the recorder, the person's notes and the notes
 * the model wrote. The person's own notes and their changes to the written
 * notes are kept half a second after the typing stops. A quote's time in
 * the notes shows its words on hover and opens the transcript there on a
 * press.
 */
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import {
  Button,
  Icon,
  IconButton,
  MenuSurface,
  MDivider,
  MItem,
  Meter,
  SegmentedControl,
  ShellConfirm,
  anchorFrom,
  useFloatingTips,
  type MenuAnchor,
} from '@hearthscale/app-ui';
import { RichTextEditor } from '@hearthscale/app-ui/editor';
import { quoteSeconds, shortClock, type Line, type Meeting } from '../shared/meeting.ts';
import { TEMPLATES, type Template } from '../shared/templates.ts';
import type { Live } from '../backend/recorder.ts';
import { words, type Host } from './host.ts';
import { exported, label, plainNotes, when } from './format.ts';
import type { Levels } from './MeetingNotes.tsx';
import type { PanelMode } from './SidePanel.tsx';

/** What the view holds of the open meeting; `version` grows each time its
 *  files are read again, so the editors start from what was read. */
export interface Opened {
  meeting: Meeting;
  mine: string;
  notes: string;
  lines: Line[];
  version: number;
}

/** How long after the last keystroke a change is kept. */
const KEEP_MS = 500;

/** Runs `save` once the calls to the answer stop for `KEEP_MS`. */
function useLater(save: (value: string) => void) {
  const timer = useRef(0);
  const pending = useRef<string | null>(null);
  const latest = useRef(save);
  latest.current = save;
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      if (pending.current !== null) latest.current(pending.current);
    },
    [],
  );
  return (value: string) => {
    pending.current = value;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      pending.current = null;
      latest.current(value);
    }, KEEP_MS);
  };
}

export function MeetingPage({
  host,
  opened,
  live,
  otherLive,
  levels,
  locale,
  timeZone,
  me,
  panel,
  onPanel,
  onQuote,
  problem,
  onProblem,
  onBack,
}: {
  host: Host;
  opened: Opened;
  live: Live | null;
  otherLive: boolean;
  levels: Levels;
  locale: string;
  timeZone: string;
  me: string;
  panel: PanelMode | null;
  onPanel: (mode: PanelMode | null) => void;
  onQuote: (seconds: number) => void;
  problem: string | null;
  onProblem: (problem: string | null) => void;
  onBack: (() => void) | null;
}) {
  const { meeting } = opened;
  const [title, setTitle] = useState(meeting.title);
  const [tab, setTab] = useState<'notes' | 'mine'>(opened.notes ? 'notes' : 'mine');
  const [now, setNow] = useState(Date.now());
  const [menu, setMenu] = useState<{ anchor: MenuAnchor; own: Template[] } | null>(null);
  const [told, setTold] = useState(false);
  const [more, setMore] = useState<MenuAnchor | null>(null);
  const [mics, setMics] = useState<{ anchor: MenuAnchor; devices: string[]; chosen: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [again, setAgain] = useState<string | null>(null);
  const [quote, setQuote] = useState<{ seconds: number; x: number; y: number } | null>(null);
  const tips = useFloatingTips();

  useEffect(() => setTitle(meeting.title), [meeting.title]);
  useEffect(() => {
    if (opened.notes) setTab('notes');
  }, [opened.version, opened.notes]);
  useEffect(() => {
    if (!live?.since) return;
    const tick = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(tick);
  }, [live?.since]);

  const fail = (e: unknown) => onProblem(words(e));
  const rename = useLater((t) => void host.tool('rename', { id: meeting.id, title: t }, 'Title').catch(fail));
  const saveMine = useLater((text) => void host.tool('save_mine', { id: meeting.id, text }, 'My notes').catch(fail));
  const saveNotes = useLater((text) => void host.tool('save_notes', { id: meeting.id, text }, 'Notes').catch(fail));

  const act = (tool: string, labelText: string, args: object = {}) => {
    onProblem(null);
    void host.tool(tool, args, labelText).catch(fail);
  };

  const seconds = live ? live.seconds + (live.since ? (now - live.since) / 1000 : 0) : meeting.seconds;
  const writing = meeting.state === 'writing';
  const hasNotes = opened.notes.length > 0 || writing || meeting.failed !== undefined;

  const onNotesClick = (e: MouseEvent<HTMLDivElement>) => {
    const link = (e.target as HTMLElement).closest('a');
    const at = link ? quoteSeconds(link.getAttribute('href') ?? '') : null;
    if (at === null) return;
    e.preventDefault();
    e.stopPropagation();
    onQuote(at);
  };
  const onNotesHover = (e: MouseEvent<HTMLDivElement>) => {
    const link = (e.target as HTMLElement).closest('a');
    const at = link ? quoteSeconds(link.getAttribute('href') ?? '') : null;
    if (at === null || !link) {
      if (quote) setQuote(null);
      return;
    }
    const box = link.getBoundingClientRect();
    if (quote?.seconds !== at) setQuote({ seconds: at, x: box.left, y: box.bottom });
  };
  const quoted = quote
    ? opened.lines.filter((l) => l.end >= quote.seconds && l.start <= quote.seconds + 12).slice(0, 3)
    : [];

  const transcriptTip = tips('transcript', 'Transcript');
  const askTip = tips('ask', 'Ask');
  const toggle = (mode: PanelMode) => onPanel(panel === mode ? null : mode);
  const moreTip = tips('more', 'More');
  const micTip = tips('mic', 'Microphone');
  const showMics = async (anchor: MenuAnchor) => {
    const { devices, chosen } = await host.tool<{ devices: string[]; chosen: string }>('microphones');
    setMics({ anchor, devices, chosen });
  };
  const chooseMic = (name: string) => {
    setMics(null);
    act('choose_microphone', 'Microphone', { name });
  };
  const name = label(meeting, locale, timeZone);

  const copyNotes = async () => {
    await navigator.clipboard.writeText(plainNotes(opened.notes) || opened.mine);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };
  const exportMeeting = async () => {
    const text = exported(meeting, opened.notes, opened.mine, opened.lines, me, locale, timeZone);
    const file = `${name.replace(/[\\/:*?"<>|]+/g, ' ').trim()}.md`;
    const { isError } = await host.request<{ isError?: boolean }>('ui/download-file', {
      contents: [{ type: 'resource', resource: { uri: `file:///${encodeURIComponent(file)}`, mimeType: 'text/markdown', text } }],
    });
    if (isError) onProblem('The file was not saved.');
  };

  return (
    <>
      <main className="hs-scroll notes-page">
        <div className="notes-sheet">
          <div className="notes-top">
            {onBack && (
              <IconButton aria-label="Meetings" onClick={onBack}>
                <Icon name="arrow-left-line" size={16} />
              </IconButton>
            )}
            <input
              className="notes-title"
              aria-label="Title"
              placeholder={label({ ...meeting, title: '' }, locale, timeZone)}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                rename(e.target.value);
              }}
            />
            <span className="hs-tipwrap" {...transcriptTip.hover}>
              <IconButton aria-label="Transcript" aria-pressed={panel === 'transcript'} onClick={() => toggle('transcript')}>
                <Icon name="chat-voice-line" size={16} />
              </IconButton>
              {transcriptTip.tip}
            </span>
            <span className="hs-tipwrap" {...askTip.hover}>
              <IconButton aria-label="Ask" aria-pressed={panel === 'ask'} onClick={() => toggle('ask')}>
                <Icon name="question-answer-line" size={16} />
              </IconButton>
              {askTip.tip}
            </span>
            <span className="hs-tipwrap" {...moreTip.hover}>
              <IconButton aria-label="More" onClick={(e) => setMore(anchorFrom('more', e))}>
                <Icon name={copied ? 'check-line' : 'more-line'} size={16} />
              </IconButton>
              {moreTip.tip}
            </span>
          </div>
          <div className="notes-facts">
            <span>{when(meeting.created, locale, timeZone)}</span>
            {seconds > 0 && <span>{shortClock(seconds)}</span>}
          </div>

          <div className="notes-recorder">
            {live?.state === 'recording' ? (
              <>
                <Button icon={<Icon name="pause-line" size={14} />} onClick={() => act('pause', 'Pause')}>
                  Pause
                </Button>
                <Button variant="danger" icon={<Icon name="stop-fill" size={14} />} onClick={() => act('stop', 'Stop')}>
                  Stop
                </Button>
              </>
            ) : live?.state === 'paused' ? (
              <>
                <Button icon={<Icon name="play-line" size={14} />} onClick={() => act('resume', 'Resume')}>
                  Resume
                </Button>
                <Button variant="danger" icon={<Icon name="stop-fill" size={14} />} onClick={() => act('stop', 'Stop')}>
                  Stop
                </Button>
              </>
            ) : writing ? (
              <span className="notes-working">
                <Icon name="loader-4-line" size={14} className="hs-spin" />
                Writing notes
              </span>
            ) : (
              <Button
                variant={meeting.seconds === 0 ? 'primary' : 'secondary'}
                disabled={otherLive}
                icon={<Icon name="record-circle-line" size={14} />}
                onClick={() => act('record', 'Record', { id: meeting.id })}
              >
                Record
              </Button>
            )}
            {!live && !writing && (
              <span className="hs-tipwrap" {...micTip.hover}>
                <IconButton aria-label="Microphone" onClick={(e) => void showMics(anchorFrom('mic', e)).catch(fail)}>
                  <Icon name="mic-line" size={16} />
                </IconButton>
                {micTip.tip}
              </span>
            )}
            {live && (
              <Button
                icon={<Icon name={told ? 'check-line' : 'megaphone-line'} size={14} />}
                onClick={() =>
                  void navigator.clipboard
                    .writeText('I take notes of this call with Meeting notes, on my own computer.')
                    .then(() => {
                      setTold(true);
                      window.setTimeout(() => setTold(false), 1500);
                    }, fail)
                }
              >
                Tell the others
              </Button>
            )}
            {live && (
              <div className="notes-levels">
                <Meter value={levels.me} label="Me" />
                {levels.them !== null && <Meter value={levels.them} label="Them" />}
              </div>
            )}
          </div>

          {problem && <div className="hs-notice">{problem}</div>}
          {meeting.unheard && <div className="hs-notice">Only the microphone is heard: {meeting.unheard}</div>}
          {live?.quiet && <div className="hs-notice">No sound from the other side yet.</div>}
          {meeting.stopped && !live && <div className="hs-notice">{meeting.stopped}</div>}
          {meeting.failed && !writing && <div className="hs-notice">{meeting.failed}</div>}

          {hasNotes && (
            <div className="notes-tabs">
              <SegmentedControl
                label="Notes"
                value={tab}
                options={[
                  { value: 'notes', label: 'Notes' },
                  { value: 'mine', label: 'My notes' },
                ]}
                onChange={setTab}
              />
              <span className="hs-flex-spacer" />
              {!writing && !live && (opened.lines.length > 0 || opened.mine) && (
                <Button
                  icon={<Icon name="refresh-line" size={14} />}
                  trailingIcon={<Icon name="arrow-down-s-line" size={14} />}
                  onClick={(e) => {
                    const anchor = anchorFrom('again', e);
                    void host
                      .tool<{ templates: Template[] }>('templates')
                      .then(({ templates }) => setMenu({ anchor, own: templates }), fail);
                  }}
                >
                  Write again
                </Button>
              )}
            </div>
          )}

          {tab === 'notes' && hasNotes ? (
            writing ? (
              <span className="notes-working">
                <Icon name="loader-4-line" size={14} className="hs-spin" />
                Writing notes
              </span>
            ) : (
              <div className="notes-written" onClickCapture={onNotesClick} onMouseOver={onNotesHover} onMouseLeave={() => setQuote(null)}>
                <RichTextEditor
                  key={`notes-${opened.version}`}
                  label="Notes"
                  content={opened.notes}
                  onChange={(editor) => saveNotes(editor.getMarkdown())}
                />
              </div>
            )
          ) : (
            <RichTextEditor
              key={`mine-${opened.version}`}
              label="My notes"
              placeholder="Write your notes"
              content={opened.mine}
              onChange={(editor) => saveMine(editor.getMarkdown())}
            />
          )}
        </div>
      </main>

      {quote && quoted.length > 0 && (
        <div className="hs-tooltip notes-quote" style={{ left: quote.x, top: quote.y }}>
          {quoted.map((l) => (
            <span key={l.n} className="hs-tooltip-title notes-quote-line">
              {l.text}
            </span>
          ))}
        </div>
      )}

      {mics && (
        <MenuSurface anchor={mics.anchor} onDismiss={() => setMics(null)}>
          <MItem label="System default" checked={mics.chosen === ''} onClick={() => chooseMic('')} />
          {mics.devices.map((d) => (
            <MItem key={d} label={d} checked={mics.chosen === d} onClick={() => chooseMic(d)} />
          ))}
        </MenuSurface>
      )}
      {more && (
        <MenuSurface anchor={more} onDismiss={() => setMore(null)}>
          <MItem
            icon={<Icon name="file-copy-line" size={14} />}
            label="Copy notes"
            disabled={!opened.notes && !opened.mine}
            onClick={() => {
              setMore(null);
              void copyNotes().catch(fail);
            }}
          />
          <MItem
            icon={<Icon name="download-2-line" size={14} />}
            label="Export"
            onClick={() => {
              setMore(null);
              void exportMeeting().catch(fail);
            }}
          />
        </MenuSurface>
      )}
      {menu && (
        <MenuSurface anchor={menu.anchor} onDismiss={() => setMenu(null)}>
          {[...TEMPLATES, ...(menu.own.length > 0 ? [null] : []), ...menu.own].map((t, i) =>
            t === null ? (
              <MDivider key={`divider-${i}`} />
            ) : (
              <MItem
                key={t.id}
                label={t.name}
                checked={t.id === (meeting.template ?? 'auto')}
                onClick={() => {
                  setMenu(null);
                  setAgain(t.id);
                }}
              />
            ),
          )}
        </MenuSurface>
      )}
      {again && (
        <ShellConfirm
          title="Write the notes again?"
          body={null}
          action="Write again"
          tone="primary"
          onConfirm={() => {
            const chosen = again;
            setAgain(null);
            setTab('notes');
            act('write_notes', 'Write again', { id: meeting.id, template: chosen });
          }}
          onCancel={() => setAgain(null)}
        />
      )}
    </>
  );
}
