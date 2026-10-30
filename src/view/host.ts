/**
 * What the view asks of the platform and its backend: the backend's tools,
 * which keep the meetings and run the recording, and the events the
 * backend sends while it records and writes.
 */
import { McpUiMessageResultSchema, type App } from '@modelcontextprotocol/ext-apps';
import type { ViewHostMethods } from '@hearthscale/app';

/** Why something failed, in the platform's words without the SDK's error
 *  code before them. */
export const words = (e: unknown) =>
  (e instanceof Error ? e.message : String(e)).replace(/^MCP error -?\d+: /, '');

type Handler = (data: never) => void;

export class Host {
  private readonly handlers = new Map<string, Set<Handler>>();

  constructor(readonly app: App) {
    app.fallbackNotificationHandler = async ({ method, params }) => {
      if (method === 'hearthscale/events/event') {
        const { name, data } = params as { name: string; data: never };
        for (const fn of this.handlers.get(name) ?? []) fn(data);
      } else {
        for (const fn of this.handlers.get(method) ?? []) fn(params as never);
      }
    };
  }

  /** Keeps a file as an asset of the app; answers its id. */
  async upload(params: ViewHostMethods['hearthscale/ui/upload-file']['params']): Promise<string> {
    return (await this.request<ViewHostMethods['hearthscale/ui/upload-file']['result']>('hearthscale/ui/upload-file', params)).asset;
  }

  /** Calls a tool of the backend and answers its structured result; a
   *  failure rejects with the tool's words. `label` names the control
   *  the person pressed, for a card that asks them. */
  async tool<T>(name: string, args: object = {}, label?: string): Promise<T> {
    const result = await this.app.callServerTool({
      name,
      arguments: args as Record<string, unknown>,
      ...(label && { _meta: { 'hearthscale/label': label } }),
    });
    if (result.isError) {
      const text = result.content?.find((c) => c.type === 'text');
      throw new Error(text && 'text' in text ? text.text : `${name} failed`);
    }
    return result.structuredContent as T;
  }

  /** Sends a request of the platform's bridge and answers its result. */
  async request<T>(method: string, params: object): Promise<T> {
    return (await this.app.request({ method, params } as never, McpUiMessageResultSchema)) as unknown as T;
  }

  /** Hears one of the backend's events, or a notification of the platform
   *  by its method, until the answer is called. */
  on<T>(name: string, fn: (data: T) => void): () => void {
    const set = this.handlers.get(name) ?? new Set();
    set.add(fn as Handler);
    this.handlers.set(name, set);
    return () => set.delete(fn as Handler);
  }
}
