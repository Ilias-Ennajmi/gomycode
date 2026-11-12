import { describe, expect, it } from "vitest";
import { buildViewerBoard } from "@/lib/server/viewer-board";
import { buildTree, cullTree, frameIdOf, imageAt, objectsOfSlide, slideOf } from "@/lib/viewer/scene";
import { ViewerResolver } from "@/lib/viewer/viewer-resolver";
import { A1, A2, assetRow, makeFixture } from "./helpers/viewer-fixture";
import { makeWorld } from "./helpers/share-world";
import type { ViewerBoard } from "@/lib/viewer/viewer-types";

async function board(): Promise<{ b: ViewerBoard; ids: ReturnType<typeof makeFixture>["ids"] }> {
  const fx = makeFixture();
  const w = await makeWorld({ scope: "board" });
  const b = buildViewerBoard({
    state: fx.state, link: w.link, round: null, title: "T", assets: [assetRow(A1), assetRow(A2)], visitor: { id: "v", displayName: "J" },
    diffsSinceLastView: [], sinceRound: null, assetBase: "https://a.example",
  });
  return { b, ids: fx.ids };
}

describe("scene helpers", () => {
  it("objectsOfSlide returns the frame and what is inside it, never another frame", async () => {
    const { b, ids } = await board();
    const list = objectsOfSlide(b.objects, ids.frameA);
    expect(list[0].id).toBe(ids.frameA);
    expect(list.some((o) => o.id === ids.imgA)).toBe(true);
    expect(list.some((o) => o.id === ids.imgB || o.id === ids.frameB)).toBe(false);
  });

  it("buildTree nests by parent and keeps paint order", async () => {
    const { b, ids } = await board();
    const roots = buildTree(b.objects);
    const frame = roots.find((n) => n.obj.id === ids.frameA)!;
    expect(frame.children.map((c) => c.obj.id)).toContain(ids.imgA);
    expect(roots.some((n) => n.obj.id === ids.imgA)).toBe(false);
  });

  it("frameIdOf finds the nearest frame, null for a free object", async () => {
    const { b, ids } = await board();
    expect(frameIdOf(b.objects, ids.imgA)).toBe(ids.frameA);
    expect(frameIdOf(b.objects, ids.frameA)).toBe(ids.frameA);
    expect(frameIdOf(b.objects, ids.imgFree)).toBeNull();
    expect(frameIdOf(b.objects, "nope")).toBeNull();
  });

  it("imageAt finds the topmost image under a canvas point", async () => {
    const { b, ids } = await board();
    const a = b.objects.find((o) => o.id === ids.imgA)!;
    expect(imageAt(objectsOfSlide(b.objects, ids.frameA), { x: a.x + 5, y: a.y + 5 })?.id).toBe(ids.imgA);
    expect(imageAt(objectsOfSlide(b.objects, ids.frameA), { x: -500, y: -500 })).toBeNull();
  });

  it("cullTree drops subtrees outside the view and keeps frames that overlap it", async () => {
    const { b, ids } = await board();
    const roots = buildTree(b.objects);
    const view = { x: 0, y: 0, w: 700, h: 500 }; // frame A only
    const kept = cullTree(roots, view).map((n) => n.obj.id);
    expect(kept).toContain(ids.frameA);
    expect(kept).not.toContain(ids.frameB);
  });

  it("slideOf finds a slide by id", async () => {
    const { b, ids } = await board();
    expect(slideOf(b, ids.frameB)?.name).toBe("Direction B");
    expect(slideOf(b, "x")).toBeNull();
  });
});

describe("ViewerResolver", () => {
  it("builds R2 urls from the board's asset base and variants", async () => {
    const { b } = await board();
    const r = new ViewerResolver(b);
    expect(r.url(A1, "w1024")).toBe(`https://a.example/a/${A1}/w1024.webp`);
    expect(r.url(A1, "original")).toBe(`https://a.example/a/${A1}/original`);
    // w2048 does not exist for this asset: falls back like the editor's resolver
    expect(r.url(A1, "w2048")).toBe(`https://a.example/a/${A1}/w1024.webp`);
    expect(r.available(A1)).toEqual({ variants: ["w256", "w1024"], width: 1600, height: 1000 });
    expect(r.url("not-an-id", "w1024")).toBeNull();
    expect(r.url("a9999999-9999-4999-8999-999999999999", "w1024")).toBeNull(); // not on the board
  });

  it("returns null without an asset base (nothing to load from)", async () => {
    const { b } = await board();
    expect(new ViewerResolver({ ...b, assetBase: "" }).url(A1, "w1024")).toBeNull();
  });
});
