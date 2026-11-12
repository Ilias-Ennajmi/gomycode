// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { boundsOf } from "@/lib/engine/geometry/rect";
import { defaultsFor } from "@/lib/engine/model/defaults";
import type { CanvasObject, NewObject } from "@/lib/engine/model/types";
import { SelectionStore } from "@/lib/engine/input/selection-store";
import { SpatialIndex } from "@/lib/engine/spatial/spatial-index";
import { registry, type CommandCtx } from "@/lib/engine/commands/registry";
import "@/lib/engine/commands/commands";
import { runLayout, defaultColumns } from "@/lib/engine/commands/layout-commands";
import { bindShortcuts } from "@/lib/engine/commands/shortcuts";
import type { CanvasHandle } from "@/components/canvas/CanvasView";

const image = (id: string, x: number, y: number, w = 200, h = 150, extra: Partial<NewObject> = {}) =>
  ({ ...defaultsFor("image"), id, assetId: "a", x, y, w, h, ...extra }) as NewObject;
const sticky = (id: string, x: number, y: number, extra: Partial<NewObject> = {}) => ({ ...defaultsFor("sticky"), id, x, y, ...extra }) as NewObject;

function setup(objs: NewObject[], opts: { container?: HTMLElement } = {}) {
  const doc = new BoardDoc();
  doc.createMany(objs);
  doc.stopCapturing();
  const selection = new SelectionStore();
  const canvas = {
    doc,
    selection,
    index: new SpatialIndex(doc),
    getCamera: () => ({ x: 0, y: 0, z: 1 }),
    viewport: () => ({ w: 1000, h: 800 }),
    container: () => opts.container,
  } as unknown as CanvasHandle;
  const ctx: CommandCtx = { doc, selection, canvas, setTool: () => {}, toast: () => {}, clipboardStyle: { current: null } };
  const run = (id: string, c: CommandCtx = ctx) => registry.run(id, c);
  const get = (id: string) => doc.get(id) as CanvasObject;
  return { doc, selection, ctx, run, get };
}

const IDS = [
  "arrange.layout.grid",
  "arrange.layout.masonry",
  "arrange.layout.justified",
  "arrange.layout.pack",
  "arrange.layout.normaliseHeights",
  "arrange.layout.normaliseWidths",
  "arrange.layout.tidy",
];

const six = () => [
  image("i1", 0, 0, 200, 100),
  image("i2", 300, 40, 100, 200),
  sticky("s1", 50, 400),
  sticky("s2", 450, 380),
  image("i3", 700, 0, 160, 160),
  sticky("s3", 900, 500),
];

describe("layout commands: registration and availability", () => {
  it("registers every arrange.layout.* command in the arrange group", () => {
    for (const id of IDS) {
      expect(registry.has(id), id).toBe(true);
      expect(registry.get(id).group).toBe("arrange");
    }
  });
  it("is disabled with 0 or 1 objects and enabled with 2 or more", () => {
    const t = setup(six());
    for (const id of IDS) expect(registry.available(id, t.ctx)).toBe(false);
    t.selection.set(["i1"]);
    for (const id of IDS) expect(registry.available(id, t.ctx), id).toBe(false);
    t.selection.set(["i1", "i2"]);
    for (const id of IDS) expect(registry.available(id, t.ctx), id).toBe(true);
  });
  it("a locked object does not count; two locked objects disable it", () => {
    const t = setup([image("a", 0, 0, 100, 100, { locked: true }), image("b", 200, 0, 100, 100), image("c", 400, 0, 100, 100, { locked: true })]);
    t.selection.set(["a", "b", "c"]);
    expect(registry.available("arrange.layout.grid", t.ctx)).toBe(false);
  });
});

