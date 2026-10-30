/**
 * The models Meeting notes runs, by what it uses them for, and a way to add
 * one: a model the Server offers, or one found on Hugging Face through the
 * Server. Installing asks the person on Hearthscale's own card; the page
 * then follows the download. Which model the app uses for each kind is
 * chosen in the app's settings.
 */
import { Fragment, useEffect, useState } from 'react';
import {
  Button,
  Icon,
  LinkRow,
  ListRow,
  Meter,
  Notice,
  PageTitle,
  SettingsCard,
  SettingsSection,
  StatusWord,
  TextInput,
  useFloatingTips,
} from '@hearthscale/app-ui';
import { words, type Host } from './host.ts';
import { Page } from './parts.tsx';

interface Card {
  id: string;
  label: string;
  state: 'ready' | 'absent' | 'downloading' | 'unavailable';
  sizeBytes?: number;
  reason?: string;
  progress?: { receivedBytes: number; totalBytes: number };
}

type Chosen = { card: string; source: string } | { card: null; reason: string };

interface Repository {
  repo: string;
  downloads: number;
  gated: boolean;
}

interface Candidate {
  path: string;
  quantization: string;
  sizeBytes: number;
  verifiable: boolean;
  reason?: string;
  requires: { role: string; options: { repo: string; path: string }[] }[];
  projectorOptions?: { path: string }[];
}

/** What the app uses each kind of model for, and the Hugging Face list
 *  that holds that kind. */
const NEEDS = [
  { kind: 'chat', name: 'Writing notes and answers', task: 'text' },
  { kind: 'transcription', name: 'Transcription', task: 'transcription' },
  { kind: 'diarization', name: 'Telling speakers apart', task: 'diarization' },
  { kind: 'embedding', name: 'Search', task: 'embedding' },
] as const;

type Kind = (typeof NEEDS)[number]['kind'];

