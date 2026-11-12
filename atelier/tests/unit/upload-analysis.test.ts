import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { AssetMetaStore } from "@/lib/assets/meta-store";
import { AssetResolverImpl } from "@/lib/assets/resolver";
import { AssetUploader, type ProcessedImage } from "@/lib/assets/upload-queue";

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

const PALETTE = [{ hex: "#dc1e28", weight: 0.7 }, { hex: "#1e3cc8", weight: 0.3 }];
const processed = (over: Partial<ProcessedImage> = {}): ProcessedImage => ({
  width: 2000,
  height: 1000,
  mime: "image/png",
  original: new Blob(["png-bytes"], { type: "image/png" }),
  variants: { w256: new Blob(["a"], { type: "image/webp" }), w1024: new Blob(["b"], { type: "image/webp" }) },
  animated: false,
  palette: PALETTE,
  phash: "0123456789abcdef",
  ...over,
});
const png = () => new File([new Uint8Array(10)], "a.png", { type: "image/png" });

function setup(proc: ProcessedImage) {
  const calls: { url: string; body: Record<string, unknown> | null }[] = [];
  const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null;
    calls.push({ url, body });
    if (url === "/api/assets") {
      const id = body!.assetId as string;
      const uploads: Record<string, string> = { original: `https://r2.test/${id}/original` };
      for (const v of (body!.variants as string[]) ?? []) uploads[v] = `https://r2.test/${id}/${v}`;
      return Response.json({ assetId: id, uploads, duplicateOf: null });
    }
    return url.endsWith("/complete") ? Response.json({ ok: true }) : new Response(null, { status: 200 });
  }) as unknown as typeof fetch;
  const meta = new AssetMetaStore({ persist: false });
  const resolver = new AssetResolverImpl({ publicHost: "img.example.com", meta });
  const doc = new BoardDoc();
  const uploader = new AssetUploader({ doc, resolver, process: async () => proc, fetch: fetchFn, delay: async () => {} });
  return { calls, meta, uploader, doc };
}

describe("AssetUploader colour analysis", () => {
  it("sends the hash to look for duplicates and the palette and hash when completing; the metadata cache knows them at once", async () => {
    const { calls, meta, uploader, doc } = setup(processed());
    const objectId = await uploader.add(png(), { x: 0, y: 0 });
    await uploader.whenIdle();
    const assetId = (doc.get(objectId) as { assetId: string }).assetId;
    expect(calls[0].body).toMatchObject({ phash: "0123456789abcdef" });
    expect(calls[0].body).not.toHaveProperty("palette");
    const complete = calls.find((c) => c.url.endsWith("/complete"))!;
    expect(complete.body).toMatchObject({ phash: "0123456789abcdef", palette: PALETTE });
    expect(meta.get(assetId)).toMatchObject({ palette: PALETTE, phash: "0123456789abcdef", analysisVersion: 1 });
  });

  it("an asset added without a canvas object does not ask for duplicates but still records its analysis", async () => {
    const { calls, meta, uploader } = setup(processed());
    const assetId = await uploader.addAssetOnly(png());
    await uploader.whenIdle();
    expect(calls[0].body).not.toHaveProperty("phash");
    expect(calls.find((c) => c.url.endsWith("/complete"))!.body).toMatchObject({ phash: "0123456789abcdef", palette: PALETTE });
    expect(meta.get(assetId)?.analysisVersion).toBe(1);
  });

  it("an image the pipeline could not analyse completes without palette and stays at analysis version 0", async () => {
    const { calls, meta, uploader } = setup(processed({ palette: undefined, phash: undefined }));
    const assetId = await uploader.addAssetOnly(png());
    await uploader.whenIdle();
    const complete = calls.find((c) => c.url.endsWith("/complete"))!.body!;
    expect(complete).not.toHaveProperty("palette");
    expect(complete).not.toHaveProperty("phash");
    expect(meta.get(assetId)).toMatchObject({ palette: null, analysisVersion: 0 });
  });
});
