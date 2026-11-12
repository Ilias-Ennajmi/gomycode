import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ImageError } from "@/lib/assets/pipeline-core";
import { AssetResolverImpl } from "@/lib/assets/resolver";
import { AssetUploader, type ProcessedImage } from "@/lib/assets/upload-queue";
import type { ProcessedVideo } from "@/lib/assets/video";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import type { VideoObj } from "@/lib/engine/model/types";

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

const webp = (s = "poster") => new Blob([s], { type: "image/webp" });
const fakeVideo = (over: Partial<ProcessedVideo> = {}): ProcessedVideo => ({
  width: 1280,
  height: 720,
  duration: 12,
  posterTime: 1,
  mime: "video/mp4",
  original: new Blob(["video-bytes"], { type: "video/mp4" }),
  poster: { width: 1280, height: 720, mime: "image/webp", original: webp(), variants: { w256: webp("p256"), w1024: webp("p1024") }, animated: false },
  ...over,
});
const gifResult = (over: Partial<ProcessedImage> = {}): ProcessedImage => ({
  width: 480,
  height: 270,
  mime: "image/gif",
  original: new Blob(["gif-bytes"], { type: "image/gif" }),
  variants: { w256: webp("g256") },
  animated: true,
  ...over,
});
const mp4 = (name = "clip.mp4") => new File([new Uint8Array(8)], name, { type: "video/mp4" });
const gif = (name = "loop.gif") => new File([new Uint8Array(8)], name, { type: "image/gif" });

type Call = { method: string; url: string; headers: Record<string, string>; body: unknown };
function fakeNetwork() {
  const calls: Call[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ method: init?.method ?? "GET", url, headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>)), body: init?.body });
    if (url === "/api/assets") {
      const { assetId, variants = [] } = JSON.parse(String(init!.body)) as { assetId: string; variants?: string[] };
      const uploads: Record<string, string> = { original: `https://r2.test/put/${assetId}/original` };
      for (const v of variants) uploads[v] = `https://r2.test/put/${assetId}/${v}`;
      return Response.json({ assetId, uploads, duplicateOf: null });
    }
    return url.endsWith("/complete") ? Response.json({ ok: true }) : new Response(null, { status: 200 });
  });
  return { calls, fetch: fn as unknown as typeof fetch };
}

function setup(over: Partial<ConstructorParameters<typeof AssetUploader>[0]> = {}) {
  const doc = new BoardDoc();
  const resolver = new AssetResolverImpl({ publicHost: "img.example.com" });
  const net = fakeNetwork();
  const uploader = new AssetUploader({
    doc,
    resolver,
    process: async () => gifResult({ mime: "image/png", animated: false, variants: {} }),
    processVideo: async () => fakeVideo(),
    firstFrame: async () => webp("first-frame"),
    fetch: net.fetch,
    delay: async () => {},
    ...over,
  });
  return { doc, resolver, uploader, net };
}