describe("layout commands: grid", () => {
  it("moves 6 mixed objects in one undo step and skips a locked image", () => {
    const objs = [...six(), image("lk", 1200, 0, 100, 100, { locked: true })];
    const t = setup(objs);
    t.selection.set(objs.map((o) => o.id!));
    const before = new Map(t.doc.all().map((o) => [o.id, boundsOf(o)]));
    expect(t.run("arrange.layout.grid")).toBe(true);
    expect(boundsOf(t.get("lk"))).toEqual(before.get("lk"));
    const moved = ["i1", "i2", "s1", "s2", "i3", "s3"].filter((id) => JSON.stringify(boundsOf(t.get(id))) !== JSON.stringify(before.get(id)));
    expect(moved.length).toBeGreaterThanOrEqual(4);
    // grid: 6 items -> ceil(sqrt(6)) = 3 columns, two rows
    expect(defaultColumns(6)).toBe(3);
    const xs = new Set(["i1", "i2", "s1", "s2", "i3", "s3"].map((id) => Math.round(boundsOf(t.get(id)).x)));
    expect(xs.size).toBe(3);
    t.doc.undo();
    for (const [id, b] of before) expect(boundsOf(t.get(id))).toEqual(b);
    expect(t.doc.canRedo()).toBe(true);
  });
  it("uses doc.meta.gutter between items", () => {
    const t = setup([image("a", 0, 0, 100, 100), image("b", 150, 0, 100, 100), image("c", 0, 200, 100, 100), image("d", 150, 200, 100, 100)]);
    t.doc.meta.gutter = 40;
    t.selection.set(["a", "b", "c", "d"]);
    runLayout(t.ctx, "grid", { columns: 2 });
    const a = boundsOf(t.get("a"));
    const b = boundsOf(t.get("b"));
    const c = boundsOf(t.get("c"));
    expect(b.x - (a.x + a.w)).toBeCloseTo(40);
    expect(c.y - (a.y + a.h)).toBeCloseTo(40);
  });
  it("keeps aspect ratios and applies the chosen column count", () => {
    const t = setup([image("a", 0, 0, 300, 100), image("b", 500, 0, 100, 300), image("c", 0, 500, 200, 200), image("d", 500, 500, 160, 90)]);
    t.selection.set(["a", "b", "c", "d"]);
    runLayout(t.ctx, "grid", { columns: 4 });
    const xs = new Set(["a", "b", "c", "d"].map((id) => Math.round(boundsOf(t.get(id)).x)));
    expect(xs.size).toBe(4);
    expect(t.get("a").w / t.get("a").h).toBeCloseTo(3);
    expect(t.get("b").w / t.get("b").h).toBeCloseTo(1 / 3);
  });
  it("handles a rotated object by its bounding box", () => {
    const t = setup([image("r", 0, 0, 100, 100, { rotation: Math.PI / 4 }), image("b", 400, 0, 100, 100), image("c", 800, 0, 100, 100), image("d", 1200, 0, 100, 100)]);
    t.selection.set(["r", "b", "c", "d"]);
    t.doc.meta.gutter = 10;
    runLayout(t.ctx, "grid", { columns: 2 });
    const r = boundsOf(t.get("r"));
    const b = boundsOf(t.get("b"));
    expect(t.get("r").rotation).toBeCloseTo(Math.PI / 4);
    expect(b.x - (r.x + r.w)).toBeCloseTo(10);
    expect(r.w).toBeCloseTo(b.w); // the cell width
  });
  it("a frame moves with its children and children keep their parent", () => {
    const frame = { ...defaultsFor("frame"), id: "f", x: 0, y: 0, w: 300, h: 200 } as NewObject;
    const kid = { ...defaultsFor("sticky"), id: "k", x: 20, y: 20, parentId: "f" } as NewObject;
    const t = setup([frame, kid, image("a", 600, 0, 200, 200), image("b", 900, 0, 200, 200)]);
    t.selection.set(["f", "a", "b"]);
    runLayout(t.ctx, "grid", { columns: 3 });
    const f = boundsOf(t.get("f"));
    const k = t.get("k");
    expect(k.parentId).toBe("f");
    // the child sits at the same relative place, scaled with the frame
    expect(k.x - f.x).toBeGreaterThanOrEqual(0);
    expect(k.x + k.w).toBeLessThanOrEqual(f.x + f.w + 1e-6);
  });
  it("arrows in the selection are not laid out", () => {
    const arrow = { ...defaultsFor("arrow"), id: "ar", x: 0, y: 0, w: 100, h: 100 } as NewObject;
    const t = setup([arrow, image("a", 300, 0), image("b", 600, 0)]);
    t.selection.set(["ar", "a", "b"]);
    const before = JSON.stringify(t.get("ar"));
    runLayout(t.ctx, "grid", { columns: 2 });
    expect(JSON.stringify(t.get("ar"))).toBe(before);
  });
});

