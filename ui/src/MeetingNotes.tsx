/**
 * The meeting-notes view, which fills the app's tab: the meetings in a
 * sidebar at the left, with New meeting, and the open meeting beside it:
 * its title, Record and Stop, the transcript, and the person's own notes.
 * A recording goes to the platform as WAV assets and is transcribed one
 * part after another; the job under way is kept, so a view that opens
 * again follows it. With no meeting open, New meeting stands in its
 * place. A narrow tab shows the list or the meeting.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Confirm, Icon, MarkPress, Notice } from './kit.tsx';
import type { Meeting, MeetingEntry, Meetings } from './meetings.ts';
import type { Platform } from './platform.ts';
import { Recorder } from './recorder.ts';

/** How long after the last keystroke a change is kept. */
const KEEP_MS = 500;
/** The narrowest tab that shows the list beside the meeting. */
const WIDE = 600;

/** Why something failed, in the platform's words without the SDK's
 *  error code before them. */
const words = (e: unknown) =>
  (e instanceof Error ? e.message : String(e)).replace(/^MCP error -?\d+: /, '');

/** A length of time as minutes and seconds. */
const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

export function MeetingNotes({
  platform,
  meetings,
  first,
}: {
  platform: Platform;
  meetings: Meetings;
  first: { list: MeetingEntry[]; meeting: Meeting | null };
}) {
  const [list, setList] = useState(first.list);
  const [meeting, setMeeting] = useState(first.meeting);
  const [recording, setRecording] = useState<{ seconds: number; level: number } | null>(null);
  /** Whether a recording is on its way to the platform. */
  const [handing, setHanding] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<MeetingEntry | null>(null);
  const [wide, setWide] = useState(true);
  const [listShown, setListShown] = useState(false);
  const root = useRef<HTMLDivElement | null>(null);
  const recorder = useRef<Recorder | null>(null);
  const openId = useRef(first.meeting?.id ?? null);
  const typed = useRef<Meeting | null>(null);
  const keepTimer = useRef<number>(0);

  /** Keeps a meeting, and shows it while it is the open one. */
  const keep = useCallback(
    async (next: Meeting) => {
      if (next.id === openId.current) setMeeting(next);
      setList(await meetings.save(next));
    },
    [meetings],
  );

  const flushTyped = useCallback(async () => {
    clearTimeout(keepTimer.current);
    const next = typed.current;
    typed.current = null;
    if (next) await keep(next);
  }, [keep]);

  /** Transcribes the parts of a recording not yet transcribed, one after
   *  another, following a job already under way. */
  const transcribe = useCallback(
    async (start: Meeting) => {
      let at: Meeting = { ...start };
      delete at.error;
      while (at.texts.length < at.parts.length) {
        try {
          const job = at.job ?? (await platform.transcribe(at.parts[at.texts.length]!)).id;
          if (at.job !== job) {
            at = { ...at, job };
            await keep(at);
          }
          const text = await platform.transcript(job);
          at = { ...at, texts: [...at.texts, text.trim()] };
          delete at.job;
          await keep(at);
        } catch (e) {
          at = { ...at, error: words(e) };
          delete at.job;
          await keep(at);
          return;
        }
      }
    },
    [platform, keep],
  );

  // A meeting whose transcription ran when the view closed goes on.
  useEffect(() => {
    const m = first.meeting;
    if (m && m.parts.length > m.texts.length && !m.error) void transcribe(m);
  }, [first.meeting, transcribe]);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const sizes = new ResizeObserver(() => setWide(el.clientWidth >= WIDE));
    sizes.observe(el);
    return () => sizes.disconnect();
  }, []);

  useEffect(() => {
    const flush = () => void flushTyped();
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, [flushTyped]);

  const record = async () => {
    setProblem(null);
    try {
      recorder.current = await Recorder.start((level) => {
        if (recorder.current) setRecording({ seconds: recorder.current.seconds, level });
      });
      setRecording({ seconds: 0, level: 0 });
    } catch (e) {
      setProblem(words(e));
    }
  };

  const stop = async () => {
    const held = recorder.current;
    if (!held || !meeting) return;
    recorder.current = null;
    setRecording(null);
    setHanding(true);
    const seconds = held.seconds;
    try {
      const files = await held.stop();
      const parts: string[] = [];
      for (const [i, file] of files.entries()) {
        parts.push(await platform.upload(`${meeting.title} ${i + 1}.wav`, 'audio/wav', file));
      }
      const recorded = { ...meeting, ...(typed.current ?? {}), seconds, parts, texts: [] };
      typed.current = null;
      await keep(recorded);
      setHanding(false);
      await transcribe(recorded);
    } catch (e) {
      setHanding(false);
      setProblem(words(e));
    }
  };

  const type = (change: Partial<Pick<Meeting, 'title' | 'notes'>>) => {
    if (!meeting) return;
    const next = { ...(typed.current ?? meeting), ...change };
    typed.current = next;
    setMeeting(next);
    clearTimeout(keepTimer.current);
    keepTimer.current = window.setTimeout(() => void flushTyped(), KEEP_MS);
  };

  const show = async (id: string) => {
    await stop();
    await flushTyped();
    const next = await meetings.get(id);
    if (!next) return;
    openId.current = id;
    setMeeting(next);
    setProblem(null);
    setListShown(false);
    await meetings.keepOpen(id);
  };

  const create = async () => {
    const made = await meetings.create();
    setList(made.list);
    await show(made.meeting.id);
  };

  const remove = async (entry: MeetingEntry) => {
    setDeleting(null);
    if (typed.current?.id === entry.id) {
      clearTimeout(keepTimer.current);
      typed.current = null;
    }
    const next = await meetings.remove(entry.id);
    setList(next);
    if (meeting?.id !== entry.id) return;
    if (next[0]) await show(next[0].id);
    else {
      await stop();
      openId.current = null;
      setMeeting(null);
      setProblem(null);
    }
  };

  const sideShown = wide || listShown;
  const meetingShown = wide || !listShown;
  const transcript = meeting?.texts.join('\n\n') ?? '';
  const transcribing = !!meeting && meeting.parts.length > meeting.texts.length && !meeting.error;

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
            <MarkPress
              label="New meeting"
              className="hs-hovink hs-inkmut hs-sidebar-rowact"
              onPress={() => void create()}
            >
              <span className="hs-sidebar-plus">
                <Icon name="add-fill" size={16} />
              </span>
            </MarkPress>
          </div>
          <div className="hs-scroll hs-sidebar-scroll notes-list">
            {list.map((entry) => (
              <div key={entry.id} className="hs-session-slot">
                <div
                  className={`hs-sessrow hs-hovbox-ink hs-inkmut hs-session-row${
                    entry.id === meeting?.id ? ' hs-boxsel' : ''
                  }`}
                  data-meeting={entry.id}
                  onClick={() => void show(entry.id)}
                >
                  <span className="hs-session-mark">
                    <Icon name="file-list-3-line" size={15} />
                  </span>
                  <span className="hs-stitle hs-session-label">
                    {entry.id === meeting?.id ? meeting.title : entry.title}
                  </span>
                  <span className="hs-rowact hs-session-actions">
                    <MarkPress
                      label="Delete meeting"
                      className="hs-hovink hs-inkmut hs-session-menu-action"
                      onPress={() => setDeleting(entry)}
                    >
                      <Icon name="delete-bin-line" size={15} />
                    </MarkPress>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {meetingShown && (
        <main className="hs-scroll notes-page">
          {!wide && (
            <MarkPress
              label="Meetings"
              className="hs-hovink hs-inkmut hs-sidebar-rowact notes-back"
              onPress={() => setListShown(true)}
            >
              <Icon name="arrow-left-line" size={16} />
            </MarkPress>
          )}
          {!meeting ? (
            <div className="hs-empty-view">
              <Icon name="mic-line" size={30} />
              <Button icon="add-line" onPress={() => void create()}>
                New meeting
              </Button>
            </div>
          ) : (
            <div className="notes-sheet" key={meeting.id}>
              <input
                className="notes-title"
                aria-label="Title"
                value={meeting.title}
                onChange={(e) => type({ title: e.target.value })}
              />
              <div className="notes-recorder">
                {recording ? (
                  <>
                    <Button icon="stop-fill" variant="danger" onPress={() => void stop()}>
                      Stop
                    </Button>
                    <span className="notes-clock">{clock(recording.seconds)}</span>
                    <span className="notes-meter">
                      <span style={{ width: `${Math.round(recording.level * 100)}%` }} />
                    </span>
                  </>
                ) : meeting.parts.length === 0 && !handing ? (
                  <Button icon="mic-fill" onPress={() => void record()}>
                    Record
                  </Button>
                ) : (
                  <span className="notes-clock">
                    <Icon name="mic-line" size={14} />
                    {clock(meeting.seconds)}
                  </span>
                )}
              </div>
              {problem && <Notice>{problem}</Notice>}
              {(meeting.parts.length > 0 || handing) && (
                <section className="notes-section">
                  <h2 className="notes-heading">Transcript</h2>
                  {handing || transcribing ? (
                    <span className="notes-working">
                      <Icon name="loader-4-line" size={14} className="hs-spin" />
                      Transcribing
                    </span>
                  ) : null}
                  {transcript && <div className="notes-transcript">{transcript}</div>}
                  {meeting.error && (
                    <>
                      <Notice>{meeting.error}</Notice>
                      <Button icon="refresh-line" onPress={() => void transcribe(meeting)}>
                        Transcribe again
                      </Button>
                    </>
                  )}
                </section>
              )}
              <section className="notes-section">
                <h2 className="notes-heading">Notes</h2>
                <textarea
                  className="hs-in notes-text"
                  aria-label="Notes"
                  placeholder="Write your notes"
                  value={meeting.notes}
                  onChange={(e) => type({ notes: e.target.value })}
                />
              </section>
            </div>
          )}
        </main>
      )}
      {deleting && (
        <Confirm
          title={`Delete “${deleting.title}”?`}
          action="Delete"
          onConfirm={() => void remove(deleting)}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
