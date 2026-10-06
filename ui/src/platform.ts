/**
 * What the view asks of the platform, through the extensions `uses`
 * names: the app's store, which keeps the meetings, the upload of a
 * recording as an asset of the app, and jobs, which transcribe it on the
 * app's transcription model.
 */
import { App, McpUiMessageResultSchema as Answer } from '@modelcontextprotocol/ext-apps';

/** One job as the platform answers it. */
export interface Job {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  result?: string[];
  error?: string;
}

/** How often a running job is asked where it stands. */
const POLL_MS = 500;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class Platform {
  constructor(private readonly app: App) {}

  /** One request of the host, its result whole; a refusal rejects with
   *  the host's words. The SDK's types name only its own methods, not the
   *  host's `hearthscale/*` ones. */
  private call<T>(method: string, params: object): Promise<T> {
    const request = this.app.request.bind(this.app) as (
      message: { method: string; params: object },
      schema: typeof Answer,
    ) => Promise<unknown>;
    return request({ method, params }, Answer) as Promise<T>;
  }

  /** A value of the store; null for a key that holds nothing. */
  async get<T>(key: string): Promise<T | null> {
    return (await this.call<{ value: T | null }>('hearthscale/store/get', { key })).value;
  }

  async set(key: string, value: unknown): Promise<void> {
    await this.call('hearthscale/store/set', { key, value });
  }

  async delete(key: string): Promise<void> {
    await this.call('hearthscale/store/delete', { key });
  }

  /** Keeps bytes, in base64, as an asset of the app; answers its id. */
  async upload(name: string, mediaType: string, blob: string): Promise<string> {
    return (
      await this.call<{ asset: string }>('hearthscale/ui/upload-file', { name, mediaType, blob })
    ).asset;
  }

  /** Starts the transcription of a WAV asset on the app's transcription
   *  model; refused in words while the app has none. */
  async transcribe(audio: string): Promise<Job> {
    return (
      await this.call<{ job: Job }>('hearthscale/jobs/submit', {
        kind: 'transcription',
        input: { audio },
      })
    ).job;
  }

  /** Waits for a job to end; answers its transcript, or rejects with why
   *  it did not complete. */
  async transcript(id: string): Promise<string> {
    let { job } = await this.call<{ job: Job }>('hearthscale/jobs/get', { id });
    while (job.status === 'queued' || job.status === 'running') {
      await wait(POLL_MS);
      ({ job } = await this.call<{ job: Job }>('hearthscale/jobs/get', { id }));
    }
    const asset = job.result?.[0];
    if (job.status !== 'completed' || !asset) {
      throw new Error(job.error ?? `the transcription was ${job.status}`);
    }
    const read = await this.app.readServerResource({ uri: `hearthscale-asset://${asset}` });
    const content = read.contents[0];
    if (!content) throw new Error('the transcript is empty');
    return 'text' in content
      ? content.text
      : new TextDecoder().decode(Uint8Array.from(atob(content.blob), (c) => c.charCodeAt(0)));
  }
}
