/**
 * What Meeting notes cannot work without: a transcription model to hear a
 * meeting and a chat model to write its notes. When the app can run no
 * model of one of these kinds, one notice says so, with a link to the
 * app's page in Hearthscale's settings, where a person chooses its models.
 */
import { useCallback, useEffect, useState } from 'react';
import { Notice } from '@hearthscale/app-ui';
import { words, type Host } from './host.ts';

/** The notice for the kinds the app has no model of, by which are missing. */
const need = (transcription: boolean, chat: boolean) =>
  transcription && chat
    ? 'Meeting notes needs a transcription model and a chat model.'
    : transcription
      ? 'Meeting notes needs a transcription model to hear meetings.'
      : chat
        ? 'Meeting notes needs a chat model to write notes.'
        : null;

export function ModelNeeds({ host }: { host: Host }) {
  const [missing, setMissing] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    const has = async (kind: string) => {
      const { chosen } = await host.call('hearthscale/models/list', { kind });
      return !!chosen[kind]?.card;
    };
    const [transcription, chat] = await Promise.all([has('transcription'), has('chat')]);
    setMissing(need(!transcription, !chat));
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
      {missing && (
        <Notice>
          {missing}{' '}
          <button
            type="button"
            className="hs-link"
            onClick={() => void host.call('hearthscale/ui/open-settings', {}).catch((e) => setProblem(words(e)))}
          >
            Settings
          </button>
        </Notice>
      )}
    </>
  );
}
