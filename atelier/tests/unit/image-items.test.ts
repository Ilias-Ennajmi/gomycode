import { describe, expect, it } from "vitest";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { defaultsFor } from "@/lib/engine/model/defaults";
import type { NewObject } from "@/lib/engine/model/types";
import { buildImageItems, imageZ, objectZ } from "@/lib/engine/render/image-items";
import { nodeZ, zBase } from "@/lib/engine/render/z-order";

const img = (id: string, over: Partial<NewObject> = {}) => ({ ...defaultsFor("image"), id, assetId: `as-${id}`, x: 10, y: 20, w: 300, h: 200, ...over }) as NewObject;

describe("z-order", () => {
  it("preserves fractional-index order", () => {
    const keys = ["Zz", "a0", "a0V", "a1", "a1G", "a2", "aZ", "aa", "b00", "zzzz"];
    const sorted = [...keys].sort();
    const zs = sorted.map(zBase);
    for (let i = 1; i < zs.length; i++) expect(zs[i]).toBeGreaterThanOrEqual(zs[i - 1]);
    expect(zBase("a0")).toBeLessThan(zBase("a1"));
    expect(nodeZ("zzzz")).toBeLessThan(2 ** 31);
  });
});

describe("buildImageItems", () => {
  it("describes image objects and skips everything else", () => {
    const doc = new BoardDoc();
    doc.createMany([img("a", { flipX: true, grayscale: true, opacity: 0.5 }), { ...defaultsFor("sticky"), id: "s", w: 100, h: 100 } as NewObject]);
    const items = buildImageItems(doc, ["a", "s", "gone"]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: "a", assetId: "as-a", rect: { x: 10, y: 20, w: 300, h: 200 }, flipX: true, grayscale: true, opacity: 0.5, caption: null });
  });

  it("folds the board-wide value check into grayscale and takes captions from the hook", () => {
    const doc = new BoardDoc();
    doc.create(img("a"));
    expect(buildImageItems(doc, ["a"])[0].grayscale).toBe(false);
    const [it] = buildImageItems(doc, ["a"], { valueCheck: true, captionFor: (o) => `credit ${o.id}` });
    expect(it.grayscale).toBe(true);
    expect(it.caption).toBe("credit a");
  });

  it("stacks an image against the other objects by index, and inside a frame just above the frame", () => {
    const doc = new BoardDoc();
    const frame = doc.create({ ...defaultsFor("frame"), x: 0, y: 0, w: 800, h: 600, name: "F", preset: "custom", order: "a" } as NewObject);
    const sticky = doc.create({ ...defaultsFor("sticky"), w: 100, h: 100 } as NewObject);
    const loose = doc.create(img("loose"));
    const inside = doc.create(img("inside", { parentId: frame }));
    const f = doc.get(frame)!;
    const s = doc.get(sticky)!;
    const l = doc.get(loose)!;
    const i = doc.get(inside)!;
    expect(imageZ(doc, l)).toBe(objectZ(doc, l));
    expect(objectZ(doc, f)).toBeLessThan(objectZ(doc, s));
    expect(objectZ(doc, s)).toBeLessThan(objectZ(doc, l)); // created later, so above
    expect(imageZ(doc, i)).toBe(objectZ(doc, f) + 1);
    expect(imageZ(doc, i)).toBeLessThan(objectZ(doc, s)); // the frame's image stays under the sticky made after the frame
  });
});
