// Atelier service worker.
//
//  * Precaches the offline page, brand icons and manifest.
//  * Pages (the start page and boards): network first, a copy is kept for offline starts. Anything
//    that is not one of those pages, or that came back as a redirect, an error, non-HTML or with a
//    Set-Cookie header, is never stored. Login pages, /settings and /api/* are never touched.
//  * /_next/static/*: stale-while-revalidate (files are content-hashed).
//  * Images from other origins (R2): cache-first in `atelier-images`, capped at 500 entries.
//  * Updates wait. A new worker only takes over when the page asks (message SKIP_WAITING), which
//    the page does when no board is open, so nobody's board is swapped out from under them. The
//    worker never reloads or navigates a page.
//
// Bump VERSION whenever the caching rules change. The image cache has no version on purpose: it
// holds the owner's pictures and must survive code updates.
const VERSION = "v1";
const SHELL = `atelier-shell-${VERSION}`;
const PAGES = `atelier-pages-${VERSION}`;
const STATIC = `atelier-static-${VERSION}`;
const IMAGES = "atelier-images";
const KEEP = [SHELL, PAGES, STATIC, IMAGES];

const MAX_IMAGES = 500;
const MAX_STATIC = 300;
const MAX_PAGES = 30;

// The start page is kept in the page cache (see install) so a first offline start works.
const PRECACHE = [
  "/offline.html",
  "/manifest.webmanifest",
  "/brand/icon-192.png",
  "/brand/icon-512.png",
  "/brand/favicon.svg",
  "/brand/atelier-lockup-light.svg",
  "/brand/atelier-lockup-dark.svg",
];

const IMAGE_FILE = /\.(?:avif|webp|png|jpe?g|gif|svg)$/i;

/** Pages whose HTML carries no account details, so a copy may be kept. */
function isShellPage(pathname) {
  return pathname === "/" || pathname.startsWith("/b/");
}

/** Never handled by the worker at all. */
function isPrivate(pathname) {
  return pathname === "/api" || pathname.startsWith("/api/") || pathname === "/login" || pathname.startsWith("/login/");
}

const pageKey = (url) => url.origin + url.pathname;

self.addEventListener("install", (event) => {
  // No skipWaiting here: an updated worker waits until the page says it is safe (see header).
  event.waitUntil(
    Promise.all([
      caches.open(SHELL).then((cache) =>
        Promise.all(
          PRECACHE.map(async (path) => {
            try {
              const response = await fetch(path, { credentials: "same-origin", redirect: "manual" });
              if (response.ok && !response.redirected && response.type !== "opaqueredirect") await cache.put(path, response);
            } catch {
              // Offline while installing: cached on a later visit.
            }
          }),
        ),
      ),
      // The start page, under the same rules as any other page (a signed-out redirect is not kept).
      caches.open(PAGES).then(async (cache) => {
        try {
          const response = await fetch("/", { credentials: "same-origin", redirect: "manual" });
          const url = new URL("/", self.location.origin);
          if (isCacheablePage(url, response)) await cache.put(pageKey(url), response);
        } catch {
          // Offline while installing.
        }
      }),
    ]),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n.startsWith("atelier-") && !KEEP.includes(n)).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

/** Delete the oldest entries until at most `max` remain (a Cache lists keys oldest first). */
async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

function isCacheablePage(url, response) {
  return (
    isShellPage(url.pathname) &&
    response.ok &&
    response.status === 200 &&
    !response.redirected &&
    response.type === "basic" &&
    !response.headers.has("set-cookie") &&
    (response.headers.get("content-type") || "").includes("text/html")
  );
}

async function navigate(event, request, url) {
  try {
    const response = await fetch(request);
    if (isCacheablePage(url, response)) {
      const copy = response.clone();
      event.waitUntil(
        caches
          .open(PAGES)
          .then((cache) => cache.put(pageKey(url), copy))
          .then(() => trim(PAGES, MAX_PAGES)),
      );
    }
    return response;
  } catch {
    if (isShellPage(url.pathname)) {
      const cached = await caches.match(pageKey(url), { cacheName: PAGES });
      if (cached) return cached;
    }
    return (await caches.match("/offline.html")) || Response.error();
  }
}

async function staleWhileRevalidate(event, request) {
  const cache = await caches.open(STATIC);
  const cached = await cache.match(request);
  const refresh = fetch(request)
    .then(async (response) => {
      if (response.ok && response.status === 200) {
        await cache.put(request, response.clone());
        await trim(STATIC, MAX_STATIC);
      }
      return response;
    })
    .catch(() => undefined);
  if (cached) {
    event.waitUntil(refresh);
    return cached;
  }
  return (await refresh) || Response.error();
}

async function cacheFirst(request, cacheName, max) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    // Only whole, readable responses: not errors, not 206 ranges, not opaque (they cost ~7 MB of quota each).
    if (response.ok && response.status === 200 && response.type !== "opaque") {
      await cache.put(request, response.clone());
      await trim(cacheName, max);
    }
    return response;
  } catch {
    return Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  if (sameOrigin) {
    if (isPrivate(url.pathname)) return; // API and login: always the network, never stored
    if (request.mode === "navigate") {
      event.respondWith(navigate(event, request, url));
    } else if (url.pathname.startsWith("/_next/static/")) {
      event.respondWith(staleWhileRevalidate(event, request));
    } else if (url.pathname.startsWith("/brand/") || url.pathname === "/manifest.webmanifest" || url.pathname === "/offline.html") {
      event.respondWith(cacheFirst(request, SHELL, MAX_STATIC));
    }
    return;
  }

  // Other origins: only pictures (R2), and never ranged requests.
  const isImage = request.destination === "image" || IMAGE_FILE.test(url.pathname);
  if (isImage && !request.headers.has("range")) event.respondWith(cacheFirst(request, IMAGES, MAX_IMAGES));
});
