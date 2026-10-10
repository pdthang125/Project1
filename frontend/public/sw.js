/* ====================================================
   VKU Field Survey — Service Worker (Cache-First PWA)
   ==================================================== */
const CACHE_VERSION = 'vku-v3';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;

/* Pre-cache only known stable assets (no hashed JS bundle) */
const PRE_CACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

/* ── Install ── */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRE_CACHE_ASSETS))
  );
  self.skipWaiting();
});

/* ── Activate: clean old caches ── */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== DYNAMIC_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

/* ── Fetch: Cache-First for static, Network-First for API ── */
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  /* Skip non-GET and cross-origin API calls */
  if (event.request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/')) return;

  /* Cache-First strategy */
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request)
        .then((response) => {
          if (!response || !response.ok || response.type === 'opaque') {
            return response;
          }
          /* Dynamically cache JS/CSS/font assets */
          const isAsset =
            url.pathname.endsWith('.js') ||
            url.pathname.endsWith('.css') ||
            url.pathname.endsWith('.png') ||
            url.pathname.endsWith('.jpg') ||
            url.pathname.includes('/assets/');

          if (isAsset) {
            const responseToCache = response.clone();
            caches.open(DYNAMIC_CACHE).then((cache) =>
              cache.put(event.request, responseToCache)
            );
          }
          return response;
        })
        .catch(() => {
          /* Fallback to index.html for navigation requests */
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
        });
    })
  );
});

/* ── Background Sync ── */
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-surveys') {
    event.waitUntil(
      self.clients.matchAll().then((clients) =>
        clients.forEach((client) =>
          client.postMessage({ type: 'TRIGGER_SYNC' })
        )
      )
    );
  }
});