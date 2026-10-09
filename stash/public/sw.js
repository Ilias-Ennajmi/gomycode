// Stash service worker (playbook step 3.8).
// - Precaches the app shell (start page + offline page).
// - Network-first with a cached fallback for page navigations and Supabase REST reads.
// - Stale-while-revalidate for images, with a size cap.
// Bump VERSION whenever these caching rules change.
const VERSION = "v2";
const SHELL = `stash-shell-${VERSION}`;
const DATA = `stash-data-${VERSION}`;
const IMAGES = `stash-img-${VERSION}`;
const OPAQUE = `stash-img-opaque-${VERSION}`;
const STATIC = `stash-static-${VERSION}`;
const MAX_IMAGES = 300;
const MAX_OPAQUE_IMAGES = 30; // opaque responses count ~7 MB each against quota
const MAX_STATIC = 200;
const MAX_DATA = 200;
const PRECACHE = ["/today", "/offline.html", "/icons/icon-192.png", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) =>
        Promise.all(
          PRECACHE.map(async (url) => {
            try {
              const response = await fetch(url, { credentials: "include", redirect: "manual" });
              if (response.ok && !response.redirected) await cache.put(url, response);
            } catch {
              // Offline during install: cached on the next successful visit.
            }
          }),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("stash-") && ![SHELL, DATA, IMAGES, OPAQUE, STATIC].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

async function networkFirst(request, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok && !response.redirected && response.type !== "opaqueredirect") {
      cache.put(request, response.clone());
      if (cacheName === DATA) trim(DATA, MAX_DATA);
    }
    return response;
  } catch {
    // ?source=android&v=… and shortcut params shouldn't miss the cache offline.
    const cached = (await cache.match(request, { ignoreVary: true })) ?? (await cache.match(request, { ignoreVary: true, ignoreSearch: true }));
    if (cached) return cached;
    if (fallbackUrl) return (await caches.match(fallbackUrl)) ?? Response.error();
    return Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(IMAGES);
  const cached = (await cache.match(request)) ?? (await caches.open(OPAQUE).then((c) => c.match(request)));
  const network = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
        trim(IMAGES, MAX_IMAGES);
      } else if (response.type === "opaque") {
        const copy = response.clone();
        caches.open(OPAQUE).then((c) => c.put(request, copy).then(() => trim(OPAQUE, MAX_OPAQUE_IMAGES)));
      }
      return response;
    })
    .catch(() => cached);
  return cached ?? network;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // Never intercept auth or Next internals that must be fresh.
  if (url.origin === self.location.origin && (url.pathname.startsWith("/auth/") || url.pathname.startsWith("/api/auth"))) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, SHELL, "/offline.html"));
    return;
  }
  // Supabase REST reads (saves, insights, …): network first, cached when offline.
  if (url.hostname.endsWith(".supabase.co") && url.pathname.startsWith("/rest/v1/")) {
    event.respondWith(networkFirst(request, DATA));
    return;
  }
  if (request.destination === "image") {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }
  // Hashed static assets are immutable: cache first.
  if (url.origin === self.location.origin && url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(STATIC).then((c) => c.put(request, copy).then(() => trim(STATIC, MAX_STATIC)));
            }
            return response;
          }),
      ),
    );
  }
});
