import { describe, expect, it } from "vitest";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import type { ImageObj, VideoObj } from "@/lib/engine/model/types";
import { addRequestHref, assetOnBoard, parseAddRequest, placeAsset } from "@/lib/assets/place-asset";

const A = "6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e01";
const BOARD = "b0000000-0000-4000-8000-000000000001";

describe("placeAsset", () => {
  it("puts an image of an existing asset at the point, scaled to 320 px on its longest side, without any upload", () => {
    const doc = new BoardDoc();
    const id = placeAsset(doc, { assetId: A, kind: "image", width: 4000, height: 3000 }, { x: 1000, y: 500 });
    const o = doc.get(id) as ImageObj;
    expect(o).toMatchObject({ type: "image", assetId: A, w: 320, h: 240 });
    expect(o.x + o.w / 2).toBe(1000);
    expect(o.y + o.h / 2).toBe(500);
  });

  it("never scales a small picture up", () => {
    const doc = new BoardDoc();
    const o = doc.get(placeAsset(doc, { assetId: A, kind: "image", width: 200, height: 100 }, { x: 0, y: 0 })) as ImageObj;
    expect([o.w, o.h]).toEqual([200, 100]);
  });

  it("makes a video object for a video, and a looping muted one for a gif", () => {
    const doc = new BoardDoc();
    const v = doc.get(placeAsset(doc, { assetId: A, kind: "video", width: 1920, height: 1080 }, { x: 0, y: 0 })) as VideoObj;
    expect(v).toMatchObject({ type: "video", kind: "video", loop: false });
    const g = doc.get(placeAsset(doc, { assetId: A, kind: "gif", width: 480, height: 270 }, { x: 0, y: 0 })) as VideoObj;
    expect(g).toMatchObject({ type: "video", kind: "gif", loop: true, muted: true });
  });

  it("carries provenance onto the object", () => {
    const doc = new BoardDoc();
    const provenance = { sourceUrl: "https://example.com/p", credit: "Jane", licence: "CC0", capturedAt: "2026-11-12" };
    const o = doc.get(placeAsset(doc, { assetId: A, kind: "image", width: 100, height: 100, provenance }, { x: 0, y: 0 })) as ImageObj;
    expect(o.provenance).toEqual(provenance);
  });

  it("is one undo step", () => {
    const doc = new BoardDoc();
    doc.stopCapturing();
    placeAsset(doc, { assetId: A, kind: "image", width: 100, height: 100 }, { x: 0, y: 0 });
    doc.undo();
    expect(doc.all()).toHaveLength(0);
  });

  it("guards against a zero or non-finite size", () => {
    const doc = new BoardDoc();
    const o = doc.get(placeAsset(doc, { assetId: A, kind: "image", width: 0, height: Number.NaN }, { x: 0, y: 0 })) as ImageObj;
    expect(o.w).toBeGreaterThan(0);
    expect(o.h).toBeGreaterThan(0);
    expect(Number.isFinite(o.x + o.y)).toBe(true);
  });
});

describe("assetOnBoard", () => {
  it("sees an asset used by an image, a video or its poster", () => {
    const doc = new BoardDoc();
    expect(assetOnBoard(doc, A)).toBe(false);
    placeAsset(doc, { assetId: A, kind: "image", width: 10, height: 10 }, { x: 0, y: 0 });
    expect(assetOnBoard(doc, A)).toBe(true);
  });
});

describe("the add-to-board link", () => {
  const asset = { assetId: A, kind: "image" as const, width: 4000, height: 3000 };

  it("round-trips through the board URL", () => {
    const href = addRequestHref(BOARD, asset);
    expect(href.startsWith(`/b/${BOARD}?`)).toBe(true);
    expect(parseAddRequest(href.slice(href.indexOf("?")))).toEqual(asset);
  });

  it("is null when nothing is asked for", () => {
    expect(parseAddRequest("")).toBeNull();
    expect(parseAddRequest("?inbox=1")).toBeNull();
  });

  it("rejects a bad asset id, kind or size", () => {
    expect(parseAddRequest(`?add=nope&ak=image&aw=10&ah=10`)).toBeNull();
    expect(parseAddRequest(`?add=${A}&ak=pdf&aw=10&ah=10`)).toBeNull();
    expect(parseAddRequest(`?add=${A}&ak=image&aw=0&ah=10`)).toBeNull();
    expect(parseAddRequest(`?add=${A}&ak=image&aw=abc&ah=10`)).toBeNull();
    expect(parseAddRequest(`?add=${A}&ak=image&aw=999999&ah=10`)).toBeNull();
  });
});
