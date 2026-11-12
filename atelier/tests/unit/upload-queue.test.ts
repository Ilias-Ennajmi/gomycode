import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import type { ImageObj } from "@/lib/engine/model/types";
import { isAssetId } from "@/lib/assets/asset-id";
import { fitWithin, ImageError, MAX_IMAGE_BYTES, runPipeline, type PipelineEnv } from "@/lib/assets/pipeline-core";
import { AssetResolverImpl } from "@/lib/assets/resolver";
import { AssetUploader, type ProcessedImage } from "@/lib/assets/upload-queue";
import { backoffDelay } from "@/lib/sync/backoff";

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

// ---- pipeline (pure parts; the browser decode/encode calls are injected) -----------------------------------

function fakeEnv(width: number, height: number): PipelineEnv & { decode: ReturnType<typeof vi.fn>; encode: ReturnType<typeof vi.fn> } {
  const decode = vi.fn(async () => ({ width, height, close() {} }));
  const encode = vi.fn(async (_b: unknown, w: number, h: number) => new Blob([`webp ${w}x${h}`], { type: "image/webp" }));
  return { createImageBitmap: decode, encodeWebp: encode, decode, encode };
}
const jpeg = (bytes = 100) => new File([new Uint8Array(bytes)], "photo.jpg", { type: "image/jpeg" });

describe("fitWithin", () => {
  it("scales the longest side down and never up", () => {
    expect(fitWithin(4000, 3000, 1024)).toEqual({ w: 1024, h: 768 });
    expect(fitWithin(3000, 4000, 1024)).toEqual({ w: 768, h: 1024 });
    expect(fitWithin(500, 300, 1024)).toEqual({ w: 500, h: 300 });
    expect(fitWithin(10000, 1, 1024)).toEqual({ w: 1024, h: 1 });
  });
});

describe("runPipeline", () => {
  it("decodes with EXIF orientation, makes a 1024 WebP at q 0.82 and keeps the original", async () => {
    const env = fakeEnv(4000, 3000);
    const file = jpeg();
    const out = await runPipeline(file, env);
    expect(env.decode).toHaveBeenCalledWith(file, { imageOrientation: "from-image" });
    expect(env.encode.mock.calls[0].slice(1)).toEqual([1024, 768, 0.82]);
    expect(out).toMatchObject({ width: 4000, height: 3000, mime: "image/jpeg" });
    expect(out.original).toBe(file);
    expect(out.variants.w1024.type).toBe("image/webp");
  });

  it("does not upscale small images", async () => {
    const env = fakeEnv(500, 300);
    await runPipeline(jpeg(), env);
    expect(env.encode.mock.calls[0].slice(1, 3)).toEqual([500, 300]);
  });

  it("rejects an oversize file before decoding, naming the limit", async () => {
    const env = fakeEnv(10, 10);
    const big = jpeg();
    Object.defineProperty(big, "size", { value: 60 * 1024 * 1024 });
    const err = await runPipeline(big, env).catch((e) => e);
    expect(err).toBeInstanceOf(ImageError);
    expect(err.reason).toBe("too-large");
    expect(err.message).toMatch(/60 MB/);
    expect(err.message).toMatch(/50 MB/);
    expect(env.decode).not.toHaveBeenCalled();
    expect(MAX_IMAGE_BYTES).toBe(50 * 1024 * 1024);
  });

  it("reports a format the browser cannot decode (e.g. HEIC) as unsupported", async () => {
    const env = fakeEnv(1, 1);
    env.decode.mockRejectedValueOnce(new DOMException("The source image cannot be decoded", "InvalidStateError"));
    const heic = new File([new Uint8Array(10)], "IMG_1.heic", { type: "image/heic" });
    const err = await runPipeline(heic, env).catch((e) => e);
    expect(err).toBeInstanceOf(ImageError);
    expect(err.reason).toBe("unsupported");
    expect(err.message).toMatch(/image\/heic/);
  });

  it("rejects empty files and absurd dimensions", async () => {
    await expect(runPipeline(new File([], "e.png", { type: "image/png" }), fakeEnv(1, 1))).rejects.toMatchObject({ reason: "empty" });
    await expect(runPipeline(jpeg(), fakeEnv(0, 10))).rejects.toMatchObject({ reason: "unsupported" });
  });
});

