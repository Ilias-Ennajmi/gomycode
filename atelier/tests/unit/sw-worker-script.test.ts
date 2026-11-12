import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

/*
 * A worker script that comes out of the service worker's cache must not carry the URL (and so the #params fragment) it was
 * stored under: the browser takes a worker's location from the response, and two workers sharing one bootstrap file would
 * run the first one's code. See forWorker in public/sw.js.
 */
const code = readFileSync(join(process.cwd(), "public/sw.js"), "utf8");
const ORIGIN = "https://atelier.test";

function boot(cached: Response | undefined, network: Response) {
  const handlers: Record<string, (e: Record<string, unknown>) => void> = {};
  const cache = {
    match: async () => cached,
    put: async () => {},
    keys: async () => [],
    delete: async () => true,
  };
  const caches = { open: async () => cache, keys: async () => [], delete: async () => true, match: async () => undefined };
  const self = { location: new URL(`${ORIGIN}/sw.js`), addEventListener: (t: string, fn: (e: Record<string, unknown>) => void) => (handlers[t] = fn), skipWaiting: vi.fn(), clients: { claim: vi.fn() } };
  const ctx = vm.createContext({ self, caches, fetch: vi.fn(async () => network), URL, Response, Headers, Promise, console, setTimeout, clearTimeout, crypto, Date, Blob, FormData, importScripts: () => {} });
  vm.runInContext(code, ctx);
  return async (request: Request): Promise<Response | "network"> => {
    let answer: Promise<Response> | undefined;
    const waits: Promise<unknown>[] = [];
    handlers.fetch({ request, respondWith: (p: Promise<Response>) => (answer = p), waitUntil: (p: Promise<unknown>) => waits.push(p) });
    if (!answer) return "network";
    const out = await answer;
    await Promise.all(waits);
    return out;
  };
}

const request = (path: string, destination: string): Request => ({ url: `${ORIGIN}${path}`, method: "GET", mode: "cors", destination, headers: new Headers() }) as unknown as Request;
/** A response as the cache returns it: it remembers the URL it was stored under. */
const stored = (url: string): Response => {
  const r = new Response("worker()", { status: 200, headers: { "content-type": "text/javascript" } });
  Object.defineProperty(r, "url", { value: url });
  return r;
};

describe("service worker and worker scripts", () => {
  const path = "/_next/static/chunks/turbopack-worker-abc.js#params=B";

  it("hands a worker script back without the URL it was cached under", async () => {
    const dispatch = boot(stored(`${ORIGIN}/_next/static/chunks/turbopack-worker-abc.js#params=A`), new Response("x"));
    const out = (await dispatch(request(path, "worker"))) as Response;
    expect(out.url).toBe("");
    expect(out.status).toBe(200);
    expect(out.headers.get("content-type")).toBe("text/javascript");
    expect(await out.text()).toBe("worker()");
  });

  it("does the same for a shared worker, and for a script that is not cached yet", async () => {
    const dispatch = boot(undefined, stored(`${ORIGIN}/_next/static/chunks/turbopack-worker-abc.js#params=A`));
    expect(((await dispatch(request(path, "sharedworker"))) as Response).url).toBe("");
    expect(((await dispatch(request(path, "worker"))) as Response).url).toBe("");
  });

  it("leaves ordinary static files as they are", async () => {
    const original = stored(`${ORIGIN}/_next/static/chunks/app.js`);
    const dispatch = boot(original, new Response("x"));
    expect(await dispatch(request("/_next/static/chunks/app.js", "script"))).toBe(original);
  });
});
