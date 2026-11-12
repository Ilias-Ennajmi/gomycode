import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import type { ImageObj } from "@/lib/engine/model/types";
import { isAssetId } from "@/lib/assets/asset-id";
import { fitWithin, ImageError, MAX_IMAGE_BYTES, runPipeline, type PipelineEnv } from "@/lib/assets/pipeline-core";
import { AssetResolverImpl } from "@/lib/assets/resolver";
import { AssetUploader, registerStoredAssets, type ProcessedImage } from "@/lib/assets/upload-queue";
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
  it("decodes with EXIF orientation, makes the 256, 1024 and 2048 WebP at q 0.82 and keeps the original", async () => {
    const env = fakeEnv(4000, 3000);
    const file = jpeg();
    const out = await runPipeline(file, env);
    expect(env.decode).toHaveBeenCalledWith(file, { imageOrientation: "from-image" });
    expect(env.encode.mock.calls.map((c) => c.slice(1))).toEqual([
      [256, 192, 0.82],
      [1024, 768, 0.82],
      [2048, 1536, 0.82],
    ]);
    expect(out).toMatchObject({ width: 4000, height: 3000, mime: "image/jpeg" });
    expect(out.original).toBe(file);
    expect(out.variants.w1024?.type).toBe("image/webp");
  });

  it("does not upscale small images: a 500 px image only gets a 256 px variant", async () => {
    const env = fakeEnv(500, 300);
    const out = await runPipeline(jpeg(), env);
    expect(env.encode.mock.calls.map((c) => c.slice(1, 3))).toEqual([[256, 154]]);
    expect(Object.keys(out.variants)).toEqual(["w256"]);
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
    animated: false,
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
      const { assetId, variants = ["w1024"] } = JSON.parse(String(init!.body)) as { assetId: string; variants?: string[] };
      const uploads: Record<string, string> = { original: `https://r2.test/put/${assetId}/original` };
      for (const v of variants) uploads[v] = `https://r2.test/put/${assetId}/${v}`;
      return Response.json({ assetId, uploads, duplicateOf: null });
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
    expect(JSON.parse(String(create.body))).toEqual({
      assetId: obj.assetId,
      mime: "image/png",
      bytes: 14,
      width: 2000,
      height: 1000,
      kind: "image",
      variants: ["w1024"],
    });
    expect(putOriginal).toMatchObject({ method: "PUT", url: `https://r2.test/put/${obj.assetId}/original` });
    expect(putOriginal.headers["Content-Type"]).toBe("image/png");
    expect(putVariant).toMatchObject({ method: "PUT", url: `https://r2.test/put/${obj.assetId}/w1024` });
    expect(putVariant.headers["Content-Type"]).toBe("image/webp");
    expect(complete.url).toBe(`/api/assets/${obj.assetId}/complete`);
    expect(JSON.parse(String(complete.body))).toMatchObject({ mime: "image/png", width: 2000, height: 1000, kind: "image", variants: ["w1024"] });
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

describe("AssetUploader in local-only mode", () => {
  const local = (net = fakeNetwork(), dbName = "atelier-uploads-local-test") => {
    const doc = new BoardDoc();
    const resolver = new AssetResolverImpl({ publicHost: null });
    const uploader = new AssetUploader({ doc, resolver, process: async () => processed(), fetch: net.fetch, delay: async () => {}, localOnly: true, dbName });
    return { doc, resolver, uploader, net };
  };

  it("puts the image on the board with a local blob and never calls the network", async () => {
    const { doc, resolver, uploader, net } = local();
    const id = await uploader.add(png(), { x: 100, y: 100 });
    await uploader.whenIdle();
    const obj = doc.get(id) as ImageObj;
    expect(obj.type).toBe("image");
    expect(resolver.url(obj.assetId, "w1024")).toMatch(/^blob:/);
    expect(uploader.pending()).toBe(0);
    expect(net.fetch).not.toHaveBeenCalled();
    expect(net.calls).toHaveLength(0);
  });

  it("keeps the bytes in IndexedDB so a reload still shows the image, still without uploading", async () => {
    const net = fakeNetwork();
    const name = "atelier-uploads-local-reload";
    const first = local(net, name);
    const id = await first.uploader.add(png(), { x: 0, y: 0 });
    const assetId = (first.doc.get(id) as ImageObj).assetId;
    first.uploader.dispose();

    const secondResolver = new AssetResolverImpl({ publicHost: null });
    const second = new AssetUploader({ doc: new BoardDoc(), resolver: secondResolver, process: async () => processed(), fetch: net.fetch, delay: async () => {}, localOnly: true, dbName: name });
    await second.ready;
    expect(secondResolver.url(assetId, "w1024")).toMatch(/^blob:/);
    expect(second.pending()).toBe(0);
    expect(net.calls).toHaveLength(0);
    second.dispose();
  });
});

describe("registerStoredAssets (home screen, local-only)", () => {
  it("makes the stored preview blobs of the given assets resolvable and skips unknown ones", async () => {
    const name = "atelier-uploads-home-previews";
    const net = fakeNetwork();
    const doc = new BoardDoc();
    const u = new AssetUploader({ doc, resolver: new AssetResolverImpl({ publicHost: null }), process: async () => processed(), fetch: net.fetch, delay: async () => {}, localOnly: true, dbName: name });
    const id = await u.add(png(), { x: 0, y: 0 });
    const assetId = (doc.get(id) as ImageObj).assetId;
    u.dispose();

    const fresh = new AssetResolverImpl({ publicHost: null });
    expect(fresh.url(assetId, "w1024")).toBeNull();
    const found = await registerStoredAssets(fresh, [assetId, "00000000-0000-4000-8000-00000000dead"], name);
    expect(found).toBe(1);
    expect(fresh.url(assetId, "w1024")).toMatch(/^blob:/);
    expect(await registerStoredAssets(fresh, [], name)).toBe(0);
    expect(net.calls).toHaveLength(0);
  });
});

// ---- Phase 2: multi-size uploads, concurrency, asset-only adds, duplicates, legacy queue entries -----------

function processedWith(variantNames: ("w256" | "w1024" | "w2048")[], over: Partial<ProcessedImage> = {}): ProcessedImage {
  const variants: ProcessedImage["variants"] = {};
  for (const n of variantNames) variants[n] = new Blob([`v-${n}`], { type: "image/webp" });
  return { width: 4000, height: 3000, mime: "image/jpeg", original: new Blob(["orig"], { type: "image/jpeg" }), variants, animated: false, ...over };
}

describe("AssetUploader, multi-size", () => {
  it("asks for the variants the pipeline made, PUTs the original then each variant in order, and completes with the list", async () => {
    const net = fakeNetwork();
    const doc = new BoardDoc();
    const u = new AssetUploader({
      doc,
      resolver: new AssetResolverImpl({ publicHost: "img.example.com" }),
      process: async () => processedWith(["w256", "w1024", "w2048"]),
      fetch: net.fetch,
      delay: async () => {},
    });
    const id = await u.add(png(), { x: 0, y: 0 });
    const assetId = (doc.get(id) as ImageObj).assetId;
    await u.whenIdle();
    expect(JSON.parse(String(net.calls[0].body))).toMatchObject({ kind: "image", variants: ["w256", "w1024", "w2048"], width: 4000, height: 3000 });
    expect(net.calls.filter((c) => c.method === "PUT").map((c) => c.url.replace(`https://r2.test/put/${assetId}/`, ""))).toEqual(["original", "w256", "w1024", "w2048"]);
    expect(net.calls.at(-1)!.url).toBe(`/api/assets/${assetId}/complete`);
    expect(JSON.parse(String(net.calls.at(-1)!.body)).variants).toEqual(["w256", "w1024", "w2048"]);
  });

  it("an image with no variants uploads only the original", async () => {
    const net = fakeNetwork();
    const u = new AssetUploader({ doc: new BoardDoc(), resolver: new AssetResolverImpl(), process: async () => processedWith([], { width: 100, height: 80 }), fetch: net.fetch, delay: async () => {} });
    await u.add(png(), { x: 0, y: 0 });
    await u.whenIdle();
    expect(JSON.parse(String(net.calls[0].body)).variants).toEqual([]);
    expect(net.calls.filter((c) => c.method === "PUT")).toHaveLength(1);
  });

  it("an animated image is sent as kind gif", async () => {
    const net = fakeNetwork();
    const u = new AssetUploader({ doc: new BoardDoc(), resolver: new AssetResolverImpl(), process: async () => processedWith(["w256"], { animated: true, mime: "image/gif" }), fetch: net.fetch, delay: async () => {} });
    await u.add(png(), { x: 0, y: 0 });
    await u.whenIdle();
    expect(JSON.parse(String(net.calls[0].body)).kind).toBe("gif");
  });

  it("tells the resolver what exists, so available() knows a pending upload", async () => {
    const net = fakeNetwork(() => "network");
    const resolver = new AssetResolverImpl({ publicHost: "img.example.com" });
    const doc = new BoardDoc();
    const u = new AssetUploader({ doc, resolver, process: async () => processedWith(["w256", "w1024"], { width: 1500, height: 1000 }), fetch: net.fetch, delay: () => new Promise(() => {}) });
    const id = await u.add(png(), { x: 0, y: 0 });
    const assetId = (doc.get(id) as ImageObj).assetId;
    expect(resolver.available(assetId)).toEqual({ variants: ["w256", "w1024"], width: 1500, height: 1000 });
    expect(resolver.url(assetId, "w256")).toMatch(/^blob:/);
    expect(resolver.url(assetId, "w2048")).toMatch(/^blob:/); // absent: falls back to w1024, which is local
    u.dispose();
  });
});

describe("AssetUploader, bulk drops", () => {
  it("300 add() calls: at most 3 images processed at once, at most 4 PUTs at once, everything uploads", async () => {
    let processing = 0;
    let peakProcessing = 0;
    let puts = 0;
    let peakPuts = 0;
    const process = async () => {
      processing++;
      peakProcessing = Math.max(peakProcessing, processing);
      await new Promise((r) => setTimeout(r, 1));
      processing--;
      return processedWith(["w256"], { width: 800, height: 600 });
    };
    const base = fakeNetwork();
    const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const isPut = init?.method === "PUT";
      if (isPut) {
        puts++;
        peakPuts = Math.max(peakPuts, puts);
        await new Promise((r) => setTimeout(r, 1));
      }
      try {
        return await base.fetch(input, init);
      } finally {
        if (isPut) puts--;
      }
    }) as typeof fetch;
    const doc = new BoardDoc();
    const u = new AssetUploader({ doc, resolver: new AssetResolverImpl(), process, fetch: fetchFn, delay: async () => {} });
    const ids = await Promise.all(Array.from({ length: 300 }, (_, i) => u.add(png(`p${i}.png`), { x: i * 10, y: 0 })));
    expect(new Set(ids).size).toBe(300);
    expect(doc.all().filter((o) => o.type === "image")).toHaveLength(300);
    await u.whenIdle();
    expect(u.pending()).toBe(0);
    expect(peakProcessing).toBe(3);
    expect(peakPuts).toBeGreaterThan(1);
    expect(peakPuts).toBeLessThanOrEqual(4);
    expect(base.calls.filter((c) => c.url.endsWith("/complete"))).toHaveLength(300);
  }, 30_000);

  it("the queue survives a reload: 60 stuck uploads are all still pending in a new uploader", async () => {
    const stuck = fakeNetwork(() => "network");
    const doc = new BoardDoc();
    const first = new AssetUploader({ doc, resolver: new AssetResolverImpl(), process: async () => processedWith(["w256"], { width: 800, height: 600 }), fetch: stuck.fetch, delay: () => new Promise(() => {}) });
    await Promise.all(Array.from({ length: 60 }, (_, i) => first.add(png(`p${i}.png`), { x: i, y: 0 })));
    expect(first.pending()).toBe(60);
    first.dispose();

    const net = fakeNetwork();
    const second = new AssetUploader({ doc, resolver: new AssetResolverImpl(), process: async () => processedWith([]), fetch: net.fetch, delay: async () => {} });
    await second.ready;
    expect(second.pending()).toBe(60);
    await second.whenIdle();
    expect(net.calls.filter((c) => c.url.endsWith("/complete"))).toHaveLength(60);
    // Variants survive the round trip through IndexedDB: every upload PUT its w256.
    expect(net.calls.filter((c) => c.method === "PUT" && c.url.endsWith("/w256"))).toHaveLength(60);
  }, 30_000);

  it("a backing-off item does not hold an upload slot", async () => {
    let first = true;
    const net = fakeNetwork((c) => {
      if (c.url === "/api/assets" && first) {
        first = false;
        return "network";
      }
      return null;
    });
    const u = new AssetUploader({ doc: new BoardDoc(), resolver: new AssetResolverImpl(), process: async () => processedWith([]), fetch: net.fetch, delay: () => new Promise(() => {}), uploadConcurrency: 1 });
    await u.add(png("a.png"), { x: 0, y: 0 });
    await vi.waitFor(() => expect(u.items()[0]?.attempts).toBe(1)); // a.png failed and is waiting out its backoff
    await u.add(png("b.png"), { x: 10, y: 0 });
    await vi.waitFor(() => expect(u.pending()).toBe(1)); // b.png got through although the only slot is 1
    expect(u.items()[0].name).toBe("a.png");
    u.dispose();
  });
});

