import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { SpatialIndex } from "@/lib/engine/spatial/spatial-index";
import { boundsOf, intersects } from "@/lib/engine/geometry/rect";
import { defaultsFor } from "@/lib/engine/model/defaults";
import type { NewObject, Rect } from "@/lib/engine/model/types";

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function box(x: number, y: number, w: number, h: number, extra: Partial<NewObject> = {}): NewObject {
  return { ...defaultsFor("shape"), x, y, w, h, ...extra } as NewObject;
}

function brute(doc: BoardDoc, r: Rect): string[] {
  return doc
    .all()
    .filter((o) => intersects(boundsOf(o), r))
    .map((o) => o.id);
}

const sorted = (a: string[]) => [...a].sort();

describe("SpatialIndex", () => {
  it("matches a brute-force filter for 10,000 random objects and 50 random rects", () => {
    const rand = rng(42);
    const doc = new BoardDoc();
    doc.createMany(
      Array.from({ length: 10_000 }, () =>
        box(rand() * 20_000 - 10_000, rand() * 20_000 - 10_000, 5 + rand() * 400, 5 + rand() * 400, {
          rotation: (rand() - 0.5) * Math.PI * 2,
        }),
      ),
    );
    const index = new SpatialIndex(doc);
    for (let i = 0; i < 50; i++) {
      const r = { x: rand() * 20_000 - 10_000, y: rand() * 20_000 - 10_000, w: rand() * 3000, h: rand() * 3000 };
      expect(sorted(index.search(r))).toEqual(sorted(brute(doc, r)));
    }
    index.destroy();
  });

  it("indexes objects that already exist when it is created", () => {
    const doc = new BoardDoc();
    const a = doc.create(box(0, 0, 10, 10));
    const index = new SpatialIndex(doc);
    expect(index.search({ x: 0, y: 0, w: 5, h: 5 })).toEqual([a]);
  });

  it("follows creates, moves, resizes and rotations incrementally", () => {
    const doc = new BoardDoc();
    doc.createMany(Array.from({ length: 500 }, (_, i) => box(i * 1000, 0, 10, 10)));
    const allSpy = vi.spyOn(doc, "all");
    const index = new SpatialIndex(doc);
    const baseline = allSpy.mock.calls.length;

    const id = doc.create(box(-5000, -5000, 100, 100));
    expect(index.search({ x: -4990, y: -4990, w: 10, h: 10 })).toEqual([id]);

    doc.update(id, { x: 7000, y: 7000 });
    expect(index.search({ x: -4990, y: -4990, w: 10, h: 10 })).toEqual([]);
    expect(index.search({ x: 7010, y: 7010, w: 10, h: 10 })).toEqual([id]);

    doc.update(id, { w: 5000 });
    expect(index.search({ x: 11_000, y: 7050, w: 1, h: 1 })).toEqual([id]);

    doc.update(id, { x: 0, y: 0, w: 200, h: 10, rotation: Math.PI / 2 }); // becomes a tall bar around x=100
    expect(index.search({ x: 99, y: 90, w: 2, h: 2 })).toEqual([id]);
    expect(index.search({ x: 190, y: 0, w: 2, h: 2 })).not.toContain(id);

    expect(allSpy.mock.calls.length).toBe(baseline); // no full rescans
    index.destroy();
  });

  it("deleted ids disappear, including cascaded children", () => {
    const doc = new BoardDoc();
    const f = doc.create({ ...defaultsFor("frame"), x: 0, y: 0, w: 500, h: 500 } as NewObject);
    const c = doc.create(box(10, 10, 20, 20, { parentId: f }));
    const keep = doc.create(box(1000, 1000, 20, 20));
    const index = new SpatialIndex(doc);
    expect(sorted(index.search({ x: 0, y: 0, w: 100, h: 100 }))).toEqual(sorted([f, c]));
    doc.remove([f]);
    expect(index.search({ x: 0, y: 0, w: 100, h: 100 })).toEqual([]);
    expect(index.search({ x: 1000, y: 1000, w: 1, h: 1 })).toEqual([keep]);
  });

  it("follows undo, redo and remote updates", () => {
    const doc = new BoardDoc();
    const index = new SpatialIndex(doc);
    const a = doc.create(box(0, 0, 10, 10));
    doc.stopCapturing();
    doc.update(a, { x: 500 });
    expect(index.search({ x: 500, y: 0, w: 1, h: 1 })).toEqual([a]);
    doc.undo();
    expect(index.search({ x: 500, y: 0, w: 1, h: 1 })).toEqual([]);
    expect(index.search({ x: 0, y: 0, w: 1, h: 1 })).toEqual([a]);
    doc.undo();
    expect(index.search({ x: 0, y: 0, w: 1, h: 1 })).toEqual([]);
    doc.redo();
    expect(index.search({ x: 0, y: 0, w: 1, h: 1 })).toEqual([a]);

    const other = new BoardDoc();
    const r = other.create(box(300, 300, 10, 10));
    Y.applyUpdate(doc.ydoc, Y.encodeStateAsUpdate(other.ydoc), "remote");
    expect(index.search({ x: 300, y: 300, w: 1, h: 1 })).toEqual([r]);
    other.update(r, { x: 900 });
    Y.applyUpdate(doc.ydoc, Y.encodeStateAsUpdate(other.ydoc, Y.encodeStateVector(doc.ydoc)), "remote");
    expect(index.search({ x: 300, y: 300, w: 1, h: 1 })).toEqual([]);
    expect(index.search({ x: 900, y: 300, w: 1, h: 1 })).toEqual([r]);
    expect(index.search({ x: 900, y: 900, w: 1, h: 1 })).toEqual([]);
  });

  it("search results are in z-order (bottom first)", () => {
    const doc = new BoardDoc();
    const ids = doc.createMany([box(0, 0, 50, 50), box(10, 10, 50, 50), box(20, 20, 50, 50)]);
    const index = new SpatialIndex(doc);
    expect(index.search({ x: 0, y: 0, w: 100, h: 100 })).toEqual(ids);
  });

  it("pointCandidates returns top-most first and honours tolerance", () => {
    const doc = new BoardDoc();
    const [bottom, middle, top] = doc.createMany([box(0, 0, 100, 100), box(20, 20, 100, 100), box(40, 40, 100, 100)]);
    const far = doc.create(box(1000, 1000, 10, 10));
    const index = new SpatialIndex(doc);
    expect(index.pointCandidates({ x: 50, y: 50 }, 0)).toEqual([top, middle, bottom]);
    expect(index.pointCandidates({ x: 10, y: 10 }, 0)).toEqual([bottom]);
    expect(index.pointCandidates({ x: 1005, y: 1005 }, 0)).toEqual([far]);
    expect(index.pointCandidates({ x: 1013, y: 1005 }, 0)).toEqual([]);
    expect(index.pointCandidates({ x: 1013, y: 1005 }, 5)).toEqual([far]);
    expect(index.pointCandidates({ x: -500, y: -500 }, 3)).toEqual([]);
  });

  it("pointCandidates order follows z-order changes", () => {
    const doc = new BoardDoc();
    const [a, b] = doc.createMany([box(0, 0, 100, 100), box(0, 0, 100, 100)]);
    const index = new SpatialIndex(doc);
    expect(index.pointCandidates({ x: 50, y: 50 }, 0)).toEqual([b, a]);
    doc.update(a, { index: doc.get(b)!.index + "V" });
    expect(index.pointCandidates({ x: 50, y: 50 }, 0)).toEqual([a, b]);
  });

  it("visible() includes objects within the margin and excludes those beyond it", () => {
    const doc = new BoardDoc();
    const inside = doc.create(box(100, 100, 50, 50));
    const inMargin = doc.create(box(-200, 100, 50, 50)); // 150 px left of the viewport edge at zoom 1
    const beyond = doc.create(box(-1000, 100, 50, 50));
    const below = doc.create(box(100, 900 + 100, 50, 50));
    const index = new SpatialIndex(doc);
    const cam = { x: 0, y: 0, z: 1 };
    const vp = { w: 1000, h: 800 };
    const v = index.visible(cam, vp);
    expect(v).toContain(inside);
    expect(v).toContain(inMargin);
    expect(v).toContain(below);
    expect(v).not.toContain(beyond);
    expect(index.visible(cam, vp, 0)).toEqual([inside]);
  });

  it("visible() respects pan and zoom", () => {
    const doc = new BoardDoc();
    const a = doc.create(box(5000, 5000, 100, 100));
    const b = doc.create(box(0, 0, 100, 100));
    const index = new SpatialIndex(doc);
    expect(index.visible({ x: 4900, y: 4900, z: 1 }, { w: 400, h: 400 }, 0)).toEqual([a]);
    // zoomed out 10x: a 1000x800 viewport spans 10000x8000 canvas units
    expect(sorted(index.visible({ x: 0, y: 0, z: 0.1 }, { w: 1000, h: 800 }, 0))).toEqual(sorted([a, b]));
    // zoomed in 10x: 100x80 canvas units
    expect(index.visible({ x: 0, y: 0, z: 10 }, { w: 1000, h: 800 }, 0)).toEqual([b]);
    // margin is in screen px: 256 px at 10x is only 25.6 canvas units
    expect(index.visible({ x: 110, y: 0, z: 10 }, { w: 1000, h: 800 }, 0)).toEqual([]);
    expect(index.visible({ x: 110, y: 0, z: 10 }, { w: 1000, h: 800 }, 256)).toEqual([b]);
    expect(index.visible({ x: 130, y: 0, z: 10 }, { w: 1000, h: 800 }, 256)).toEqual([]);
  });

  it("destroy() unsubscribes from the doc", () => {
    const doc = new BoardDoc();
    const index = new SpatialIndex(doc);
    index.destroy();
    doc.create(box(0, 0, 10, 10));
    expect(index.search({ x: 0, y: 0, w: 5, h: 5 })).toEqual([]);
  });

  it("incremental updates stay equal to brute force under random edits", () => {
    const rand = rng(7);
    const doc = new BoardDoc();
    const ids = doc.createMany(Array.from({ length: 300 }, () => box(rand() * 2000, rand() * 2000, 10 + rand() * 100, 10 + rand() * 100)));
    const index = new SpatialIndex(doc);
    const live = new Set(ids);
    for (let step = 0; step < 300; step++) {
      const roll = rand();
      const pick = [...live][Math.floor(rand() * live.size)];
      if (roll < 0.6 && pick) doc.update(pick, { x: rand() * 2000, y: rand() * 2000, rotation: rand() * 6 - 3 });
      else if (roll < 0.8 && pick) {
        doc.remove([pick]);
        live.delete(pick);
      } else live.add(doc.create(box(rand() * 2000, rand() * 2000, 10 + rand() * 100, 10 + rand() * 100)));
      if (step % 25 === 0) {
        const r = { x: rand() * 2000, y: rand() * 2000, w: rand() * 800, h: rand() * 800 };
        expect(sorted(index.search(r))).toEqual(sorted(brute(doc, r)));
      }
    }
    const everything = { x: -1e6, y: -1e6, w: 2e6, h: 2e6 };
    expect(sorted(index.search(everything))).toEqual(sorted([...live]));
  });
});
