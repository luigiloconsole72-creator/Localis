import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');
const origin = 'https://localis.test';

function worker() {
  const stores = new Map<string, Map<string, Response>>();
  const listeners: Record<string, (event: any) => void> = {};
  const messages: any[] = [];
  const cachedPages: string[] = [];
  const caches = {
    async open(name: string) {
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name)!;
      return {
        async match(request: Request) { return entries.get(request.url)?.clone(); },
        async put(request: Request, response: Response) {
          // The browser rejects custom schemes; the old keys caused every save to fail.
          if (!/^https?:/.test(request.url)) throw new TypeError('Unsupported request scheme');
          entries.set(request.url, response.clone());
        },
        async delete(request: Request) { return entries.delete(request.url); },
        async addAll(urls: string[]) { cachedPages.push(...urls); },
      };
    },
  };
  const context = {
    self: { location: { origin }, addEventListener(type: string, fn: any) { listeners[type] = fn; } },
    caches, Request, Response, URL, Uint8Array,
    fetch: async () => new Response(new Uint8Array([10, 20, 30, 40]), {
      headers: { 'Content-Length': '4', 'Content-Type': 'audio/mpeg' },
    }),
  };
  runInNewContext(source, context);
  return {
    messages, cachedPages,
    async message(data: object) {
      let pending: Promise<unknown> | undefined;
      listeners.message({ data, source: {
        url: `${origin}/access/test?lang=de`, postMessage(value: any) { messages.push(value); },
      }, waitUntil(promise: Promise<unknown>) { pending = promise; } });
      expect(pending).toBeDefined();
      await pending;
    },
    async audio(range?: string) {
      let response: Promise<Response> | undefined;
      listeners.fetch({ request: new Request(`${origin}/sw-audio/ostuni/de`, {
        headers: range ? { Range: range } : {},
      }), respondWith(value: Promise<Response>) { response = value; } });
      return (await response)!;
    },
  };
}

const save = {
  type: 'SAVE_OFFLINE', slug: 'ostuni', lang: 'de',
  url: 'https://storage.test/guides/ostuni-de.mp3?signature=test',
  assets: [`${origin}/_astro/player.js`, `${origin}/_astro/style.css`, 'https://analytics.test/tag.js'],
};

describe('service worker offline download', () => {
  it('saves audio and its index with browser-compatible keys and supports byte ranges', async () => {
    const sw = worker();
    await sw.message(save);
    expect(sw.messages.at(-1)).toMatchObject({ type: 'OFFLINE_DONE', size: 4 });
    await sw.message({ type: 'GET_OFFLINE_STATUS', slug: 'ostuni', lang: 'de' });
    expect(sw.messages.at(-1)).toMatchObject({ available: true, size: 4 });
    const response = await sw.audio('bytes=1-2');
    expect(response.status).toBe(206);
    expect(response.headers.get('Content-Range')).toBe('bytes 1-2/4');
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([20, 30]);
  });

  it('preserves the first access page and player assets for an offline reopen', async () => {
    const sw = worker();
    await sw.message(save);
    expect(sw.cachedPages).toEqual([
      `${origin}/access/test?lang=de`, `${origin}/_astro/player.js`, `${origin}/_astro/style.css`,
    ]);
  });

  it('deletes both the saved audio and its availability record', async () => {
    const sw = worker();
    await sw.message(save);
    await sw.message({ type: 'DELETE_OFFLINE', slug: 'ostuni', lang: 'de' });
    expect((await sw.audio()).status).toBe(404);
    await sw.message({ type: 'GET_OFFLINE_STATUS', slug: 'ostuni', lang: 'de' });
    expect(sw.messages.at(-1)).toMatchObject({ available: false });
  });
});