describe("AssetUploader.addAssetOnly", () => {
  it("runs the same pipeline and queue but creates no canvas object", async () => {
    const net = fakeNetwork();
    const doc = new BoardDoc();
    const resolver = new AssetResolverImpl({ publicHost: "img.example.com" });
    const u = new AssetUploader({ doc, resolver, process: async () => processedWith(["w256", "w1024"], { width: 1500, height: 1000 }), fetch: net.fetch, delay: async () => {} });
    const assetId = await u.addAssetOnly(png("link.png"), { name: "link.png" });
    expect(isAssetId(assetId)).toBe(true);
    expect(doc.all()).toHaveLength(0);
    expect(resolver.url(assetId, "w256")).toMatch(/^blob:/);
    expect(u.items()).toMatchObject([{ assetId, objectId: null, name: "link.png" }]);
    await u.whenIdle();
    expect(u.pending()).toBe(0);
    expect(net.calls.at(-1)!.url).toBe(`/api/assets/${assetId}/complete`);
    expect(doc.all()).toHaveLength(0);
  });

  it("rejects an unreadable file with the same ImageError and leaves nothing queued", async () => {
    const u = new AssetUploader({
      doc: new BoardDoc(),
      resolver: new AssetResolverImpl(),
      process: async () => {
        throw new ImageError("empty", "the file is empty");
      },
      fetch: fakeNetwork().fetch,
      delay: async () => {},
    });
    await expect(u.addAssetOnly(new Blob([]))).rejects.toMatchObject({ reason: "empty" });
    expect(u.pending()).toBe(0);
  });

  it("never sends a hash (nothing on the canvas could be re-pointed at a duplicate)", async () => {
    const net = fakeNetwork();
    const u = new AssetUploader({ doc: new BoardDoc(), resolver: new AssetResolverImpl(), process: async () => processedWith(["w256"], { phash: "0123456789abcdef" }), fetch: net.fetch, delay: async () => {} });
    await u.addAssetOnly(png());
    await u.whenIdle();
    expect(JSON.parse(String(net.calls[0].body)).phash).toBeUndefined();
  });

  it("local-only: kept in IndexedDB, never uploaded", async () => {
    const net = fakeNetwork();
    const u = new AssetUploader({ doc: new BoardDoc(), resolver: new AssetResolverImpl({ publicHost: null }), process: async () => processedWith([]), fetch: net.fetch, delay: async () => {}, localOnly: true, dbName: "atelier-uploads-assetonly-local" });
    const id = await u.addAssetOnly(png());
    expect(isAssetId(id)).toBe(true);
    expect(u.pending()).toBe(0);
    expect(net.calls).toHaveLength(0);
  });
});

