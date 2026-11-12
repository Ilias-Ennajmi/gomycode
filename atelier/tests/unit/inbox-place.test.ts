import { describe, expect, it, vi } from "vitest";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import type { EmbedObj, ImageObj, LinkObj, TextObj, VideoObj } from "@/lib/engine/model/types";
import { placeInboxItem, type PlaceDeps } from "@/lib/inbox/place";
import type { InboxItem } from "@/lib/inbox/types";

const A = "6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e01";
const item = (over: Partial<InboxItem>): InboxItem => ({
  id: "i1", kind: "text", assetId: null, url: null, text: null, title: null, sourceUrl: null, credit: null, createdAt: "2026-11-12T09:30:00.000Z", placedAt: null, ...over,
});
function deps(over: Partial<PlaceDeps> = {}) {
  const markPlaced = vi.fn();
  const d: PlaceDeps = { assetInfo: () => ({ kind: "image", width: 4000, height: 3000, provenance: null }), markPlaced, links: null, ...over };
  return { d, markPlaced };
}

describe("placeInboxItem", () => {
  it("places an image item as an ImageObj of the same asset (no upload), with provenance from the item", () => {
    const doc = new BoardDoc();
    const { d, markPlaced } = deps();
    const ids = placeInboxItem(doc, item({ kind: "image", assetId: A, sourceUrl: "https://example.com/p/1", credit: "Jane Doe" }), { x: 100, y: 100 }, d);
    expect(ids).toHaveLength(1);
    const o = doc.get(ids[0]) as ImageObj;
    expect(o).toMatchObject({ type: "image", assetId: A, w: 320, h: 240 });
    expect(o.provenance).toEqual({ sourceUrl: "https://example.com/p/1", credit: "Jane Doe", licence: "", capturedAt: "2026-11-12" });
    expect(o.x + o.w / 2).toBe(100);
    expect(markPlaced).toHaveBeenCalledWith("i1");
  });

  it("prefers the asset's own provenance fields and adds what the item knows", () => {
    const doc = new BoardDoc();
    const assetProv = { sourceUrl: "https://asset.example/original", credit: "Asset credit", licence: "CC0", capturedAt: "2026-01-01" };
    const { d } = deps({ assetInfo: () => ({ kind: "image", width: 100, height: 100, provenance: assetProv }) });
    const [id] = placeInboxItem(doc, item({ kind: "image", assetId: A, sourceUrl: "https://other.example/x", credit: "Item credit" }), { x: 0, y: 0 }, d);
    expect((doc.get(id) as ImageObj).provenance).toEqual(assetProv);
  });

  it("leaves provenance empty for an image that has no source and no credit", () => {
    const doc = new BoardDoc();
    const [id] = placeInboxItem(doc, item({ kind: "image", assetId: A }), { x: 0, y: 0 }, deps().d);
    expect((doc.get(id) as ImageObj).provenance).toBeNull();
  });

  it("drops a source that is not an http(s) link rather than copying it", () => {
    const doc = new BoardDoc();
    const [id] = placeInboxItem(doc, item({ kind: "image", assetId: A, sourceUrl: "javascript:alert(1)", credit: "x" }), { x: 0, y: 0 }, deps().d);
    expect((doc.get(id) as ImageObj).provenance?.sourceUrl).toBeNull();
  });

  it("places a video item (or a gif) as a VideoObj", () => {
    const doc = new BoardDoc();
    const { d } = deps({ assetInfo: () => ({ kind: "video", width: 1920, height: 1080, provenance: null }) });
    const [v] = placeInboxItem(doc, item({ kind: "video", assetId: A }), { x: 0, y: 0 }, d);
    expect(doc.get(v) as VideoObj).toMatchObject({ type: "video", kind: "video", assetId: A });
    const g = deps({ assetInfo: () => ({ kind: "gif", width: 400, height: 300, provenance: null }) });
    const [gid] = placeInboxItem(doc, item({ kind: "image", assetId: A }), { x: 0, y: 0 }, g.d);
    expect(doc.get(gid) as VideoObj).toMatchObject({ type: "video", kind: "gif", loop: true });
  });

  it("falls back to a square when nothing is known about the asset's size", () => {
    const doc = new BoardDoc();
    const [id] = placeInboxItem(doc, item({ kind: "image", assetId: A }), { x: 0, y: 0 }, deps({ assetInfo: () => null }).d);
    const o = doc.get(id) as ImageObj;
    expect(o.w).toBe(o.h);
    expect(o.w).toBeGreaterThan(0);
  });

  it("places a YouTube link as an embed", () => {
    const doc = new BoardDoc();
    const { d, markPlaced } = deps();
    const [id] = placeInboxItem(doc, item({ kind: "url", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }), { x: 0, y: 0 }, d);
    expect(doc.get(id) as EmbedObj).toMatchObject({ type: "embed", provider: "youtube" });
    expect(markPlaced).toHaveBeenCalledWith("i1");
  });

  it("places any other link as a link card (a plain one without preview support)", () => {
    const doc = new BoardDoc();
    const [id] = placeInboxItem(doc, item({ kind: "url", url: "https://example.com/journal" }), { x: 0, y: 0 }, deps().d);
    expect(doc.get(id) as LinkObj).toMatchObject({ type: "link", url: "https://example.com/journal" });
  });

  it("places a note as a text object holding the words", () => {
    const doc = new BoardDoc();
    const [id] = placeInboxItem(doc, item({ kind: "text", text: "Remember the harbour light" }), { x: 0, y: 0 }, deps().d);
    const o = doc.get(id) as TextObj;
    expect(o.type).toBe("text");
    expect(doc.content(id)?.toString()).toContain("Remember the harbour light");
  });

  it("shows markup in a note as plain characters", () => {
    const doc = new BoardDoc();
    placeInboxItem(doc, item({ kind: "text", text: "<img src=x onerror=alert(1)>" }), { x: 0, y: 0 }, deps().d);
    expect(doc.all().map((o) => o.type)).toEqual(["text"]); // one text object: the markup is words, not an element
  });

  it("is one undo step", () => {
    const doc = new BoardDoc();
    doc.stopCapturing();
    placeInboxItem(doc, item({ kind: "text", text: "x" }), { x: 0, y: 0 }, deps().d);
    doc.undo();
    expect(doc.all()).toHaveLength(0);
  });

  it("placing the same item twice creates objects twice but marks it placed once", () => {
    const doc = new BoardDoc();
    const { d, markPlaced } = deps();
    const it1 = item({ kind: "text", text: "again" });
    placeInboxItem(doc, it1, { x: 0, y: 0 }, d);
    placeInboxItem(doc, it1, { x: 50, y: 50 }, d);
    expect(doc.all().filter((o) => o.type === "text")).toHaveLength(2);
    expect(markPlaced).toHaveBeenCalledTimes(1);
  });

  it("does not mark an item placed when nothing could be created", () => {
    const doc = new BoardDoc();
    const { d, markPlaced } = deps();
    expect(placeInboxItem(doc, item({ kind: "image", assetId: null }), { x: 0, y: 0 }, d)).toEqual([]);
    expect(placeInboxItem(doc, item({ kind: "text", text: "  " }), { x: 0, y: 0 }, d)).toEqual([]);
    expect(markPlaced).not.toHaveBeenCalled();
  });

  it("marks an item that is already placed again at most once more (the caller's Set)", () => {
    const doc = new BoardDoc();
    const { d, markPlaced } = deps();
    placeInboxItem(doc, item({ kind: "text", text: "x", placedAt: "2026-11-12T10:00:00.000Z" }), { x: 0, y: 0 }, d);
    expect(markPlaced).not.toHaveBeenCalled();
  });
});
