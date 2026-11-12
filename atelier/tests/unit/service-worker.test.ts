import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * public/sw.js is plain browser JavaScript, so it is run here in a sandbox with a fake `self`,
 * `caches` and `fetch`. The fakes keep insertion order like the real Cache does.
 */
const code = readFileSync(join(process.cwd(), "public/sw.js"), "utf8");
const ORIGIN = "https://atelier.test";

type FakeRes = Response & { _id?: string };

function res(opts: { status?: number; type?: string; redirected?: boolean; headers?: Record<string, string>; id?: string } = {}): FakeRes {
  const status = opts.status ?? 200;
  const r = {
    ok: status >= 200 && status < 300,
    status,
    type: opts.type ?? "basic",
    redirected: opts.redirected ?? false,
    headers: new Headers({ "content-type": "text/html; charset=utf-8", ...(opts.headers ?? {}) }),
    _id: opts.id,
    clone() {
      return r;
    },
  };
  return r as unknown as FakeRes;
}

class FakeCache {
  store = new Map<string, Response>();
  private key = (req: Request | string) => (typeof req === "string" ? new URL(req, ORIGIN).href : req.url);
  async put(req: Request | string, r: Response) {
    this.store.delete(this.key(req));
    this.store.set(this.key(req), r);
  }
  async match(req: Request | string, opts?: { ignoreSearch?: boolean }) {
    const k = this.key(req);
    if (this.store.has(k)) return this.store.get(k);
    if (opts?.ignoreSearch) {
      const base = k.split("?")[0];
      for (const [kk, v] of this.store) if (kk.split("?")[0] === base) return v;
    }
    return undefined;
  }
  async keys() {
    return [...this.store.keys()].map((url) => ({ url }) as Request);
  }
  async delete(req: Request | string) {
    return this.store.delete(this.key(req));
  }
}

class FakeCaches {
  all = new Map<string, FakeCache>();
  async open(name: string) {
    if (!this.all.has(name)) this.all.set(name, new FakeCache());
    return this.all.get(name)!;
  }
  async keys() {
    return [...this.all.keys()];
  }
  async delete(name: string) {
    return this.all.delete(name);
  }
  async match(req: Request | string, opts?: { cacheName?: string }) {
    for (const [name, c] of this.all) {
      if (opts?.cacheName && opts.cacheName !== name) continue;
      const hit = await c.match(req);
      if (hit) return hit;
    }
    return undefined;
  }
}

type Req = { url: string; method?: string; mode?: string; destination?: string; headers?: Headers };
const req = (path: string, over: Partial<Req> = {}): Request =>
  ({ url: new URL(path, ORIGIN).href, method: "GET", mode: "cors", destination: "", headers: new Headers(), ...over }) as unknown as Request;
const nav = (path: string) => req(path, { mode: "navigate", destination: "document" });

type Handler = (e: Record<string, unknown>) => void;

