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
  MenuSurface,
  MDivider,
  MItem,
  Meter,
  Notice,
  SegmentedControl,
  ShellConfirm,
  StatusWord,
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
import { ModelNeeds } from './ModelNeeds.tsx';
import { IconAction } from './parts.tsx';
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

  const toggle = (mode: PanelMode) => onPanel(panel === mode ? null : mode);
  const tips = useFloatingTips();
  const recordWhy = tips('record-why', otherLive ? 'Another meeting is recording' : undefined);
  const tellTip = tips('tell', told ? 'Copied' : 'Copy a line that says you take notes');
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
    const { isError } = await host.call('ui/download-file', {
      contents: [{ type: 'resource', resource: { uri: `file:///${encodeURIComponent(file)}`, mimeType: 'text/markdown', text } }],
    });
    if (isError) onProblem('The meeting could not be exported. Try again.');
  };

  return (
    <>
      <div className="hs-scroll hs-settings-scroll notes-page">
        <main className="hs-settings-content notes-sheet">
          <header className="notes-head">
            <div className="notes-top">
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
              <IconAction name="Transcript" icon="chat-voice-line" pressed={panel === 'transcript'} onClick={() => toggle('transcript')} />
              <IconAction name="Ask" icon="question-answer-line" pressed={panel === 'ask'} onClick={() => toggle('ask')} />
              <IconAction name="More" icon={copied ? 'check-line' : 'more-line'} onClick={(e) => setMore(anchorFrom('more', e))} />
            </div>
            <div className="notes-facts">
              <span>{when(meeting.created, locale, timeZone)}</span>
              {seconds > 0 && <span>{shortClock(seconds)}</span>}
            </div>
          </header>

          {!writing && (
            <div className="notes-recorder">
              {live?.state === 'recording' ? (
                <>
                  <Button icon={<Icon name="pause-line" size={14} />} onClick={() => act('pause', 'Pause')}>
                    Pause
                  </Button>
                  <Button icon={<Icon name="stop-line" size={14} />} onClick={() => act('stop', 'Stop')}>
                    Stop
                  </Button>
                </>
              ) : live?.state === 'paused' ? (
                <>
                  <Button icon={<Icon name="play-line" size={14} />} onClick={() => act('resume', 'Resume')}>
                    Resume
                  </Button>
                  <Button icon={<Icon name="stop-line" size={14} />} onClick={() => act('stop', 'Stop')}>
                    Stop
                  </Button>
                </>
              ) : (
                <span className="hs-tipwrap" {...recordWhy.hover}>
                  <Button
                    variant={meeting.seconds === 0 ? 'primary' : 'secondary'}
                    disabled={otherLive}
                    icon={<Icon name="record-circle-line" size={14} />}
                    onClick={() => act('record', 'Record', { id: meeting.id })}
                  >
                    Record
                  </Button>
                  {recordWhy.tip}
                </span>
              )}
              {!live && (
                <IconAction name="Microphone" icon="mic-line" onClick={(e) => void showMics(anchorFrom('mic', e)).catch(fail)} />
              )}
              {live && (
                <span className="hs-tipwrap" {...tellTip.hover}>
                  <Button
                    icon={<Icon name={told ? 'check-line' : 'megaphone-line'} size={14} />}
                    onClick={() =>
                      void navigator.clipboard
                        .writeText('I’m taking notes of this call with Meeting notes.')
                        .then(() => {
                          setTold(true);
                          window.setTimeout(() => setTold(false), 1500);
                        }, fail)
                    }
                  >
                    Tell the others
                  </Button>
                  {tellTip.tip}
                </span>
              )}
              {live && (
                <div className="notes-levels">
                  <span className="notes-level">
                    <Icon name="mic-line" size={14} />
                    <Meter value={levels.me} label="Your microphone" />
                  </span>
                  {levels.them !== null && (
                    <span className="notes-level">
                      <Icon name="volume-up-line" size={14} />
                      <Meter value={levels.them} label="The computer's sound" />
                    </span>
                  )}
                </div>
              )}
              {live && (
                <StatusWord tone={live.state === 'recording' ? 'info' : 'dim'} live={live.state === 'recording'}>
                  {live.state === 'recording' ? 'Recording' : 'Paused'}
                </StatusWord>
              )}
            </div>
          )}

          <section className="notes-body">
            {problem && <Notice>{problem}</Notice>}
            <ModelNeeds host={host} />
            {meeting.unheard && <Notice>Only your microphone is recorded. {meeting.unheard}</Notice>}
            {live?.quiet && <Notice>No sound from the other side yet.</Notice>}
            {meeting.stopped && !live && <Notice>{meeting.stopped}</Notice>}
            {meeting.failed && !writing && <Notice>{meeting.failed}</Notice>}

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
                {writing && (
                  <StatusWord tone="info" live>
                    Writing notes
                  </StatusWord>
                )}
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
              writing ? null : (
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
                content={opened.mine}
                onChange={(editor) => saveMine(editor.getMarkdown())}
              />
            )}
          </section>
        </main>
      </div>

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
            label="Export meeting"
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
