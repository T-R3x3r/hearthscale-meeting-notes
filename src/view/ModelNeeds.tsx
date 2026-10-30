/**
 * What Meeting notes cannot work without: a transcription model to hear a
 * meeting and a chat model to write its notes. For a kind with no model
 * the app can run, a notice says so and names the place where a person
 * chooses the app's models: its page in Hearthscale's settings.
 */
import { useCallback, useEffect, useState } from 'react';
import { Notice } from '@hearthscale/app-ui';
import { words, type Host } from './host.ts';

type Chosen = { card: string } | { card: null; reason: string };

const NEEDED = [
  { kind: 'transcription', need: 'Meeting notes needs a transcription model to hear meetings.' },
  { kind: 'chat', need: 'Meeting notes needs a chat model to write notes.' },
] as const;

const WHERE = 'Choose one in Settings > Apps > Meeting notes.';

export function ModelNeeds({ host }: { host: Host }) {
  const [missing, setMissing] = useState<string[]>([]);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    const now: string[] = [];
    for (const { kind, need } of NEEDED) {
      const { chosen } = await host.request<{ chosen: Record<string, Chosen> }>('hearthscale/models/list', { kind });
      if (!chosen[kind]?.card) now.push(need);
    }
    setMissing(now);
  }, [host]);

  useEffect(() => {
    void load().catch((e) => setProblem(words(e)));
    return host.on<{ download: { state: string } }>('hearthscale/models/download', ({ download }) => {
      if (download.state !== 'downloading') void load().catch((e) => setProblem(words(e)));
    });
  }, [host, load]);

  return (
    <>
      {problem && <Notice>{problem}</Notice>}
      {missing.map((need) => (
        <Notice key={need}>
          {need} {WHERE}
        </Notice>
      ))}
    </>
  );
}
