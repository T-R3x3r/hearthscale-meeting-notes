/**
 * What Meeting notes cannot work without: a transcription model to hear a
 * meeting and a chat model to write its notes. For a kind with no model, a
 * notice offers the model the Server offers for it and follows its
 * download; Hearthscale asks the person on its own card before it
 * installs. A person chooses among installed models on the app's settings
 * page in Hearthscale.
 */
import { useCallback, useEffect, useState } from 'react';
import { Meter, Notice } from '@hearthscale/app-ui';
import { words, type Host } from './host.ts';

interface Card {
  id: string;
  label: string;
  state: 'ready' | 'absent' | 'downloading' | 'unavailable';
  progress?: { receivedBytes: number; totalBytes: number };
}

type Chosen = { card: string } | { card: null; reason: string };

const NEEDED = [
  { kind: 'transcription', need: 'Meeting notes needs a transcription model to hear meetings.' },
  { kind: 'chat', need: 'Meeting notes needs a chat model to write notes.' },
] as const;

interface Missing {
  kind: string;
  need: string;
  offer: Card | null;
  downloading: Card | null;
}

export function ModelNeeds({ host }: { host: Host }) {
  const [missing, setMissing] = useState<Missing[]>([]);
  const [problem, setProblem] = useState<string | null>(null);

  const list = useCallback(
    async (kind: string, state?: 'absent' | 'downloading') =>
      host.request<{ cards: Card[]; chosen: Record<string, Chosen> }>('hearthscale/models/list', {
        kind,
        ...(state && { state }),
      }),
    [host],
  );

  const load = useCallback(async () => {
    const now: Missing[] = [];
    for (const { kind, need } of NEEDED) {
      const { chosen } = await list(kind);
      if (chosen[kind]?.card) continue;
      const [{ cards: downloading }, { cards: absent }] = await Promise.all([list(kind, 'downloading'), list(kind, 'absent')]);
      now.push({ kind, need, offer: absent[0] ?? null, downloading: downloading[0] ?? null });
    }
    setMissing(now);
  }, [list]);

  useEffect(() => {
    void load().catch((e) => setProblem(words(e)));
    return host.on<{ download: Card & { card: string } }>('hearthscale/models/download', ({ download }) => {
      if (download.state !== 'downloading') {
        void load().catch((e) => setProblem(words(e)));
        return;
      }
      setMissing((now) =>
        now.map((m) =>
          m.downloading?.id === download.card && download.progress
            ? { ...m, downloading: { ...m.downloading, progress: download.progress } }
            : m,
        ),
      );
    });
  }, [host, load]);

  const install = async (card: string) => {
    setProblem(null);
    try {
      const { card: started } = await host.request<{ card: string | null }>('hearthscale/models/install', { target: card });
      if (started) await load();
    } catch (e) {
      setProblem(words(e));
    }
  };

  return (
    <>
      {problem && <Notice>{problem}</Notice>}
      {missing.map((m) =>
        m.downloading ? (
          <Notice key={m.kind}>
            Downloading {m.downloading.label}
            {m.downloading.progress && (
              <span className="notes-progress">
                <Meter
                  value={m.downloading.progress.receivedBytes / m.downloading.progress.totalBytes}
                  label={`Downloading ${m.downloading.label}`}
                />
              </span>
            )}
          </Notice>
        ) : (
          <Notice key={m.kind}>
            {m.need}
            {m.offer && (
              <button type="button" className="hs-link" onClick={() => void install(m.offer!.id)}>
                Install {m.offer.label}
              </button>
            )}
          </Notice>
        ),
      )}
    </>
  );
}
