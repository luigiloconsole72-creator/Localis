const AUDIO_CACHE = 'localis-audio-v2';  // keep v2: preserves user-saved audio on SW update
const STATIC_CACHE = 'localis-static-v3';
const OFFLINE_INDEX_KEY = new URL('/sw-cache/offline-index', self.location.origin).href;

// Cache Storage accepts only HTTP(S) requests, including synthetic keys.
function audioCacheKey(pathname) {
  return new Request(new URL(`/sw-cache/audio${pathname}`, self.location.origin).href);
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      cache.addAll(['/', '/offline.html', '/favicon.svg']).catch(() => {}),
    ),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== AUDIO_CACHE && k !== STATIC_CACHE)
            .map((k) => caches.delete(k)),
        ),
      ),
      self.clients.claim(),
    ]),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Synthetic local audio endpoint — serves cached guide audio with Range support
  if (url.pathname.startsWith('/sw-audio/')) {
    event.respondWith(handleSwAudio(url.pathname, event.request));
    return;
  }

  // /api/audio-url: network-first; if offline and audio is cached, return synthetic local URL
  if (url.pathname === '/api/audio-url' && event.request.method === 'GET') {
    event.respondWith(handleAudioUrlApi(event.request, url));
    return;
  }

  // Guide audio on R2 — serve from cache if saved offline, else stream from network
  if (url.hostname.endsWith('.r2.cloudflarestorage.com')) {
    event.respondWith(handleGuideAudio(event.request));
    return;
  }

  // Trailers — cache automatically on first fetch (small files)
  if (url.pathname.startsWith('/audio/trailers/')) {
    event.respondWith(handleTrailerAudio(event.request));
    return;
  }

  // Access pages — cache HTML on first load so they open offline
  if (event.request.mode === 'navigate' && url.pathname.startsWith('/access/')) {
    event.respondWith(handleAccessPage(event.request));
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/offline.html')),
    );
    return;
  }

  if (
    url.pathname.startsWith('/_astro/') ||
    url.pathname.startsWith('/images/') ||
    url.pathname === '/favicon.svg'
  ) {
    event.respondWith(
      caches.match(event.request).then((cached) =>
        cached ||
        fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then((c) => c.put(event.request, clone));
          }
          return response;
        }),
      ),
    );
    return;
  }
});

// Cache access/[token] HTML on first load; serve from cache when offline
async function handleAccessPage(request) {
  const cache = await caches.open(STATIC_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    return caches.match('/offline.html');
  }
}