describe("AssetUploader, duplicates", () => {
  it("sends the hash of a canvas image; when the server says duplicateOf, the object is re-pointed and nothing is uploaded", async () => {
    const EXISTING = "11111111-2222-4333-8444-555555555555";
    const net = fakeNetwork((c) => (c.url === "/api/assets" ? Response.json({ assetId: "x", uploads: {}, duplicateOf: EXISTING }) : null));
    const doc = new BoardDoc();
    const resolver = new AssetResolverImpl({ publicHost: "img.example.com" });
    const u = new AssetUploader({ doc, resolver, process: async () => processedWith(["w256"], { width: 800, height: 600, phash: "ABCDEF0123456789".toLowerCase() }), fetch: net.fetch, delay: async () => {} });
    const id = await u.add(png(), { x: 0, y: 0 });
    const before = (doc.get(id) as ImageObj).assetId;
    doc.stopCapturing(); // anything undoable done from here on would be its own undo step
    await u.whenIdle();
    expect(JSON.parse(String(net.calls[0].body)).phash).toBe("abcdef0123456789");
    expect((doc.get(id) as ImageObj).assetId).toBe(EXISTING);
    expect(net.calls.some((c) => c.method === "PUT" || c.url.endsWith("/complete"))).toBe(false);
    expect(u.pending()).toBe(0);
    expect(resolver.available(EXISTING)).toEqual({ variants: ["w256"], width: 800, height: 600 });
    expect(resolver.url(EXISTING, "w256")).toBe(`https://img.example.com/a/${EXISTING}/w256.webp`);
    expect(before).not.toBe(EXISTING);
    expect(doc.canUndo()).toBe(true); // creating the image is undoable ...
    doc.undo();
    expect(doc.get(id)).toBeUndefined(); // ... and the re-pointing is not a separate step
  });

  it("leaves an image the user already deleted alone", async () => {
    const EXISTING = "11111111-2222-4333-8444-555555555555";
    const net = fakeNetwork((c) => (c.url === "/api/assets" ? Response.json({ uploads: {}, duplicateOf: EXISTING }) : null));
    const doc = new BoardDoc();
    const u = new AssetUploader({ doc, resolver: new AssetResolverImpl(), process: async () => processedWith([], { phash: "abcdef0123456789" }), fetch: net.fetch, delay: () => new Promise((r) => setTimeout(r, 5)) });
    const id = await u.add(png(), { x: 0, y: 0 });
    doc.remove([id]);
    await u.whenIdle();
    expect(doc.all()).toHaveLength(0);
    expect(u.pending()).toBe(0);
  });
});