describe("layout commands: the other layouts", () => {
  const sel = () => {
    const t = setup(six());
    t.selection.set(["i1", "i2", "s1", "s2", "i3", "s3"]);
    return t;
  };
  it("masonry, justified, pack and tidy each run as one undo step and keep every object finite", () => {
    for (const id of ["arrange.layout.masonry", "arrange.layout.justified", "arrange.layout.pack", "arrange.layout.tidy"]) {
      const t = sel();
      const depth = t.doc.undoManager.undoStack.length;
      expect(t.run(id)).toBe(true);
      expect(t.doc.undoManager.undoStack.length).toBe(depth + 1);
      for (const o of t.doc.all()) expect([o.x, o.y, o.w, o.h].every(Number.isFinite)).toBe(true);
      t.doc.undo();
      expect(boundsOf(t.get("i1"))).toEqual({ x: 0, y: 0, w: 200, h: 100 });
    }
  });
  it("normalise heights makes all heights equal (aspect kept); widths makes all widths equal", () => {
    const t = sel();
    t.run("arrange.layout.normaliseHeights");
    const hs = ["i1", "i2", "s1", "s2", "i3", "s3"].map((id) => t.get(id).h);
    for (const h of hs) expect(h).toBeCloseTo(hs[0]);
    expect(t.get("i2").w / t.get("i2").h).toBeCloseTo(100 / 200);
    t.run("arrange.layout.normaliseWidths");
    const ws = ["i1", "i2", "s1", "s2", "i3", "s3"].map((id) => t.get(id).w);
    for (const w of ws) expect(w).toBeCloseTo(ws[0]);
  });
  it("pack does not resize anything", () => {
    const t = sel();
    t.run("arrange.layout.pack");
    expect([t.get("i1").w, t.get("i1").h]).toEqual([200, 100]);
    expect([t.get("s1").w, t.get("s1").h]).toEqual([200, 200]);
  });
  it("tidy keeps sizes", () => {
    const t = sel();
    t.run("arrange.layout.tidy");
    expect([t.get("i2").w, t.get("i2").h]).toEqual([100, 200]);
  });
});

describe("layout commands: animation", () => {
  it("a pointer-triggered layout marks the canvas for a short position transition; a keyboard one does not", () => {
    const el = document.createElement("div");
    const t = setup(six(), { container: el });
    t.selection.set(["i1", "i2", "s1"]);
    t.run("arrange.layout.grid", { ...t.ctx, animate: false });
    expect(el.hasAttribute("data-layout-animate")).toBe(false);
    t.run("arrange.layout.grid", { ...t.ctx, animate: true });
    expect(el.getAttribute("data-layout-animate")).toBe("true");
  });
  it("commands bound to no key never run from the keyboard path with animate", () => {
    const el = document.createElement("div");
    const t = setup(six(), { container: el });
    t.selection.set(["i1", "i2", "s1"]);
    const off = bindShortcuts(document.body, () => ({ ...t.ctx, animate: true }));
    off();
    expect(registry.get("arrange.layout.grid").shortcut).toBeUndefined();
  });
});