// /api/audio-url: try network; if offline, check if audio is saved and return synthetic URL
async function handleAudioUrlApi(request, url) {
  try {
    return await fetch(request);
  } catch {
    // Offline — check if this guide has cached audio
    const slug = url.searchParams.get('guide');
    const lang = url.searchParams.get('lang') || 'it';
    if (!slug) {
      return new Response(JSON.stringify({ error: 'offline' }), {
        status: 503, headers: { 'Content-Type': 'application/json' },
      });
    }
    const index = await getOfflineIndex();
    if (index[`${slug}::${lang}`]) {
      return new Response(
        JSON.stringify({ url: `/sw-audio/${slug}/${lang}`, expires_in: 999999 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return new Response(
      JSON.stringify({ error: 'Audio non disponibile offline. Salva la guida prima di partire.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }
}

// Serve /sw-audio/{slug}/{lang} from the offline cache with Range support
async function handleSwAudio(pathname, request) {
  // pathname: /sw-audio/bari-vecchia/it
  const parts = pathname.replace('/sw-audio/', '').split('/');
  const slug = parts[0];
  const lang = parts[1];
  if (!slug || !lang) {
    return new Response('Not found', { status: 404 });
  }

  const index = await getOfflineIndex();
  const entry = index[`${slug}::${lang}`];
  if (!entry?.pathname) {
    return new Response('Audio non salvato offline', { status: 404 });
  }

  const cache = await caches.open(AUDIO_CACHE);
  const cacheKey = audioCacheKey(entry.pathname);
  const cached = await cache.match(cacheKey);
  if (!cached) {
    return new Response('Audio non trovato in cache', { status: 404 });
  }

  const rangeHeader = request ? request.headers.get('Range') : null;
  if (rangeHeader) return serveRange(cached, rangeHeader);
  return cached.clone();
}

// Guide audio on R2 — serves from cache (Range-aware) if saved, else streams from network
async function handleGuideAudio(request) {
  const url = new URL(request.url);
  const cacheKey = audioCacheKey(url.pathname);

  const cache = await caches.open(AUDIO_CACHE);
  const cached = await cache.match(cacheKey);

  if (cached) {
    const rangeHeader = request.headers.get('Range');
    if (rangeHeader) return serveRange(cached, rangeHeader);
    return cached.clone();
  }

  try {
    return await fetch(request);
  } catch {
    return new Response('Audio non disponibile offline. Salva la guida prima di partire.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

// Trailers: cache-first, auto-cache on first fetch
async function handleTrailerAudio(request) {
  const cacheKey = new Request(new URL(request.url).pathname, { headers: {} });
  const cache = await caches.open(AUDIO_CACHE);
  const cached = await cache.match(cacheKey);

  if (cached) {
    const rangeHeader = request.headers.get('Range');
    if (rangeHeader) return serveRange(cached, rangeHeader);
    return cached.clone();
  }

  try {
    const response = await fetch(request);
    if (response.ok && response.status === 200) {
      cache.put(cacheKey, response.clone()).catch(() => {});
    }
    return response;
  } catch (err) {
    const fallback = await cache.match(cacheKey);
    if (fallback) return fallback;
    throw err;
  }
}

// Serve a Range request from a fully-cached Response
async function serveRange(cachedResponse, rangeHeader) {
  const buffer = await cachedResponse.arrayBuffer();
  const total = buffer.byteLength;

  const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
  if (!match) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${total}` } });
  }

  const start = parseInt(match[1], 10);
  const end = match[2] ? parseInt(match[2], 10) : total - 1;
  const clampedEnd = Math.min(end, total - 1);

  if (start > clampedEnd || start >= total) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${total}` } });
  }

  return new Response(buffer.slice(start, clampedEnd + 1), {
    status: 206,
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Range': `bytes ${start}-${clampedEnd}/${total}`,
      'Content-Length': String(clampedEnd - start + 1),
      'Accept-Ranges': 'bytes',
    },
  });
}

// --- Offline index ---

async function getOfflineIndex() {
  const cache = await caches.open(AUDIO_CACHE);
  const res = await cache.match(new Request(OFFLINE_INDEX_KEY));
  if (!res) return {};
  return res.json().catch(() => ({}));
}

async function saveOfflineIndex(index) {
  const cache = await caches.open(AUDIO_CACHE);
  await cache.put(
    new Request(OFFLINE_INDEX_KEY),
    new Response(JSON.stringify(index), { headers: { 'Content-Type': 'application/json' } }),
  );
}

// --- Message handlers ---

self.addEventListener('message', (event) => {
  const { data, source } = event;
  if (data?.type === 'SAVE_OFFLINE')     { event.waitUntil(handleSaveOffline(data, source)); return; }
  if (data?.type === 'GET_OFFLINE_STATUS') { event.waitUntil(handleGetStatus(data, source)); return; }
  if (data?.type === 'DELETE_OFFLINE')  { event.waitUntil(handleDeleteOffline(data, source)); return; }
});

async function handleGetStatus(data, source) {
  const { slug, lang } = data;
  const index = await getOfflineIndex();
  const entry = index[`${slug}::${lang}`];
  source.postMessage({ type: 'OFFLINE_STATUS', slug, lang, available: Boolean(entry), size: entry?.size || 0 });
}

async function handleDeleteOffline(data, source) {
  const { slug, lang } = data;
  const index = await getOfflineIndex();
  const entry = index[`${slug}::${lang}`];
  if (entry?.pathname) {
    const cache = await caches.open(AUDIO_CACHE);
    await cache.delete(audioCacheKey(entry.pathname));
  }
  delete index[`${slug}::${lang}`];
  await saveOfflineIndex(index);
  source.postMessage({ type: 'OFFLINE_DELETED', slug, lang });
}

async function handleSaveOffline(data, source) {
  const { url, slug, lang } = data;
  try {
    // The first navigation and its assets precede clients.claim(). Save them
    // explicitly so a successful download also survives an offline reopen.
    const pageUrl = new URL(source.url);
    if (pageUrl.origin === self.location.origin && pageUrl.pathname.startsWith('/access/')) {
      const staticCache = await caches.open(STATIC_CACHE);
      const assets = (data.assets || []).filter((asset) => {
        const parsed = new URL(asset, self.location.origin);
        return parsed.origin === self.location.origin && parsed.pathname.startsWith('/_astro/');
      });
      await staticCache.addAll([pageUrl.href, ...new Set(assets)]);
    }

    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok || !response.body) {
      source.postMessage({ type: 'OFFLINE_ERROR', slug, lang, message: `HTTP ${response.status}` });
      return;
    }

    const total = parseInt(response.headers.get('Content-Length') || '0', 10);
    const hasSize = total > 0;
    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;
    let lastPct = -1;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.byteLength;
      if (hasSize) {
        const pct = Math.floor((received / total) * 100);
        if (pct !== lastPct) {
          lastPct = pct;
          source.postMessage({ type: 'OFFLINE_PROGRESS', slug, lang, percent: pct });
        }
      }
    }

    const full = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) { full.set(chunk, offset); offset += chunk.byteLength; }

    const pathname = new URL(url).pathname;
    const cache = await caches.open(AUDIO_CACHE);
    await cache.put(
      audioCacheKey(pathname),
      new Response(full.buffer, {
        headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': String(received), 'Accept-Ranges': 'bytes' },
      }),
    );

    const index = await getOfflineIndex();
    index[`${slug}::${lang}`] = { pathname, savedAt: Date.now(), size: received };
    await saveOfflineIndex(index);

    source.postMessage({ type: 'OFFLINE_DONE', slug, lang, size: received });
  } catch (err) {
    source.postMessage({
      type: 'OFFLINE_ERROR', slug, lang,
      message: err instanceof Error ? err.message : 'Download fallito',
    });
  }
}