const size = (bytes: number) =>
  bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1e6))} MB`;

export function ModelsPage({ host }: { host: Host }) {
  const [cards, setCards] = useState<(Card & { kind: Kind })[]>([]);
  const [chosen, setChosen] = useState<Record<string, Chosen>>({});
  const [adding, setAdding] = useState<Kind | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = async () => {
    const all: (Card & { kind: Kind })[] = [];
    let picked: Record<string, Chosen> = {};
    for (const need of NEEDS) {
      for (const state of ['ready', 'absent', 'downloading'] as const) {
        const answer = await host.request<{ cards: Card[]; chosen: Record<string, Chosen> }>('hearthscale/models/list', {
          kind: need.kind,
          ...(state !== 'ready' && { state }),
        });
        all.push(...answer.cards.map((c) => ({ ...c, kind: need.kind })));
        if (state === 'ready') picked = { ...picked, ...answer.chosen };
      }
    }
    setCards(all);
    setChosen(picked);
  };

  useEffect(() => {
    void load().catch((e) => setProblem(words(e)));
    return host.on<{ download: Card & { card: string } }>('hearthscale/models/download', ({ download }) => {
      setCards((now) =>
        now.map((c) =>
          c.id === download.card
            ? { ...c, state: download.state, ...(download.progress && { progress: download.progress }), ...(download.reason && { reason: download.reason }) }
            : c,
        ),
      );
      if (download.state !== 'downloading') void load();
    });
  }, [host]);

  return (
    <Page>
      <PageTitle>Models</PageTitle>
      {problem && <Notice>{problem}</Notice>}
      {NEEDS.map((need, i) => {
        const now = chosen[need.kind];
        const running = now?.card ? (cards.find((c) => c.id === now.card)?.label ?? now.card) : null;
        const busy = cards.filter((c) => c.kind === need.kind && c.state === 'downloading');
        const open = adding === need.kind;
        return (
          <Fragment key={need.kind}>
            <SettingsSection
              first={i === 0}
              action={
                <Button
                  size="sm"
                  icon={<Icon name={open ? 'arrow-up-s-line' : 'add-line'} size={14} />}
                  onClick={() => setAdding(open ? null : need.kind)}
                >
                  Add a model
                </Button>
              }
            >
              {need.name}
            </SettingsSection>
            {running || busy.length > 0 ? (
              <SettingsCard>
                {running && <ListRow title={running} actions={<StatusWord tone="ok">In use</StatusWord>} />}
                {busy.map((c) => (
                  <ListRow
                    key={c.id}
                    title={c.label}
                    actions={
                      <span className="notes-progress">
                        {c.progress ? (
                          <Meter value={c.progress.receivedBytes / c.progress.totalBytes} label={`Downloading ${c.label}`} />
                        ) : (
                          <StatusWord tone="info" live>
                            Downloading
                          </StatusWord>
                        )}
                      </span>
                    }
                  />
                ))}
              </SettingsCard>
            ) : (
              now &&
              'reason' in now && (
                <Notice>
                  {now.reason}
                  {!open && (
                    <button type="button" className="hs-link" onClick={() => setAdding(need.kind)}>
                      Add a model
                    </button>
                  )}
                </Notice>
              )
            )}
            {open && (
              <AddModel
                host={host}
                kind={need.kind}
                task={need.task}
                offered={cards.filter((c) => c.kind === need.kind && c.state === 'absent')}
                onProblem={setProblem}
                onInstalled={() => void load()}
              />
            )}
          </Fragment>
        );
      })}
    </Page>
  );
}

function AddModel({
  host,
  kind,
  task,
  offered,
  onProblem,
  onInstalled,
}: {
  host: Host;
  kind: Kind;
  task: string;
  offered: Card[];
  onProblem: (problem: string | null) => void;
  onInstalled: () => void;
}) {
  const [search, setSearch] = useState('');
  const [found, setFound] = useState<Repository[] | null>(null);
  const [listing, setListing] = useState<{ repo: string; candidates: Candidate[] } | null>(null);
  const [server, setServer] = useState<string | null>(null);
  const tips = useFloatingTips();

  useEffect(() => {
    void host
      .request<{ servers: { id: string; here: boolean; status: string }[] }>('hearthscale/models/servers', {})
      .then(({ servers }) => setServer(servers.find((s) => s.here && s.status === 'ready')?.id ?? null));
  }, [host]);

  const install = async (target: unknown) => {
    onProblem(null);
    try {
      const { card } = await host.request<{ card: string | null }>('hearthscale/models/install', { target });
      if (card) onInstalled();
    } catch (e) {
      onProblem(words(e));
    }
  };

  const find = async () => {
    if (!server) return;
    onProblem(null);
    setListing(null);
    try {
      const { repositories } = await host.request<{ repositories: Repository[] }>('hearthscale/models/discover', {
        server,
        task,
        ...(search.trim() && { search: search.trim() }),
      });
      setFound(repositories);
    } catch (e) {
      onProblem(words(e));
    }
  };

  const open = async (repo: string) => {
    if (!server) return;
    onProblem(null);
    try {
      const { listing: got } = await host.request<{ listing: { repo: string; candidates: Candidate[] } }>(
        'hearthscale/models/repository',
        { server, repo },
      );
      setListing(got);
    } catch (e) {
      onProblem(words(e));
    }
  };

  const installButton = (onClick: () => void) => (
    <Button size="sm" icon={<Icon name="download-2-line" size={14} />} onClick={onClick}>
      Install
    </Button>
  );

  return (
    <SettingsCard>
      {offered.map((c) => (
        <ListRow
          key={c.id}
          title={c.label}
          actions={
            <>
              {c.sizeBytes !== undefined && <span className="notes-size">{size(c.sizeBytes)}</span>}
              {installButton(() => void install(c.id))}
            </>
          }
        />
      ))}
      {server && (
        <div className="hs-setrow notes-search-row">
          <TextInput
            aria-label="Search Hugging Face"
            placeholder="Search Hugging Face"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void find()}
          />
          <Button size="sm" icon={<Icon name="search-line" size={14} />} onClick={() => void find()}>
            Search
          </Button>
        </div>
      )}
      {listing ? (
        <>
          <ListRow
            title={listing.repo}
            actions={
              <Button size="sm" variant="ghost" icon={<Icon name="arrow-left-line" size={14} />} onClick={() => setListing(null)}>
                Back
              </Button>
            }
          />
          {listing.candidates.map((c) => {
            const why = tips(`why-${c.path}`, c.reason ?? 'Its download has no checksum to check it against.');
            return (
              <ListRow
                key={c.path}
                title={c.quantization || c.path}
                actions={
                  <>
                    <span className="notes-size">{size(c.sizeBytes)}</span>
                    {c.reason || !c.verifiable ? (
                      <span className="hs-tipwrap" {...why.hover}>
                        <StatusWord tone="warn">Not offered</StatusWord>
                        {why.tip}
                      </span>
                    ) : (
                      installButton(
                        () =>
                          void install({
                            server,
                            kind,
                            repo: listing.repo,
                            file: c.path,
                            ...(c.projectorOptions && c.projectorOptions.length > 1 && { projector: c.projectorOptions[0]!.path }),
                            companions: c.requires.map((need) => ({ role: need.role, repo: need.options[0]!.repo, file: need.options[0]!.path })),
                          }),
                      )
                    )}
                  </>
                }
              />
            );
          })}
        </>
      ) : found?.length === 0 ? (
        <ListRow title="No models found" />
      ) : (
        found?.map((r) => (
          <LinkRow key={r.repo} title={r.repo} value={`${r.downloads.toLocaleString()} downloads`} onOpen={() => void open(r.repo)} />
        ))
      )}
    </SettingsCard>
  );
}
