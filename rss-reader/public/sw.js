// Offline support for Reader (web and the Android app).
//
// - The app itself (pages and Next.js assets) is cached, so it opens without a connection.
// - Lists and articles are fetched from the network first and cached; offline, the last
//   copy is used. Articles in Later are cached ahead of time (see "cache-later" below).
// - Images are served from cache when possible and refreshed in the background.
// Bump VERSION when this file's caching rules change.

const VERSION = "v1";
const APP_CACHE = `reader-app-${VERSION}`;
const DATA_CACHE = `reader-data-${VERSION}`;
const IMAGE_CACHE = `reader-images-${VERSION}`;
const MAX_IMAGES = 300;
const MAX_DATA = 400;
// Next.js sends "Vary: RSC, Next-Router-…" on every response; those headers don't change
// what our data looks like, so they mustn't make an offline lookup miss.
const MATCH = { ignoreVary: true };

const PRECACHE = ["/reader", "/offline.html", "/icons/icon-192.png", "/icons/icon.svg"];

// Data that's safe and useful to show from cache when offline.
const CACHEABLE_API = [
  /^\/api\/articles(\?|$)/,
  /^\/api\/articles\/[^/]+(\/full)?$/,
  /^\/api\/feeds(\?|$)/,
  /^\/api\/categories(\?|$)/,
  /^\/api\/news(\/insights|\/prefs)?(\?|$)/,
  /^\/api\/digest(\?|$)/,
  /^\/api\/weather(\?|$)/,
  /^\/api\/filters(\?|$)/,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(APP_CACHE)
      // One failing URL (e.g. signed out) shouldn't stop the worker from installing.
      .then((cache) => Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("reader-") && !key.endsWith(`-${VERSION}`))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

// Only keep real answers: a redirect to /login or an error page must not replace a good copy.
function worthKeeping(response) {
  return response && response.ok && !response.redirected;
}

async function networkFirst(request, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (worthKeeping(response)) {
      cache.put(request, response.clone());
      if (cacheName === DATA_CACHE) trim(DATA_CACHE, MAX_DATA);
    }
    return response;
  } catch (error) {
    const cached =
      (await cache.match(request, MATCH)) ||
      (fallbackUrl && (await caches.match(fallbackUrl, MATCH)));
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request, MATCH);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) (await caches.open(cacheName)).put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(request);
  const refresh = fetch(request)
    .then((response) => {
      // Cross-origin images come back opaque (status 0); they're still fine to show.
      if (response.ok || response.type === "opaque") {
        cache.put(request, response.clone());
        trim(IMAGE_CACHE, MAX_IMAGES);
      }
      return response;
    })
    .catch(() => cached);
  return cached || refresh;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (request.destination === "image") {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(cacheFirst(request, APP_CACHE));
    return;
  }
  if (request.mode === "navigate") {
    // Only the app's own pages; /login and /share always need the network.
    if (url.pathname === "/reader" || url.pathname === "/") {
      event.respondWith(networkFirst(request, APP_CACHE, "/reader"));
    } else if (!url.pathname.startsWith("/login") && !url.pathname.startsWith("/share")) {
      event.respondWith(
        fetch(request).catch(async () => (await caches.match("/offline.html")) || Response.error())
      );
    }
    return;
  }
  if (CACHEABLE_API.some((pattern) => pattern.test(url.pathname + url.search))) {
    event.respondWith(networkFirst(request, DATA_CACHE));
  }
});

// The app asks for everything in Later to be saved for offline reading.
self.addEventListener("message", (event) => {
  if (event.data?.type !== "cache-later") return;
  event.waitUntil(
    (async () => {
      const cache = await caches.open(DATA_CACHE);
      const res = await fetch("/api/articles?later=queue&limit=50").catch(() => null);
      if (!worthKeeping(res)) return;
      const { articles = [] } = await res.clone().json();
      for (const article of articles) {
        for (const path of [`/api/articles/${article.id}`, `/api/articles/${article.id}/full`]) {
          if (await cache.match(path, MATCH)) continue;
          const response = await fetch(path).catch(() => null);
          if (worthKeeping(response)) await cache.put(path, response);
        }
      }
    })()
  );
});