function boot(fetchImpl: (r: Request | string, init?: RequestInit) => Promise<Response>) {
  const handlers: Record<string, Handler> = {};
  const caches = new FakeCaches();
  const self = {
    location: new URL(`${ORIGIN}/sw.js`),
    addEventListener: (type: string, fn: Handler) => (handlers[type] = fn),
    skipWaiting: vi.fn(async () => {}),
    clients: { claim: vi.fn(async () => {}) },
  };
  const fetch = vi.fn(fetchImpl);
  const context = vm.createContext({ self, caches, fetch, URL, Response, Headers, Promise, console, setTimeout, clearTimeout, crypto, Date, Blob, FormData });
  // importScripts("/sw-share.js"): the share handler is loaded into the same global, like the browser does.
  Object.assign(context, {
    importScripts: (path: string) => vm.runInContext(readFileSync(join(process.cwd(), "public", path), "utf8"), context),
  });
  Object.assign(self, { indexedDB: new IDBFactory() });
  vm.runInContext(code, context);

  /** Fire a fetch event; resolves to the response the worker answered with, or "network" when it did not handle it. */
  async function dispatch(request: Request): Promise<Response | "network"> {
    let answer: Promise<Response> | undefined;
    const waits: Promise<unknown>[] = [];
    handlers.fetch({ request, respondWith: (p: Promise<Response>) => (answer = p), waitUntil: (p: Promise<unknown>) => waits.push(p) });
    if (!answer) return "network";
    const out = await answer;
    await Promise.all(waits);
    await new Promise((r) => setTimeout(r, 0)); // let fire-and-forget cache writes finish
    return out;
  }
  async function lifecycle(type: "install" | "activate") {
    const waits: Promise<unknown>[] = [];
    handlers[type]({ waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);
  }
  return { handlers, caches, self, fetch, dispatch, lifecycle };
}

const online = (map: Record<string, Response> = {}) => async (r: Request | string) => {
  const url = new URL(typeof r === "string" ? r : r.url, ORIGIN);
  return map[url.pathname] ?? res({ id: `net:${url.pathname}` });
};
const offline = async () => {
  throw new TypeError("Failed to fetch");
};

describe("install and activate", () => {
  it("precaches the offline page, icons and manifest, and does not skip waiting by itself", async () => {
    const sw = boot(online());
    await sw.lifecycle("install");
    const cached = await sw.caches.keys();
    const shell = cached.find((n) => /^atelier-shell-v\d+$/.test(n))!;
    expect(shell).toBeDefined();
    const urls = [...(await sw.caches.open(shell)).store.keys()].map((u) => new URL(u).pathname);
    expect(urls).toEqual(expect.arrayContaining(["/offline.html", "/manifest.webmanifest", "/brand/icon-192.png", "/brand/icon-512.png"]));
    const pages = [...(await sw.caches.open("atelier-pages-v2")).store.keys()].map((u) => new URL(u).pathname);
    expect(pages).toEqual(["/"]); // the start page, so a first offline start works
    expect(sw.self.skipWaiting).not.toHaveBeenCalled();
  });

  it("does not precache redirects or errors (a signed-out start page redirects to /login)", async () => {
    const sw = boot(async (r) => {
      const p = new URL(typeof r === "string" ? r : r.url, ORIGIN).pathname;
      if (p === "/") return res({ redirected: true });
      if (p === "/offline.html") return res({ status: 500 });
      return res();
    });
    await sw.lifecycle("install");
    const shell = [...sw.caches.all.entries()].find(([n]) => n.startsWith("atelier-shell"))![1];
    const urls = [...shell.store.keys()].map((u) => new URL(u).pathname);
    expect(urls).not.toContain("/offline.html");
    const pages = [...sw.caches.all.entries()].find(([n]) => n.startsWith("atelier-pages"))![1];
    expect(pages.store.size).toBe(0); // the redirected start page is not kept
  });

  it("an install that is offline does not fail", async () => {
    const sw = boot(offline);
    await expect(sw.lifecycle("install")).resolves.toBeUndefined();
  });

  it("activate removes old atelier caches, keeps current ones and the image cache, ignores other names, and claims clients", async () => {
    const sw = boot(online());
    for (const n of ["atelier-shell-v0", "atelier-pages-v0", "atelier-static-v0", "atelier-images", "other-app-cache"]) await sw.caches.open(n);
    await sw.lifecycle("install");
    await sw.lifecycle("activate");
    const names = await sw.caches.keys();
    expect(names).not.toContain("atelier-shell-v0");
    expect(names).not.toContain("atelier-pages-v0");
    expect(names).not.toContain("atelier-static-v0");
    expect(names).toContain("atelier-images");
    expect(names).toContain("other-app-cache");
    expect(names.some((n) => /^atelier-shell-v\d+$/.test(n))).toBe(true);
    expect(sw.self.clients.claim).toHaveBeenCalledTimes(1);
  });

  it("skipWaiting only on request from the page", () => {
    const sw = boot(online());
    sw.handlers.message({ data: { type: "SOMETHING_ELSE" } });
    sw.handlers.message({ data: null });
    sw.handlers.message({});
    expect(sw.self.skipWaiting).not.toHaveBeenCalled();
    sw.handlers.message({ data: { type: "SKIP_WAITING" } });
    expect(sw.self.skipWaiting).toHaveBeenCalledTimes(1);
  });
});

describe("what it never touches", () => {
  it.each(["/api/boards", "/api/boards/abc/updates", "/api/assets", "/api/health", "/login", "/login/verify", "/login?next=%2F"])(
    "leaves %s to the network, for every method",
    async (path) => {
      const sw = boot(online());
      for (const method of ["GET", "POST", "PATCH", "PUT", "DELETE"]) {
        expect(await sw.dispatch(req(path, { method }))).toBe("network");
        expect(await sw.dispatch(req(path, { method, mode: "navigate", destination: "document" }))).toBe("network");
      }
      expect(await sw.caches.keys()).toEqual([]);
    },
  );

  it("leaves non-GET requests alone anywhere", async () => {
    const sw = boot(online());
    expect(await sw.dispatch(req("/", { method: "POST" }))).toBe("network");
    expect(await sw.dispatch(req("/b/x", { method: "PUT", mode: "navigate" }))).toBe("network");
  });

  it("leaves cross-origin API traffic (Supabase, uploads) alone", async () => {
    const sw = boot(online());
    expect(await sw.dispatch(req("https://abc.supabase.co/rest/v1/boards"))).toBe("network");
    expect(await sw.dispatch(req("https://abc.supabase.co/realtime/v1/websocket"))).toBe("network");
    expect(await sw.dispatch(req("https://bucket.r2.cloudflarestorage.com/up?X-Amz-Signature=1", { method: "PUT" }))).toBe("network");
  });

  it("does not cache the API even when a page asks for JSON during a navigation-like request", async () => {
    const sw = boot(online());
    await sw.dispatch(req("/api/boards", { mode: "navigate" }));
    expect([...sw.caches.all.values()].every((c) => c.store.size === 0)).toBe(true);
  });
});

describe("page navigations", () => {
  let cachedPages: (sw: ReturnType<typeof boot>) => string[];
  beforeEach(() => {
    cachedPages = (sw) =>
      [...sw.caches.all.entries()].filter(([n]) => n.startsWith("atelier-pages")).flatMap(([, c]) => [...c.store.keys()].map((u) => new URL(u).pathname));
  });

  it("goes to the network first and keeps a copy of the app shell pages", async () => {
    const page = res({ id: "home" });
    const sw = boot(online({ "/": page }));
    expect(await sw.dispatch(nav("/"))).toBe(page);
    expect(cachedPages(sw)).toEqual(["/"]);
    const board = res({ id: "board" });
    sw.fetch.mockImplementation(online({ "/b/abc": board }));
    expect(await sw.dispatch(nav("/b/abc?x=1"))).toBe(board);
    expect(cachedPages(sw)).toEqual(["/", "/b/abc"]); // query strings are not part of the key
  });

  it("falls back to the cached copy when offline, and to offline.html when there is none", async () => {
    const page = res({ id: "home" });
    const sw = boot(online({ "/": page }));
    await sw.lifecycle("install");
    await sw.dispatch(nav("/"));
    sw.fetch.mockImplementation(offline);
    expect(await sw.dispatch(nav("/"))).toBe(page);
    const fallback = await sw.dispatch(nav("/b/never-visited"));
    expect(fallback).not.toBe("network");
    expect((fallback as FakeRes)._id).toBe("net:/offline.html"); // the precached offline page
  });

  it("offline with nothing cached at all gives a network error, not a hang", async () => {
    const sw = boot(offline);
    const out = await sw.dispatch(nav("/"));
    expect(out).toBeInstanceOf(Response);
    expect((out as Response).type).toBe("error");
  });

  it("never stores redirects, errors, non-HTML, or anything that sets a cookie", async () => {
    for (const bad of [
      res({ redirected: true }),
      res({ status: 500 }),
      res({ status: 404 }),
      res({ type: "opaque", status: 0 }),
      res({ headers: { "content-type": "application/json" } }),
      res({ headers: { "set-cookie": "sb-session=abc; Path=/; HttpOnly" } }),
    ]) {
      const sw = boot(online({ "/": bad }));
      expect(await sw.dispatch(nav("/"))).toBe(bad); // still served to the browser
      expect(cachedPages(sw)).toEqual([]);
    }
  });

  it("never stores pages that hold account details (settings) and serves offline.html for them offline", async () => {
    const sw = boot(online({ "/settings": res({ id: "settings" }) }));
    await sw.lifecycle("install");
    await sw.dispatch(nav("/settings"));
    expect(cachedPages(sw)).toEqual(["/"]); // only the start page from install
    sw.fetch.mockImplementation(offline);
    expect(((await sw.dispatch(nav("/settings"))) as FakeRes)._id).toBe("net:/offline.html");
  });

  it("a cached page is never served for a login URL", async () => {
    const sw = boot(online());
    await (await sw.caches.open("atelier-pages-v2")).put(`${ORIGIN}/login`, res({ id: "stale-login" }));
    sw.fetch.mockImplementation(offline);
    expect(await sw.dispatch(nav("/login"))).toBe("network");
  });

  it("keeps the page cache small", async () => {
    const sw = boot(online());
    for (let i = 0; i < 45; i++) {
      sw.fetch.mockImplementation(online({ [`/b/${i}`]: res({ id: `b${i}` }) }));
      await sw.dispatch(nav(`/b/${i}`));
    }
    expect(cachedPages(sw).length).toBeLessThanOrEqual(30);
    expect(cachedPages(sw)).toContain("/b/44"); // newest kept
    expect(cachedPages(sw)).not.toContain("/b/0"); // oldest dropped
  });
});

describe("static files", () => {
  it("serves /_next/static from cache while refreshing it in the background", async () => {
    const first = res({ id: "v1", headers: { "content-type": "text/javascript" } });
    const sw = boot(online({ "/_next/static/a.js": first }));
    expect(await sw.dispatch(req("/_next/static/a.js", { destination: "script" }))).toBe(first);
    const second = res({ id: "v2", headers: { "content-type": "text/javascript" } });
    sw.fetch.mockImplementation(online({ "/_next/static/a.js": second }));
    expect(await sw.dispatch(req("/_next/static/a.js", { destination: "script" }))).toBe(first); // cached answer
    sw.fetch.mockImplementation(offline);
    expect(await sw.dispatch(req("/_next/static/a.js", { destination: "script" }))).toBe(second); // refreshed copy
  });

  it("serves brand files cache-first", async () => {
    const icon = res({ id: "icon", headers: { "content-type": "image/png" } });
    const sw = boot(online({ "/brand/icon-192.png": icon }));
    await sw.dispatch(req("/brand/icon-192.png", { destination: "image" }));
    sw.fetch.mockImplementation(offline);
    expect(await sw.dispatch(req("/brand/icon-192.png", { destination: "image" }))).toBe(icon);
  });
});

describe("images from R2", () => {
  const IMG = "https://pub-abc.r2.dev/u/1/variant-1024.webp";
  const image = (extra: Partial<Req> = {}) => req(IMG, { destination: "image", ...extra });
  const png = (id: string) => res({ id, type: "cors", headers: { "content-type": "image/webp" } });

  it("is cache-first in the separate atelier-images cache", async () => {
    const first = png("a");
    const sw = boot(async () => first);
    expect(await sw.dispatch(image())).toBe(first);
    const cache = sw.caches.all.get("atelier-images")!;
    expect([...cache.store.keys()]).toEqual([IMG]);
    sw.fetch.mockClear();
    expect(await sw.dispatch(image())).toBe(first);
    expect(sw.fetch).not.toHaveBeenCalled(); // answered from the cache, no network
  });

  it("also handles image files fetched by scripts (fetch(), not <img>) from other origins", async () => {
    const sw = boot(async () => png("a"));
    expect(await sw.dispatch(req(IMG, { destination: "" }))).not.toBe("network");
    expect(await sw.dispatch(req("https://pub-abc.r2.dev/u/1/original", { destination: "" }))).toBe("network");
  });

  it("does not cache failures, partial content or opaque responses", async () => {
    for (const bad of [res({ status: 404, type: "cors" }), res({ status: 206, type: "cors" }), res({ status: 0, type: "opaque" })]) {
      const sw = boot(async () => bad);
      expect(await sw.dispatch(image())).toBe(bad);
      expect(sw.caches.all.get("atelier-images")?.store.size ?? 0).toBe(0);
    }
  });

  it("caps the cache at 500 images, dropping the oldest", async () => {
    const sw = boot(async (r) => png(typeof r === "string" ? r : r.url));
    for (let i = 0; i < 503; i++) await sw.dispatch(req(`https://pub-abc.r2.dev/i/${i}.webp`, { destination: "image" }));
    const keys = [...sw.caches.all.get("atelier-images")!.store.keys()];
    expect(keys).toHaveLength(500);
    expect(keys).not.toContain("https://pub-abc.r2.dev/i/0.webp");
    expect(keys).not.toContain("https://pub-abc.r2.dev/i/2.webp");
    expect(keys).toContain("https://pub-abc.r2.dev/i/3.webp");
    expect(keys).toContain("https://pub-abc.r2.dev/i/502.webp");
  });

  it("offline and not cached: a network error", async () => {
    const sw = boot(offline);
    const out = await sw.dispatch(image());
    expect((out as Response).type).toBe("error");
  });

  it("skips range requests (video/partial) so they are never half-cached", async () => {
    const sw = boot(async () => png("a"));
    expect(await sw.dispatch(image({ headers: new Headers({ range: "bytes=0-100" }) }))).toBe("network");
  });
});

describe("Google Fonts for type specimens", () => {
  const CSS = "https://fonts.googleapis.com/css2?family=Lora:wght@400&display=swap";
  const FILE = "https://fonts.gstatic.com/s/lora/v1/abc.woff2";
  const css = (id: string) => res({ id, type: "cors", headers: { "content-type": "text/css" } });

  it("serves a cached stylesheet at once and refreshes it in the background (stale-while-revalidate)", async () => {
    const first = css("v1");
    const sw = boot(async () => first);
    expect(await sw.dispatch(req(CSS, { destination: "style" }))).toBe(first);
    const cache = sw.caches.all.get("atelier-fonts")!;
    expect([...cache.store.keys()]).toEqual([CSS]);
    const fresh = css("v2");
    sw.fetch.mockImplementation(async () => fresh);
    expect(await sw.dispatch(req(CSS, { destination: "style" }))).toBe(first); // the stale copy answers
    expect(sw.fetch).toHaveBeenCalledTimes(2); // ...and the network was asked for the next time
    expect(await cache.match(CSS)).toBe(fresh);
  });

  it("caches the font files from fonts.gstatic.com so a used family works offline", async () => {
    const file = res({ id: "f", type: "cors", headers: { "content-type": "font/woff2" } });
    const sw = boot(async () => file);
    await sw.dispatch(req(FILE, { destination: "font" }));
    sw.fetch.mockImplementation(offline);
    expect(await sw.dispatch(req(FILE, { destination: "font" }))).toBe(file);
  });

  it("does not store failures, and offline without a copy is a network error", async () => {
    const bad = res({ status: 400, type: "cors" });
    const sw = boot(async () => bad);
    expect(await sw.dispatch(req(CSS, { destination: "style" }))).toBe(bad);
    expect(sw.caches.all.get("atelier-fonts")?.store.size ?? 0).toBe(0);
    const off = boot(offline);
    expect(((await off.dispatch(req(CSS, { destination: "style" }))) as Response).type).toBe("error");
  });

  it("caps the font cache at 60 entries, dropping the oldest", async () => {
    const sw = boot(async (r) => css(typeof r === "string" ? r : r.url));
    for (let i = 0; i < 63; i++) await sw.dispatch(req(`https://fonts.googleapis.com/css2?family=F${i}`, { destination: "style" }));
    const keys = [...sw.caches.all.get("atelier-fonts")!.store.keys()];
    expect(keys).toHaveLength(60);
    expect(keys).not.toContain("https://fonts.googleapis.com/css2?family=F0");
    expect(keys).toContain("https://fonts.googleapis.com/css2?family=F62");
  });

  it("other third-party hosts are still left to the network, and activate keeps the font cache", async () => {
    const sw = boot(online());
    expect(await sw.dispatch(req("https://evil.example/css2?family=Lora", { destination: "style" }))).toBe("network");
    await sw.caches.open("atelier-fonts");
    await sw.lifecycle("install");
    await sw.lifecycle("activate");
    expect(await sw.caches.keys()).toContain("atelier-fonts");
  });
});

describe("versioning", () => {
  it("names every cache but the image cache with a version", () => {
    expect(code).toMatch(/const VERSION = "v\d+"/);
    expect(code).toMatch(/atelier-shell-\$\{VERSION\}/);
    expect(code).toMatch(/atelier-pages-\$\{VERSION\}/);
    expect(code).toMatch(/atelier-static-\$\{VERSION\}/);
    expect(code).toMatch(/"atelier-images"/);
  });
  it("never reloads or navigates open pages", () => {
    expect(code).not.toMatch(/\.navigate\(|location\.reload|client\.postMessage\([^)]*reload/i);
  });
});

describe("Web Share Target", () => {
  const shareRequest = (path = "/share-target", fields: Record<string, string> = { title: "Hi", url: "https://example.com/a" }) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(fields)) f.append(k, v);
    return new Request(new URL(path, ORIGIN).href, { method: "POST", body: f });
  };

  it("answers a POST to /share-target itself: stores the share, redirects to the Inbox, and never touches the network", async () => {
    const sw = boot(online());
    const answer = (await sw.dispatch(shareRequest())) as Response;
    expect(answer).not.toBe("network");
    expect(answer.status).toBe(303);
    expect(answer.headers.get("location")).toBe("/inbox?shared=1");
    expect(sw.fetch).not.toHaveBeenCalled();
  });

  it("does not answer a GET to /share-target, a POST elsewhere, or a POST from another origin", async () => {
    const sw = boot(online());
    expect(await sw.dispatch(req("/share-target"))).toBe("network");
    expect(await sw.dispatch(shareRequest("/api/inbox"))).toBe("network");
    expect(await sw.dispatch(shareRequest("/b/abc"))).toBe("network");
    expect(await sw.dispatch(shareRequest("https://evil.test/share-target"))).toBe("network");
  });

  it("leaves the POST to the server when the share handler could not be loaded", async () => {
    const sw = boot(online());
    delete (sw.self as Record<string, unknown>).AtelierShare;
    expect(await sw.dispatch(shareRequest())).toBe("network");
  });

  it("keeps the Inbox and Library pages for offline starts, like the start page", async () => {
    const sw = boot(online());
    await sw.dispatch(nav("/inbox?shared=1"));
    await sw.dispatch(nav("/library"));
    const pages = [...(await sw.caches.open("atelier-pages-v2")).store.keys()].map((u) => new URL(u).pathname);
    expect(pages).toEqual(expect.arrayContaining(["/inbox", "/library"]));
  });
});
