const CACHE_NAME = 'pei-foodie-road-trip-v29';
const PHOTO_CACHE = 'pei-foodie-road-trip-photos-v1';
const CORE_ASSETS = [
  './',
  './index.html',
  './app.js',
  './manifest.webmanifest',
  './sw.js',
  './icon.svg',
  './apple-touch-icon.png',
  './vendor/leaflet/leaflet.js',
  './vendor/leaflet/leaflet.css',
  './vendor/leaflet/images/marker-icon.png',
  './vendor/leaflet/images/marker-icon-2x.png',
  './vendor/leaflet/images/marker-shadow.png',
  './vendor/leaflet/images/layers.png',
  './vendor/leaflet/images/layers-2x.png'
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

// Same-origin requests — navigations (index.html) and assets like app.js — are
// network-first so code and itinerary updates land on the next reload when
// online, with the cache as the offline fallback. (app.js used to be cache-first,
// which left returning visitors on stale code until the cache version changed.)
// Cross-origin images (Wikimedia photos) are served from the opt-in photo cache.
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
});
