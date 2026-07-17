/**
 * NEXUS — Service Worker
 *
 * Caching strategy:
 *   - App shell (index.html, manifest, icons) → stale-while-revalidate
 *     (fast load, background update)
 *   - API/data requests (/api/*, /ready, /health) → network-first
 *     (always try live, fall back to cache for offline)
 *   - Static assets (.svg, .json, .css, .js) → cache-first
 *
 * Cache name includes a version. Bump CACHE_VERSION when the shell
 * changes meaningfully, otherwise old installs serve stale HTML
 * indefinitely.
 */

const CACHE_VERSION = 'v2.97.11';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const DATA_CACHE  = `${CACHE_VERSION}-data`;

// Files that make up the app shell — pre-cached on install
const SHELL_URLS = [
  '/',
  '/manifest.json',
  '/icon-192.svg',
  '/icon-512.svg',
];

// ── Install: pre-cache the shell ──
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: clean up old caches ──
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => !k.startsWith(CACHE_VERSION)).map((k) => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

// ── Fetch: routing strategy ──
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;            // pass-through writes
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // pass-through cross-origin

  // API / health / ready endpoints → network-first
  if (url.pathname.startsWith('/api/')
      || url.pathname === '/ready'
      || url.pathname === '/health') {
    event.respondWith(networkFirst(request, DATA_CACHE));
    return;
  }

  // Shell HTML → network-first. Always fetch the latest build; fall back to
  // cache only when genuinely offline. (Stale-while-revalidate served the
  // OLD html first on every load, so bug fixes didn't reach users until a
  // second reload — they perceived a broken, frozen UI.)
  if (url.pathname === '/' || url.pathname.endsWith('.html')) {
    event.respondWith(networkFirst(request, SHELL_CACHE));
    return;
  }

  // Everything else (icons, manifest, css if any) → cache-first
  event.respondWith(cacheFirst(request, SHELL_CACHE));
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (e) {
    return new Response('Offline and not cached', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  }
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (e) {
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ offline: true, message: 'No network and no cached response' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkPromise = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  return cached || networkPromise || new Response('Offline', { status: 503 });
}

// ── Allow the page to ask us to update (used for manual refresh) ──
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
