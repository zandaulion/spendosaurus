// Stamped at boot from the contents of web/, by server/serve-sw.js. A
// version nobody has to remember to bump cannot be forgotten.
const CACHE_NAME = 'spendosaurus-__BUILD_VERSION__';

importScripts('/sw-update.js');

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
    await self.clients.claim();
    // Announce rather than navigate: forcing a reload discards whatever the
    // person had on screen and not yet saved.
    await announceUpdate();
  })());
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Never intercept API requests
  if (url.pathname.startsWith('/api/') || e.request.method !== 'GET') {
    return;
  }

  // Network-first for EVERYTHING: Always get latest from server if online, fallback to cache only if offline
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then((networkRes) => {
        if (networkRes.ok) {
          const clone = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        }
        return networkRes;
      })
      .catch(() => {
        return caches.match(e.request).then((cached) => {
          if (cached) return cached;
          if (e.request.mode === 'navigate') return caches.match('/index.html');
          return new Response('Offline', { status: 503, statusText: 'Offline' });
        });
      })
  );
});
