// Aria's World service worker: keeps the game playable offline once it has loaded,
// which is what makes the home-screen app work on a plane or in the car.
// Built by scripts/aria-pwa.ts, which fills in VERSION and ASSETS (paths relative to
// this file) and writes it to dist/arias-world/sw.js.
/* global self, caches, fetch, Response, URL */

const VERSION = __VERSION__;
const ASSETS = __ASSETS__;
const PREFIX = 'arias-world-';
const CACHE = PREFIX + VERSION;
const scope = new URL('./', self.location.href);
const INDEX = scope.href;
const precached = new Set(ASSETS.map((a) => new URL(a, scope).href));

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.all(
        ASSETS.map(async (asset) => {
          const url = new URL(asset, scope).href;
          // Hashed files never change, so reuse the copy from the last version.
          const old = url === INDEX ? undefined : await caches.match(url);
          if (old) return cache.put(url, old);
          const res = await fetch(url, { cache: 'reload' });
          if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
          return cache.put(url, res);
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Keep the previous version too, so a page that is still open can finish loading
      // its pictures. Cache names are listed oldest first.
      const ours = (await caches.keys()).filter((k) => k.startsWith(PREFIX) && k !== CACHE);
      await Promise.all(ours.slice(0, -1).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;

  if (req.mode === 'navigate') {
    event.respondWith(page(req));
  } else if (precached.has(url.origin + url.pathname)) {
    event.respondWith(asset(req, url.origin + url.pathname));
  }
});

/** The game page: fresh from the network when it answers in time, else the saved copy. */
async function page(req) {
  const cached = caches.match(INDEX);
  try {
    // Bypass the browser's HTTP cache so a new version shows up right after it's published.
    // Offline, fetch fails at once; the timeout only covers a very slow connection.
    const res = await Promise.race([
      fetch(req, { cache: 'no-cache' }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('slow network')), 8000)),
    ]);
    if (res.ok) return res;
  } catch {
    // offline or slow: use the saved page
  }
  return (await cached) ?? fetch(req);
}

/** Pictures, sounds, code: always from the cache. Music and video need Range support. */
async function asset(req, key) {
  const cached = await caches.match(key);
  if (!cached) return fetch(req);
  const range = req.headers.get('range');
  if (!range) return cached;
  const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  const blob = await cached.blob();
  if (!m || (m[1] === '' && m[2] === '')) return new Response(blob, { status: 200, headers: cached.headers });
  const size = blob.size;
  const start = m[1] === '' ? Math.max(0, size - Number(m[2])) : Number(m[1]);
  const end = m[1] !== '' && m[2] !== '' ? Math.min(Number(m[2]), size - 1) : size - 1;
  if (start >= size || start > end) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }
  return new Response(blob.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': cached.headers.get('Content-Type') ?? blob.type,
      'Content-Length': String(end - start + 1),
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Accept-Ranges': 'bytes',
    },
  });
}