describe("AssetUploader: video files", () => {
  it("rejects a 250 MB mp4 with a message naming the 200 MB limit, creates no object and never touches the network", async () => {
    const { doc, uploader, net } = setup();
    const big = mp4("big.mp4");
    Object.defineProperty(big, "size", { value: 250 * 1024 * 1024 });
    const err = await uploader.add(big, { x: 0, y: 0 }).catch((e) => e);
    expect(err).toBeInstanceOf(ImageError);
    expect((err as ImageError).message).toMatch(/250 MB/);
    expect((err as ImageError).message).toMatch(/200 MB/);
    expect(doc.all()).toHaveLength(0);
    expect(net.calls).toHaveLength(0);
    expect(uploader.pending()).toBe(0);
  });

  it("an mp4 becomes a video object (muted, not looping) with its poster time, sized like an image", async () => {
    const { doc, resolver, uploader } = setup();
    const id = await uploader.add(mp4(), { x: 500, y: 400 });
    const obj = doc.get(id) as VideoObj;
    expect(obj.type).toBe("video");
    expect(obj.kind).toBe("video");
    expect(obj.muted).toBe(true);
    expect(obj.loop).toBe(false);
    expect(obj.posterTime).toBe(1);
    expect([obj.w, obj.h]).toEqual([320, 180]);
    expect([obj.x + obj.w / 2, obj.y + obj.h / 2]).toEqual([500, 400]);
    expect(obj.posterAssetId).toBeNull();
    // local blobs: the poster for the picture, the video file as the original
    expect(resolver.url(obj.assetId, "w1024")).toMatch(/^blob:/);
    expect(resolver.url(obj.assetId, "original")).toMatch(/^blob:/);
    expect(resolver.meta.get(obj.assetId)).toMatchObject({ kind: "video", width: 1280, height: 720, variants: ["w256", "w1024"] });
    await uploader.whenIdle();
  });

  it("uploads the video as the original (video/mp4) and the poster stills as WebP, announcing kind video", async () => {
    const { doc, uploader, net } = setup();
    const id = await uploader.add(mp4(), { x: 0, y: 0 });
    await uploader.whenIdle();
    const assetId = (doc.get(id) as VideoObj).assetId;
    const [create, ...rest] = net.calls;
    expect(JSON.parse(String(create.body))).toMatchObject({ assetId, mime: "video/mp4", bytes: 11, width: 1280, height: 720, kind: "video", variants: ["w256", "w1024"] });
    const puts = rest.filter((c) => c.method === "PUT");
    expect(puts.find((c) => c.url.endsWith("/original"))?.headers["Content-Type"]).toBe("video/mp4");
    expect(puts.filter((c) => c.headers["Content-Type"] === "image/webp").map((c) => c.url.split("/").pop())).toEqual(["w256", "w1024"]);
    expect(rest.at(-1)!.url).toBe(`/api/assets/${assetId}/complete`);
  });

  it("the video file is kept as a Blob in IndexedDB and still shows after a reload", async () => {
    const dbName = "video-reload";
    const stuck = vi.fn(async () => {
      throw new TypeError("offline");
    }) as unknown as typeof fetch;
    const doc = new BoardDoc();
    const first = setup({ doc, dbName, fetch: stuck, delay: () => new Promise(() => {}) });
    const id = await first.uploader.add(mp4(), { x: 0, y: 0 });
    const assetId = (doc.get(id) as VideoObj).assetId;
    first.uploader.dispose();

    const resolver = new AssetResolverImpl({ publicHost: "img.example.com" });
    const second = new AssetUploader({ doc, resolver, dbName, fetch: fakeNetwork().fetch, delay: async () => {} });
    await second.ready;
    expect(resolver.url(assetId, "original")).toMatch(/^blob:/);
    expect(resolver.url(assetId, "w256")).toMatch(/^blob:/);
    await second.whenIdle();
    expect(second.pending()).toBe(0);
  });

  it("an unreadable video reports the error and creates nothing", async () => {
    const { doc, uploader } = setup({
      processVideo: async () => {
        throw new Error("Couldn't read video");
      },
    });
    await expect(uploader.add(mp4(), { x: 0, y: 0 })).rejects.toThrow("Couldn't read video");
    expect(doc.all()).toHaveLength(0);
  });

  it("local-only mode keeps the video on this device and never calls /api/assets", async () => {
    const net = fakeNetwork();
    const { doc, uploader } = setup({ localOnly: true, fetch: net.fetch });
    const id = await uploader.add(mp4(), { x: 0, y: 0 });
    expect(doc.get(id)?.type).toBe("video");
    expect(net.calls).toHaveLength(0);
  });
});

describe("AssetUploader: GIF files", () => {
  it("a 12 MB GIF becomes a video object of kind gif that loops, with poster stills for both small sizes", async () => {
    const big = gif();
    Object.defineProperty(big, "size", { value: 12 * 1024 * 1024 });
    const { doc, resolver, uploader, net } = setup({ process: async () => gifResult({ original: big }) });
    const id = await uploader.add(big, { x: 100, y: 100 });
    const obj = doc.get(id) as VideoObj;
    expect(obj.type).toBe("video");
    expect(obj.kind).toBe("gif");
    expect(obj.loop).toBe(true);
    expect(obj.muted).toBe(true);
    // 480x270 is below 1024, so the pipeline made only w256; the first frame fills in w1024
    expect(resolver.meta.get(obj.assetId)).toMatchObject({ kind: "gif", variants: ["w256", "w1024"] });
    await uploader.whenIdle();
    expect(JSON.parse(String(net.calls[0].body))).toMatchObject({ kind: "gif", mime: "image/gif", variants: ["w256", "w1024"] });
  });

  it("a GIF that is not animated stays an ordinary image", async () => {
    const { doc, uploader } = setup({ process: async () => gifResult({ animated: false }) });
    const id = await uploader.add(gif(), { x: 0, y: 0 });
    expect(doc.get(id)?.type).toBe("image");
  });

  it("without a first frame (the browser cannot draw it) the GIF is still added with the variants it has", async () => {
    const { doc, resolver, uploader } = setup({ process: async () => gifResult(), firstFrame: async () => null });
    const id = await uploader.add(gif(), { x: 0, y: 0 });
    expect(doc.get(id)?.type).toBe("video");
    expect(resolver.meta.get((doc.get(id) as VideoObj).assetId)?.variants).toEqual(["w256"]);
  });
});
