const CACHE_NAME = 'pei-foodie-road-trip-v31';
const PHOTO_CACHE = 'pei-foodie-road-trip-photos-v1';
const TILE_CACHE = 'pei-foodie-road-trip-tiles-v1';
// Keep the opt-in offline caches bounded so a long trip's browsing can't grow
// storage without limit (see trimCache below).
const PHOTO_CACHE_MAX = 400;
const TILE_CACHE_MAX = 1500;
// Hosts whose tiles we are licensed to cache for offline use. OpenStreetMap's
// standard raster tiles are served under the ODbL with attribution shown on the
// map; unlike Google's private vt endpoint they may be displayed and cached by
// a low-traffic personal site.
const TILE_HOSTS = ['tile.openstreetmap.org'];
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

// The Cache API has no built-in eviction. cache.keys() returns entries in
// insertion order (oldest first), so trimming from the front is a simple LRU-ish
// cap that keeps the most recently stored photos/tiles.
function trimCache(cacheName, max) {
  return caches.open(cacheName).then((cache) => cache.keys().then((keys) => {
    if (keys.length <= max) return;
    return Promise.all(keys.slice(0, keys.length - max).map((key) => cache.delete(key)));
  })).catch(() => {});
}

function isTileRequest(url) {
  return TILE_HOSTS.indexOf(url.hostname) !== -1;
}

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
        .filter((key) => key.startsWith('pei-foodie-road-trip-')
          && key !== CACHE_NAME && key !== PHOTO_CACHE && key !== TILE_CACHE)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// Cache-first for map tiles: once a tile has been fetched (by normal browsing or
// the "Save map for offline" pre-fetch) it renders with no connection. Tiles are
// cross-origin and load as no-cors <img> requests, so their responses are opaque
// (status 0, .ok === false); they are still safe to store, so this path caches
// them without the response.ok gate the same-origin asset path uses.
function tileResponse(request) {
  return caches.open(TILE_CACHE).then((cache) => cache.match(request, { ignoreVary: true })
    .then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response && (response.ok || response.type === 'opaque')) {
          cache.put(request, response.clone());
          trimCache(TILE_CACHE, TILE_CACHE_MAX);
        }
        return response;
      });
    }));
}

// Same-origin requests — navigations (index.html) and assets like app.js — are
// network-first so code and itinerary updates land on the next reload when
// online, with the cache as the offline fallback. (app.js used to be cache-first,
// which left returning visitors on stale code until the cache version changed.)
// Cross-origin map tiles use the tile cache above; other cross-origin images
// (Wikimedia photos) are served from the opt-in photo cache.
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    if (isTileRequest(url)) {
      event.respondWith(tileResponse(request));
      return;
    }
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
      // For a non-navigation asset (app.js, CSS, an icon), fall back to the
      // cached copy only. Never serve index.html HTML in place of a missing
      // script or image — that would corrupt the asset instead of failing it.
      .catch(() => caches.match(request).then((cached) => cached
        || new Response('Offline and not cached', { status: 504, statusText: 'Offline' })))
  );
});