describe("AssetUploader, entries queued by Phase 1", () => {
  it("a Phase 1 queue entry (w1024 only, no variant list) still uploads after the update", async () => {
    const dbName = "atelier-uploads-legacy";
    const assetId = "6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e5f";
    // Write what Phase 1's persist() wrote.
    const db = await new Promise<IDBDatabase>((resolve) => {
      const req = indexedDB.open(dbName, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore("uploads", { keyPath: "assetId" });
        req.result.createObjectStore("blobs");
      };
      req.onsuccess = () => resolve(req.result);
    });
    await new Promise<void>((resolve) => {
      const tx = db.transaction(["uploads", "blobs"], "readwrite");
      tx.objectStore("uploads").put({ assetId, objectId: "obj-1", name: "old.png", mime: "image/png", bytes: 3, width: 2000, height: 1000, createdAt: 1 });
      tx.objectStore("blobs").put({ original: new Uint8Array([1, 2, 3]).buffer, originalType: "image/png", w1024: new Uint8Array([4, 5]).buffer, w1024Type: "image/webp" }, assetId);
      tx.oncomplete = () => resolve();
    });
    db.close();

    const net = fakeNetwork();
    const resolver = new AssetResolverImpl({ publicHost: "img.example.com" });
    const u = new AssetUploader({ doc: new BoardDoc(), resolver, process: async () => processed(), fetch: net.fetch, delay: async () => {}, dbName });
    await u.ready;
    expect(u.pending()).toBe(1);
    expect(resolver.url(assetId, "w1024")).toMatch(/^blob:/);
    await u.whenIdle();
    expect(JSON.parse(String(net.calls[0].body))).toMatchObject({ assetId, kind: "image", variants: ["w1024"] });
    expect(net.calls.filter((c) => c.method === "PUT").map((c) => c.url.split("/").pop())).toEqual(["original", "w1024"]);
    expect(u.pending()).toBe(0);
  });
});

describe("registerStoredAssets with variants", () => {
  it("registers the stored variants, and the original only when nothing bigger than a thumbnail exists", async () => {
    const name = "atelier-uploads-home-variants";
    const doc = new BoardDoc();
    let next: ProcessedImage = processedWith(["w256"], { width: 600, height: 400 });
    const u = new AssetUploader({ doc, resolver: new AssetResolverImpl({ publicHost: null }), process: async () => next, fetch: fakeNetwork().fetch, delay: async () => {}, localOnly: true, dbName: name });
    const small = (doc.get(await u.add(png(), { x: 0, y: 0 })) as ImageObj).assetId;
    next = processedWith(["w256", "w1024"], { width: 1500, height: 1000 });
    const big = (doc.get(await u.add(png(), { x: 0, y: 0 })) as ImageObj).assetId;
    u.dispose();

    const fresh = new AssetResolverImpl({ publicHost: null });
    expect(await registerStoredAssets(fresh, [small, big], name)).toBe(2);
    expect(fresh.url(small, "w1024")).toMatch(/^blob:/); // chain reaches the registered original
    expect(fresh.url(big, "w1024")).toMatch(/^blob:/);
    expect(fresh.url(big, "original")).toBeNull(); // not registered: previews only
  });
});
