/**
 * The models Meeting notes runs, by what it uses them for, and a way to add
 * one: a model the Server offers, or one found on Hugging Face through the
 * Server. Installing asks the person on Hearthscale's own card; the page
 * then follows the download. Which model the app uses for each kind is
 * chosen in the app's settings.
 */
import { useEffect, useState } from 'react';
import { Button, Icon, Meter, PageTitle, StatusWord, TextInput } from '@hearthscale/app-ui';
import { words, type Host } from './host.ts';

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
  const [cards, setCards] = useState<Card[]>([]);
  const [chosen, setChosen] = useState<Record<string, Chosen>>({});
  const [adding, setAdding] = useState<Kind | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = async () => {
    const all: Card[] = [];
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

  const kindOf = (c: Card) => (c as Card & { kind: Kind }).kind;

  return (
    <main className="hs-scroll notes-page">
      <div className="notes-sheet">
        <PageTitle>Models</PageTitle>
        {problem && <div className="hs-notice">{problem}</div>}
        {NEEDS.map((need) => {
          const now = chosen[need.kind];
          const running = now && now.card ? cards.find((c) => c.id === now.card)?.label ?? now.card : null;
          const busy = cards.filter((c) => kindOf(c) === need.kind && c.state === 'downloading');
          return (
            <section key={need.kind} className="notes-section">
              <div className="notes-top">
                <h2 className="notes-heading">{need.name}</h2>
                <span className="hs-flex-spacer" />
                <Button
                  icon={<Icon name={adding === need.kind ? 'arrow-up-s-line' : 'add-line'} size={14} />}
                  onClick={() => setAdding(adding === need.kind ? null : need.kind)}
                >
                  Add a model
                </Button>
              </div>
              <div className="notes-item">
                <span className="notes-item-name">{running ?? (now && 'reason' in now ? now.reason : 'None')}</span>
              </div>
              {busy.map((c) => (
                <div key={c.id} className="notes-item">
                  <span className="notes-item-name">{c.label}</span>
                  <span className="hs-flex-spacer" />
                  {c.progress && (
                    <div className="notes-progress">
                      <Meter value={c.progress.receivedBytes / c.progress.totalBytes} label={`Downloading ${c.label}`} />
                    </div>
                  )}
                </div>
              ))}
              {adding === need.kind && (
                <AddModel
                  host={host}
                  kind={need.kind}
                  task={need.task}
                  offered={cards.filter((c) => kindOf(c) === need.kind && c.state === 'absent')}
                  onProblem={setProblem}
                  onInstalled={() => void load()}
                />
              )}
            </section>
          );
        })}
      </div>
    </main>
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

  return (
    <div className="notes-add">
      {offered.map((c) => (
        <div key={c.id} className="notes-item">
          <span className="notes-item-name">{c.label}</span>
          {c.sizeBytes !== undefined && <span className="notes-item-key">{size(c.sizeBytes)}</span>}
          <span className="hs-flex-spacer" />
          <Button size="sm" icon={<Icon name="download-2-line" size={14} />} onClick={() => void install(c.id)}>
            Install
          </Button>
        </div>
      ))}
      {server && (
        <div className="notes-form-actions">
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
          <div className="notes-top">
            <Button size="sm" variant="ghost" icon={<Icon name="arrow-left-line" size={14} />} onClick={() => setListing(null)}>
              {listing.repo}
            </Button>
          </div>
          {listing.candidates.map((c) => (
            <div key={c.path} className="notes-item">
              <span className="notes-item-name">{c.quantization || c.path}</span>
              <span className="notes-item-key">{size(c.sizeBytes)}</span>
              <span className="hs-flex-spacer" />
              {c.reason || !c.verifiable ? (
                <StatusWord tone="warn">{c.reason ?? 'No checksum'}</StatusWord>
              ) : (
                <Button
                  size="sm"
                  icon={<Icon name="download-2-line" size={14} />}
                  onClick={() =>
                    void install({
                      server,
                      kind,
                      repo: listing.repo,
                      file: c.path,
                      ...(c.projectorOptions && c.projectorOptions.length > 1 && { projector: c.projectorOptions[0]!.path }),
                      companions: c.requires.map((need) => ({ role: need.role, repo: need.options[0]!.repo, file: need.options[0]!.path })),
                    })
                  }
                >
                  Install
                </Button>
              )}
            </div>
          ))}
        </>
      ) : found?.length === 0 ? (
        <span className="notes-lines-empty">No models found.</span>
      ) : (
        found?.map((r) => (
          <div key={r.repo} className="notes-item notes-pick" onClick={() => void open(r.repo)}>
            <span className="notes-item-name">{r.repo}</span>
            <span className="notes-item-key">{r.downloads.toLocaleString()}</span>
            <span className="hs-flex-spacer" />
            <Icon name="arrow-right-s-line" size={16} />
          </div>
        ))
      )}
    </div>
  );
}
