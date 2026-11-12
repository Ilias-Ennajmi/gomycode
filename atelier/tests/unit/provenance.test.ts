import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AssetResolverImpl } from "@/lib/assets/resolver";
import { AssetUploader, type ProcessedImage } from "@/lib/assets/upload-queue";
import { insertPaste, parseClipboard } from "@/lib/engine/clipboard/parse";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { defaultsFor } from "@/lib/engine/model/defaults";
import type { ImageObj, Provenance, VideoObj } from "@/lib/engine/model/types";
import { saveProvenance } from "@/lib/engine/provenance/save";

const AID = "6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4eb1";
const prov = (o: Partial<Provenance> = {}): Provenance => ({ sourceUrl: "https://example.com/p", credit: "Jane Doe", licence: "CC BY 4.0", capturedAt: "2026-11-12", ...o });

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe("saveProvenance", () => {
  function setup(over: Partial<ImageObj> = {}) {
    const doc = new BoardDoc();
    const id = doc.create({ ...defaultsFor("image"), assetId: AID, w: 10, h: 10, ...over } as never);
    doc.undoManager.clear();
    const patchAsset = vi.fn().mockResolvedValue(undefined);
    return { doc, id, patchAsset };
  }

  it("writes the object as one undo step and PATCHes the asset when it has no provenance yet", () => {
    const t = setup();
    saveProvenance(t.doc, t.id, prov(), { patchAsset: t.patchAsset, assetHasProvenance: () => false });
    expect((t.doc.get(t.id) as ImageObj).provenance).toEqual(prov());
    expect(t.patchAsset).toHaveBeenCalledWith(AID, prov());
    t.doc.undo();
    expect((t.doc.get(t.id) as ImageObj).provenance).toBeNull();
    expect(t.doc.canUndo()).toBe(false);
  });

  it("never overwrites the provenance an asset already has (first capture wins)", () => {
    const t = setup();
    saveProvenance(t.doc, t.id, prov(), { patchAsset: t.patchAsset, assetHasProvenance: () => true });
    expect((t.doc.get(t.id) as ImageObj).provenance).toEqual(prov());
    expect(t.patchAsset).not.toHaveBeenCalled();
  });

  it("works for videos too", () => {
    const doc = new BoardDoc();
    const id = doc.create({ ...defaultsFor("video"), assetId: AID } as never);
    saveProvenance(doc, id, prov(), { patchAsset: vi.fn().mockResolvedValue(undefined), assetHasProvenance: () => false });
    expect((doc.get(id) as VideoObj).provenance).toEqual(prov());
  });

  it("an all-empty record clears the object (null) and tells nobody", () => {
    const t = setup({ provenance: prov() });
    saveProvenance(t.doc, t.id, { sourceUrl: null, credit: "", licence: "", capturedAt: null }, { patchAsset: t.patchAsset, assetHasProvenance: () => false });
    expect((t.doc.get(t.id) as ImageObj).provenance).toBeNull();
    expect(t.patchAsset).not.toHaveBeenCalled();
  });

  it("refuses an invalid record and changes nothing", () => {
    const t = setup();
    const r = saveProvenance(t.doc, t.id, { ...prov(), sourceUrl: "javascript:alert(1)" }, { patchAsset: t.patchAsset, assetHasProvenance: () => false });
    expect(r).toBe(false);
    expect((t.doc.get(t.id) as ImageObj).provenance).toBeNull();
    expect(t.doc.canUndo()).toBe(false);
    expect(t.patchAsset).not.toHaveBeenCalled();
  });

  it("a patch that fails is not an error for the editor (the object holds the truth)", async () => {
    const t = setup();
    t.patchAsset.mockRejectedValue(new Error("offline"));
    expect(() => saveProvenance(t.doc, t.id, prov(), { patchAsset: t.patchAsset, assetHasProvenance: () => false })).not.toThrow();
    await Promise.resolve();
    expect((t.doc.get(t.id) as ImageObj).provenance).toEqual(prov());
  });

  it("ignores objects that are not pictures or videos, and unknown ids", () => {
    const doc = new BoardDoc();
    const sticky = doc.create({ ...defaultsFor("sticky") } as never);
    expect(saveProvenance(doc, sticky, prov(), { patchAsset: vi.fn(), assetHasProvenance: () => false })).toBe(false);
    expect(saveProvenance(doc, "nope", prov(), { patchAsset: vi.fn(), assetHasProvenance: () => false })).toBe(false);
  });
});

