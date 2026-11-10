// Stash service worker (playbook step 3.8).
// - Precaches the app shell (start page + offline page).
// - Network-first with a cached fallback for page navigations and Supabase REST reads.
// - Stale-while-revalidate for images, with a size cap.
// - Web Push: reminders and "Your 5 for today" (playbook step 3.9); a tap opens the right screen.
// - Share target (POST /share/receive, multipart): a shared screenshot is kept in the
//   "stash-share-inbox" Cache and the save sheet opens on /share?shared-image=<id>.
// - A new identity on this device (message "identity-changed") empties the Supabase REST
//   cache, so nothing cached for the previous identity is served offline to the new one.
// - Shared images left in the inbox for more than an hour are deleted (on activate and
//   on each share).
// Bump VERSION whenever these caching rules or the precached files change (v6: new brand icon and offline page).
const VERSION = "v6";
const SHARED_AT = "X-Stash-Shared-At"; // header on inbox entries (epoch ms)
const SHARE_MAX_AGE_MS = 60 * 60 * 1000;
const SHARE_INBOX = "stash-share-inbox"; // not versioned: a shared image must survive an update
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
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("stash-") && ![SHELL, DATA, IMAGES, OPAQUE, STATIC, SHARE_INBOX].includes(k)).map((k) => caches.delete(k))))
      .then(() => pruneShareInbox())
      .then(() => self.clients.claim()),
  );
});

/** Deletes shared images older than an hour. An entry without a stamp (older SW) gets one now. */
async function pruneShareInbox(now = Date.now()) {
  try {
    const cache = await caches.open(SHARE_INBOX);
    for (const req of await cache.keys()) {
      const res = await cache.match(req);
      const at = Number(res?.headers.get(SHARED_AT));
      if (!res) continue;
      if (!at) {
        const headers = new Headers(res.headers);
        headers.set(SHARED_AT, String(now));
        await cache.put(req, new Response(await res.blob(), { headers }));
      } else if (now - at > SHARE_MAX_AGE_MS) {
        await cache.delete(req);
      }
    }
  } catch {
    // Best effort: tried again on the next share or update.
  }
}

// The page tells the worker when this device got a new identity.
self.addEventListener("message", (event) => {
  if (event.origin && event.origin !== self.location.origin) return;
  if (event.data && event.data.type === "identity-changed") {
    event.waitUntil(caches.delete(DATA));
  }
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

const SHARE_FIELDS = ["title", "text", "url"];

/** The share target: keep the image on the phone (no identity is needed yet), then open the save sheet. */
async function receiveShare(request) {
  const params = new URLSearchParams();
  try {
    const form = await request.formData();
    for (const k of SHARE_FIELDS) {
      const v = form.get(k);
      if (typeof v === "string" && v.trim()) params.set(k, v.slice(0, 2000));
    }
    const file = form.getAll("media").find((f) => typeof f !== "string" && f.type && f.type.startsWith("image/"));
    if (file) {
      const id = self.crypto.randomUUID();
      const cache = await caches.open(SHARE_INBOX);
      await cache.put(`/share/inbox/${id}`, new Response(file, { headers: { "Content-Type": file.type, [SHARED_AT]: String(Date.now()) } }));
      params.set("shared-image", id);
    }
    await pruneShareInbox();
  } catch {
    // Unreadable form: the sheet says "No link found" and nothing is lost on the phone.
  }
  const query = params.toString();
  return Response.redirect(new URL(`/share${query ? `?${query}` : ""}`, self.location.origin).href, 303);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method === "POST" && url.origin === self.location.origin && url.pathname === "/share/receive") {
    event.respondWith(receiveShare(request));
    return;
  }
  if (request.method !== "GET") return;

  // Never intercept auth or Next internals that must be fresh.
  if (url.origin === self.location.origin && (url.pathname.startsWith("/auth/") || url.pathname.startsWith("/api/auth"))) return;

  // Map tiles: Leaflet loads hundreds of opaque images; leave them to the browser's HTTP cache.
  if (url.hostname.endsWith("tile.openstreetmap.org")) return;

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

// Web Push. Payload: { title, body, url, tag } (see lib/server/cron.ts).
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = typeof data.title === "string" && data.title ? data.title : "Stash";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof data.body === "string" ? data.body : "",
      tag: typeof data.tag === "string" ? data.tag : undefined,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: typeof data.url === "string" ? data.url : "/today" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // Only paths inside Stash: a payload can't send the user to another site.
  const target = new URL(event.notification.data?.url || "/today", self.location.origin);
  const url = target.origin === self.location.origin ? target.href : new URL("/today", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          return client.focus().then((c) => (c && "navigate" in c ? c.navigate(url) : undefined));
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
