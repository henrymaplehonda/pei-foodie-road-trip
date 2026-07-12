const CACHE_NAME = 'pei-foodie-road-trip-v13';
const PHOTO_CACHE = 'pei-foodie-road-trip-photos-v1';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './sw.js',
  './icon.svg',
  './apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith('pei-foodie-road-trip-') && key !== CACHE_NAME && key !== PHOTO_CACHE)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// index.html and navigations are network-first so itinerary updates appear on
// the next reload without a cache-version bump; everything else same-origin is
// cache-first. Cross-origin images (Wikimedia photos) are served from the
// opt-in photo cache when present.
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    event.respondWith(
      caches.open(PHOTO_CACHE)
        .then((cache) => cache.match(request, { ignoreVary: true }))
        .then((cached) => cached || fetch(request))
    );
    return;
  }

  const isNavigation = request.mode === 'navigate'
    || url.pathname.endsWith('/index.html')
    || url.pathname.endsWith('/');

  if (isNavigation) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});