describe("paste and drop fill in the source", () => {
  const png = () => new File([new Uint8Array(8)], "a.png", { type: "image/png" });

  it("a copied web image (file + html <img src>) carries its source link and the date", () => {
    const items = parseClipboard({ files: [png()], html: '<meta charset="utf-8"><img src="https://images.example.com/a.jpg">' });
    expect(items).toHaveLength(1);
    const item = items[0];
    expect(item.kind).toBe("image");
    expect(item.kind === "image" && item.provenance).toMatchObject({ sourceUrl: "https://images.example.com/a.jpg", credit: "", licence: "" });
    expect(item.kind === "image" && item.provenance?.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("a dragged web image (file + uri-list) uses the link in the list", () => {
    const [item] = parseClipboard({ files: [png()], text: "https://cdn.example.com/p/1.png" });
    expect(item.kind === "image" && item.provenance?.sourceUrl).toBe("https://cdn.example.com/p/1.png");
  });

  it("a page URL the caller supplies wins, and applies to every file", () => {
    const items = parseClipboard({ files: [png(), png()], url: "https://example.com/post", html: '<img src="https://img.example.com/x.jpg">' });
    expect(items.map((i) => i.kind === "image" && i.provenance?.sourceUrl)).toEqual(["https://example.com/post", "https://example.com/post"]);
  });

  it("several dropped files with only html carry nothing (the html names only one of them)", () => {
    const items = parseClipboard({ files: [png(), png()], html: '<img src="https://img.example.com/x.jpg">' });
    expect(items.every((i) => i.kind === "image" && !i.provenance)).toBe(true);
  });

  it("a plain file from disk carries nothing", () => {
    const [item] = parseClipboard({ files: [png()] });
    expect(item.kind === "image" && item.provenance).toBeFalsy();
  });

  it("a hostile source is dropped, the image still goes in", () => {
    const [item] = parseClipboard({ files: [png()], html: '<img src="javascript:alert(1)">' });
    expect(item.kind).toBe("image");
    expect(item.kind === "image" && item.provenance).toBeFalsy();
  });

  it("insertPaste hands the provenance to addImage, and nothing extra when there is none", () => {
    const addImage = vi.fn().mockResolvedValue("id");
    const doc = new BoardDoc();
    insertPaste(doc, parseClipboard({ files: [png()], text: "https://cdn.example.com/p/1.png" }), { x: 0, y: 0 }, { addImage });
    expect(addImage).toHaveBeenCalledTimes(1);
    expect(addImage.mock.calls[0][2]).toMatchObject({ sourceUrl: "https://cdn.example.com/p/1.png" });
    addImage.mockClear();
    insertPaste(doc, parseClipboard({ files: [png()] }), { x: 0, y: 0 }, { addImage });
    expect(addImage.mock.calls[0]).toHaveLength(2);
  });
});

describe("the uploader records the first capture", () => {
  const processed = (): ProcessedImage => ({ width: 2000, height: 1000, mime: "image/png", original: new Blob(["x"], { type: "image/png" }), variants: { w1024: new Blob(["v"], { type: "image/webp" }) }, animated: false });
  const png = () => new File([new Uint8Array(8)], "a.png", { type: "image/png" });
  function net(patchStatus = 200) {
    const calls: { method: string; url: string; body?: unknown }[] = [];
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ method: init?.method ?? "GET", url, body: init?.body });
      if (url === "/api/assets") {
        const { assetId } = JSON.parse(String(init!.body)) as { assetId: string };
        return Response.json({ assetId, uploads: { original: `https://r2.test/${assetId}/o`, w1024: `https://r2.test/${assetId}/w` }, duplicateOf: null });
      }
      if (url.endsWith("/complete")) return Response.json({ ok: true });
      if (init?.method === "PATCH") return new Response("{}", { status: patchStatus });
      return new Response(null, { status: 200 });
    });
    return { calls, fetch: fetch as unknown as typeof fetch };
  }

  it("puts the provenance on the new object and PATCHes it to the asset once the upload is complete", async () => {
    const n = net();
    const doc = new BoardDoc();
    const u = new AssetUploader({ doc, resolver: new AssetResolverImpl(), process: async () => processed(), fetch: n.fetch, delay: async () => {} });
    const id = await u.add(png(), { x: 0, y: 0 }, { provenance: prov() });
    expect((doc.get(id) as ImageObj).provenance).toEqual(prov());
    await u.whenIdle();
    const patch = n.calls.find((c) => c.method === "PATCH")!;
    expect(patch.url).toBe(`/api/assets/${(doc.get(id) as ImageObj).assetId}`);
    expect(JSON.parse(String(patch.body))).toEqual({ provenance: prov() });
    expect(n.calls.findIndex((c) => c.method === "PATCH")).toBeGreaterThan(n.calls.findIndex((c) => c.url.endsWith("/complete")));
  });

  it("a PATCH the server refuses (local-only answers 503) does not fail the upload", async () => {
    const n = net(503);
    const doc = new BoardDoc();
    const u = new AssetUploader({ doc, resolver: new AssetResolverImpl(), process: async () => processed(), fetch: n.fetch, delay: async () => {} });
    await u.add(png(), { x: 0, y: 0 }, { provenance: prov() });
    await u.whenIdle();
    expect(u.pending()).toBe(0);
  });

  it("no provenance, no PATCH", async () => {
    const n = net();
    const doc = new BoardDoc();
    const u = new AssetUploader({ doc, resolver: new AssetResolverImpl(), process: async () => processed(), fetch: n.fetch, delay: async () => {} });
    await u.add(png(), { x: 0, y: 0 });
    await u.whenIdle();
    expect(n.calls.some((c) => c.method === "PATCH")).toBe(false);
  });
});