// ---- resolver ---------------------------------------------------------------------------------------------

describe("AssetResolverImpl", () => {
  const id = "6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e5f";
  it("serves the local blob first, then the R2 public URL, then null", () => {
    const r = new AssetResolverImpl({ publicHost: "img.example.com" });
    expect(r.url(id, "w1024")).toBe(`https://img.example.com/a/${id}/w1024.webp`);
    expect(r.url(id, "original")).toBe(`https://img.example.com/a/${id}/original`);
    r.registerLocal(id, { w1024: new Blob(["a"]), original: new Blob(["b"]) });
    expect(r.url(id, "w1024")).toMatch(/^blob:/);
    expect(r.url(id, "original")).toMatch(/^blob:/);
    expect(r.url(id, "w1024")).not.toBe(r.url(id, "original"));
    r.forgetLocal(id);
    expect(r.url(id, "w1024")).toBe(`https://img.example.com/a/${id}/w1024.webp`);
    expect(new AssetResolverImpl({ publicHost: null }).url(id, "w1024")).toBeNull();
  });

  it("accepts a host with scheme and trailing slash, and refuses ids that are not asset ids", () => {
    const r = new AssetResolverImpl({ publicHost: "https://img.example.com/" });
    expect(r.url(id, "w1024")).toBe(`https://img.example.com/a/${id}/w1024.webp`);
    expect(r.url("../secret", "w1024")).toBeNull();
    expect(r.url("", "original")).toBeNull();
  });
});

// ---- backoff ----------------------------------------------------------------------------------------------

describe("backoffDelay", () => {
  it("doubles from 1 s and caps at 60 s", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 50].map(backoffDelay)).toEqual([1000, 2000, 4000, 8000, 16000, 32000, 60000, 60000, 60000]);
    expect(backoffDelay(-3)).toBe(1000);
    expect(backoffDelay(Number.NaN)).toBe(1000);
  });
});

// ---- upload queue -----------------------------------------------------------------------------------------

type Call = { method: string; url: string; headers: Record<string, string>; body: unknown };

function processed(width = 2000, height = 1000): ProcessedImage {
  return {
    width,
    height,
    mime: "image/png",
    original: new Blob(["original-bytes"], { type: "image/png" }),
    variants: { w1024: new Blob(["variant-bytes"], { type: "image/webp" }) },
  };
}
const png = (name = "a.png") => new File([new Uint8Array(8)], name, { type: "image/png" });

/** A fake network: POST /api/assets, PUT to R2, POST /complete. `fail` lets a test break chosen calls. */
function fakeNetwork(fail: (c: Call, n: number) => Response | "network" | null = () => null) {
  const calls: Call[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>));
    const call: Call = { method: init?.method ?? "GET", url, headers, body: init?.body };
    calls.push(call);
    const failure = fail(call, calls.length);
    if (failure === "network") throw new TypeError("Failed to fetch");
    if (failure) return failure;
    if (url === "/api/assets") {
      const { assetId } = JSON.parse(String(init!.body));
      return Response.json({ assetId, uploads: { original: `https://r2.test/put/${assetId}/original`, w1024: `https://r2.test/put/${assetId}/w1024` } });
    }
    if (url.endsWith("/complete")) return Response.json({ ok: true });
    return new Response(null, { status: 200 });
  });
  return { calls, fetch: fn as unknown as typeof fetch };
}

function setup(over: { fetch?: typeof fetch; delay?: (ms: number) => Promise<void>; doc?: BoardDoc; resolver?: AssetResolverImpl } = {}) {
  const doc = over.doc ?? new BoardDoc();
  const resolver = over.resolver ?? new AssetResolverImpl({ publicHost: "img.example.com" });
  const net = fakeNetwork();
  const delays: number[] = [];
  const uploader = new AssetUploader({
    doc,
    resolver,
    process: async () => processed(),
    fetch: over.fetch ?? net.fetch,
    delay: over.delay ?? (async (ms) => void delays.push(ms)),
  });
  return { doc, resolver, uploader, net, delays };
}

describe("AssetUploader", () => {
  it("creates the image object at once, shows the local blob and uploads in the background", async () => {
    const { doc, resolver, uploader, net } = setup();
    const objectId = await uploader.add(png(), { x: 500, y: 400 });

    const obj = doc.get(objectId) as ImageObj;
    expect(obj.type).toBe("image");
    expect(isAssetId(obj.assetId)).toBe(true);
    // 2000x1000 fits a 320 box as 320x160, centred on the drop point
    expect([obj.w, obj.h]).toEqual([320, 160]);
    expect([obj.x + obj.w / 2, obj.y + obj.h / 2]).toEqual([500, 400]);
    expect(resolver.url(obj.assetId, "w1024")).toMatch(/^blob:/);

    await uploader.whenIdle();
    expect(uploader.pending()).toBe(0);

    const [create, putOriginal, putVariant, complete] = net.calls;
    expect(create.url).toBe("/api/assets");
    expect(JSON.parse(String(create.body))).toEqual({ assetId: obj.assetId, mime: "image/png", bytes: 14, width: 2000, height: 1000 });
    expect(putOriginal).toMatchObject({ method: "PUT", url: `https://r2.test/put/${obj.assetId}/original` });
    expect(putOriginal.headers["Content-Type"]).toBe("image/png");
    expect(putVariant).toMatchObject({ method: "PUT", url: `https://r2.test/put/${obj.assetId}/w1024` });
    expect(putVariant.headers["Content-Type"]).toBe("image/webp");
    expect(complete.url).toBe(`/api/assets/${obj.assetId}/complete`);
    expect(JSON.parse(String(complete.body))).toMatchObject({ mime: "image/png", width: 2000, height: 1000 });
  });

  it("does not upscale a small image", async () => {
    const doc = new BoardDoc();
    const u = new AssetUploader({ doc, resolver: new AssetResolverImpl(), process: async () => processed(100, 50), fetch: fakeNetwork().fetch, delay: async () => {} });
    const id = await u.add(png(), { x: 0, y: 0 });
    expect([doc.get(id)!.w, doc.get(id)!.h]).toEqual([100, 50]);
    await u.whenIdle();
  });

  it("retries after a failed PUT with exponential backoff and then succeeds", async () => {
    let puts = 0;
    const net = fakeNetwork((c) => {
      if (c.method !== "PUT") return null;
      puts++;
      if (puts === 1) return new Response("boom", { status: 500 });
      if (puts === 2) return "network";
      return null;
    });
    const { uploader, delays } = setup({ fetch: net.fetch });
    await uploader.add(png(), { x: 0, y: 0 });
    await uploader.whenIdle();
    expect(delays).toEqual([1000, 2000]);
    expect(uploader.pending()).toBe(0);
    expect(net.calls.filter((c) => c.url.endsWith("/complete"))).toHaveLength(1);
  });

  it("does not repeat a finished PUT when only a later step failed", async () => {
    let completes = 0;
    const net = fakeNetwork((c) => (c.url.endsWith("/complete") && completes++ === 0 ? new Response("x", { status: 503 }) : null));
    const { uploader } = setup({ fetch: net.fetch });
    await uploader.add(png(), { x: 0, y: 0 });
    await uploader.whenIdle();
    expect(net.calls.filter((c) => c.method === "PUT")).toHaveLength(2);
  });

  it("survives a reload: the queue is rebuilt from IndexedDB and finishes without a second object", async () => {
    const doc = new BoardDoc();
    const stuck = fakeNetwork(() => "network");
    const first = new AssetUploader({
      doc,
      resolver: new AssetResolverImpl(),
      process: async () => processed(),
      fetch: stuck.fetch,
      delay: () => new Promise(() => {}), // never retries: the "tab is closed" moment
    });
    const objectId = await first.add(png(), { x: 0, y: 0 });
    const assetId = (doc.get(objectId) as ImageObj).assetId;
    await vi.waitFor(() => expect(stuck.calls.length).toBeGreaterThan(0));
    expect(first.pending()).toBe(1);
    first.dispose();

    // "Reload": new uploader, new resolver, same IndexedDB and same document.
    const resolver = new AssetResolverImpl({ publicHost: "img.example.com" });
    const net = fakeNetwork();
    const second = new AssetUploader({ doc, resolver, process: async () => processed(), fetch: net.fetch, delay: async () => {} });
    await second.ready;
    expect(second.pending()).toBe(1);
    expect(resolver.url(assetId, "w1024")).toMatch(/^blob:/); // still visible while it waits
    await second.whenIdle();
    expect(second.pending()).toBe(0);
    expect(doc.all().filter((o) => o.type === "image")).toHaveLength(1);
    expect(net.calls.at(-1)!.url).toBe(`/api/assets/${assetId}/complete`);

    // And nothing is left behind for a third load.
    const third = new AssetUploader({ doc, resolver, process: async () => processed(), fetch: net.fetch, delay: async () => {} });
    await third.ready;
    expect(third.pending()).toBe(0);
  });

  it("marks a rejected upload as failed instead of retrying forever, and retry() queues it again", async () => {
    let reject = true;
    const net = fakeNetwork((c) => (reject && c.url === "/api/assets" ? Response.json({ error: "too-large" }, { status: 413 }) : null));
    const { uploader, delays } = setup({ fetch: net.fetch });
    const objectId = await uploader.add(png("big.png"), { x: 0, y: 0 });
    await uploader.whenIdle();
    expect(delays).toEqual([]);
    expect(uploader.pending()).toBe(1);
    expect(uploader.items()).toMatchObject([{ objectId, name: "big.png", state: "failed" }]);

    reject = false;
    uploader.retry();
    await uploader.whenIdle();
    expect(uploader.pending()).toBe(0);
  });

  it("keeps trying while the server says it is unavailable (local-only mode, outage)", async () => {
    let n = 0;
    const net = fakeNetwork((c) => (c.url === "/api/assets" && n++ < 3 ? Response.json({ error: "local-only" }, { status: 503 }) : null));
    const { uploader, delays } = setup({ fetch: net.fetch });
    await uploader.add(png(), { x: 0, y: 0 });
    await uploader.whenIdle();
    expect(delays).toEqual([1000, 2000, 4000]);
  });

  it("rejects an oversize or undecodable file without touching the board or the queue", async () => {
    const doc = new BoardDoc();
    const u = new AssetUploader({
      doc,
      resolver: new AssetResolverImpl(),
      process: async () => {
        throw new ImageError("too-large", "too large (60 MB; the limit is 50 MB)");
      },
      fetch: fakeNetwork().fetch,
      delay: async () => {},
    });
    await expect(u.add(png("huge.png"), { x: 0, y: 0 })).rejects.toMatchObject({ reason: "too-large" });
    expect(doc.all()).toHaveLength(0);
    expect(u.pending()).toBe(0);
  });

  it("notifies subscribers as the pending count changes", async () => {
    const { uploader } = setup();
    const seen: number[] = [];
    const off = uploader.subscribe(() => seen.push(uploader.pending()));
    await uploader.add(png(), { x: 0, y: 0 });
    await uploader.whenIdle();
    off();
    expect(seen[0]).toBe(1);
    expect(seen.at(-1)).toBe(0);
  });
});
