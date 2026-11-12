// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { defaultsFor } from "@/lib/engine/model/defaults";
import type { ArrowObj, CanvasObject, NewObject, ShapeObj } from "@/lib/engine/model/types";
import { SelectionStore } from "@/lib/engine/input/selection-store";
import { SpatialIndex } from "@/lib/engine/spatial/spatial-index";
import { registry, type CommandCtx, type ToastOptions } from "@/lib/engine/commands/registry";
import "@/lib/engine/commands/commands";
import { bindShortcuts, formatShortcut, matchShortcut } from "@/lib/engine/commands/shortcuts";
import type { CanvasHandle } from "@/components/canvas/CanvasView";
import type { ToolId } from "@/lib/engine/input/tool-machine";

const shape = (id: string, x: number, y: number, w = 100, h = 80, extra: Partial<NewObject> = {}) =>
  ({ ...defaultsFor("shape"), id, x, y, w, h, ...extra }) as NewObject;
const sticky = (id: string, x: number, y: number, extra: Partial<NewObject> = {}) =>
  ({ ...defaultsFor("sticky"), id, x, y, ...extra }) as NewObject;
const image = (id: string, x: number, y: number, w = 200, h = 100, extra: Partial<NewObject> = {}) =>
  ({ ...defaultsFor("image"), id, assetId: "a", x, y, w, h, ...extra }) as NewObject;
const frame = (id: string, x: number, y: number, w: number, h: number, extra: Partial<NewObject> = {}) =>
  ({ ...defaultsFor("frame"), id, x, y, w, h, ...extra }) as NewObject;

function setup(objs: NewObject[] = []) {
  const doc = new BoardDoc();
  doc.createMany(objs);
  doc.stopCapturing();
  const selection = new SelectionStore();
  const toasts: ToastOptions[] = [];
  const setTool = vi.fn<(id: ToolId) => void>();
  const setCamera = vi.fn();
  let camera = { x: 0, y: 0, z: 1 };
  const canvas = {
    doc,
    selection,
    index: new SpatialIndex(doc),
    getCamera: () => camera,
    setCamera: (c: typeof camera, o?: unknown) => {
      camera = c;
      setCamera(c, o);
    },
    viewport: () => ({ w: 1000, h: 800 }),
    settings: () => ({ wheel: "zoom", sensitivity: 1, locked: false, snap: true, penOnlyDraws: false }),
  } as unknown as CanvasHandle;
  const ui = { togglePalette: vi.fn(), openFind: vi.fn(), pickImages: vi.fn(), toggleSnap: vi.fn() };
  const ctx: CommandCtx = {
    doc,
    selection,
    canvas,
    setTool,
    toast: (o) => {
      toasts.push(o);
    },
    clipboardStyle: { current: null },
    ui,
  };
  const run = (id: string) => registry.run(id, ctx);
  const get = (id: string) => doc.get(id) as CanvasObject;
  const ids = () => doc.all().map((o) => o.id);
  return { doc, selection, ctx, run, get, ids, toasts, setTool, setCamera, ui };
}

afterEach(() => vi.restoreAllMocks());

describe("registry", () => {
  it("contains every command id of the plan", () => {
    const want = [
      "edit.undo", "edit.redo", "edit.selectAll", "edit.duplicate", "edit.delete", "edit.copyStyle", "edit.pasteStyle",
      "edit.copy", "edit.cut", "edit.paste",
      "arrange.group", "arrange.ungroup", "arrange.lock", "arrange.forward", "arrange.backward", "arrange.front",
      "arrange.back", "arrange.align.left", "arrange.align.hcenter", "arrange.align.right", "arrange.align.top",
      "arrange.align.vcenter", "arrange.align.bottom", "arrange.distribute.x", "arrange.distribute.y",
      "arrange.flipH", "arrange.flipV",
      "view.zoomFit", "view.zoomSelection", "view.zoomIn", "view.zoomOut", "view.zoom100", "view.toggleSnap",
      "view.toggleTheme", "view.find", "view.palette",
    ];
    for (const id of want) expect(registry.get(id).id, id).toBe(id);
    expect(registry.all().length).toBeGreaterThanOrEqual(want.length);
  });

  it("get throws for unknown ids; run reports whether a command ran", () => {
    expect(() => registry.get("nope")).toThrow();
    const t = setup();
    expect(t.run("nope")).toBe(false);
    expect(t.run("edit.delete")).toBe(false); // nothing selected: `when` blocks it
  });

  it("assigns the documented shortcuts", () => {
    const sc = (id: string) => registry.get(id).shortcut;
    expect(sc("edit.undo")).toBe("Mod+Z");
    expect(sc("edit.redo")).toBe("Mod+Shift+Z");
    expect(sc("edit.duplicate")).toBe("Mod+D");
    expect(sc("arrange.group")).toBe("Mod+G");
    expect(sc("arrange.ungroup")).toBe("Mod+Shift+G");
    expect(sc("arrange.lock")).toBe("Mod+Shift+L");
    expect(sc("arrange.front")).toBe("Mod+Alt+]");
    expect(sc("view.zoomFit")).toBe("Shift+1");
    expect(sc("view.palette")).toBe("Mod+K");
    expect(sc("edit.copyStyle")).toBe("Mod+Alt+C");
  });
});

describe("edit commands", () => {
  it("undo and redo walk the doc history", () => {
    const t = setup([shape("a", 0, 0)]);
    t.doc.update("a", { x: 50 });
    t.doc.stopCapturing();
    t.run("edit.undo");
    expect(t.get("a").x).toBe(0);
    t.run("edit.redo");
    expect(t.get("a").x).toBe(50);
  });

  it("selectAll selects top-level, unlocked objects (not group members or locked ones)", () => {
    const t = setup([shape("a", 0, 0), shape("b", 200, 0), shape("c", 400, 0, 50, 50, { locked: true })]);
    t.selection.set(["a", "b"]);
    t.run("arrange.group");
    t.selection.clear();
    t.run("edit.selectAll");
    expect(t.selection.size).toBe(1); // the group; its members are not selected on their own
    expect(t.selection.has("c")).toBe(false);
  });

  it("duplicate offsets copies by 16 px, selects them and is one undo step", () => {
    const t = setup([shape("a", 10, 20), shape("b", 300, 20)]);
    t.selection.set(["a"]);
    t.run("edit.duplicate");
    expect(t.ids()).toHaveLength(3);
    const copy = [...t.selection.ids][0];
    expect(copy).not.toBe("a");
    expect(t.get(copy).x).toBeCloseTo(26);
    expect(t.get(copy).y).toBeCloseTo(36);
    expect(t.get("a").x).toBe(10);
    t.run("edit.undo");
    expect(t.ids()).toHaveLength(2);
  });

  it("duplicate keeps a frame's children with the copy and arrows bound inside the copy", () => {
    const t = setup([
      frame("f", 0, 0, 400, 300),
      shape("s", 20, 20, 50, 50, { parentId: "f" }),
      shape("s2", 120, 20, 50, 50, { parentId: "f" }),
      {
        ...defaultsFor("arrow"),
        id: "ar",
        parentId: "f",
        start: { kind: "bound", id: "s", anchor: { x: 1, y: 0.5 } },
        end: { kind: "bound", id: "s2", anchor: { x: 0, y: 0.5 } },
      } as NewObject,
    ]);
    t.selection.set(["f"]);
    t.run("edit.duplicate");
    expect(t.ids()).toHaveLength(8);
    const f2 = [...t.selection.ids][0];
    expect(t.doc.childrenOf(f2)).toHaveLength(3);
    const arrow = t.doc.childrenOf(f2).find((o) => o.type === "arrow") as ArrowObj;
    const kids = new Set(t.doc.childrenOf(f2).map((o) => o.id));
    expect(arrow.start.kind === "bound" && kids.has(arrow.start.id)).toBe(true);
    expect(arrow.end.kind === "bound" && kids.has(arrow.end.id)).toBe(true);
    const frames = t.doc.all().filter((o) => o.type === "frame") as Extract<CanvasObject, { type: "frame" }>[];
    expect(new Set(frames.map((f) => f.order)).size).toBe(2);
  });

  it("delete removes the selection, shows 'Deleted N objects' and the toast action restores them", () => {
    const t = setup([shape("a", 0, 0), shape("b", 200, 0), shape("c", 400, 0)]);
    t.selection.set(["a", "b"]);
    t.run("edit.delete");
    expect(t.ids()).toEqual(["c"]);
    expect(t.selection.size).toBe(0);
    expect(t.toasts).toHaveLength(1);
    expect(t.toasts[0].message).toBe("Deleted 2 objects");
    expect(t.toasts[0].action?.label).toBe("Undo");
    t.toasts[0].action!.run();
    expect(t.ids().sort()).toEqual(["a", "b", "c"]);
  });

  it("delete says 'Deleted 1 object' and a frame counts once, taking its children along", () => {
    const t = setup([frame("f", 0, 0, 300, 300), shape("s", 10, 10, 50, 50, { parentId: "f" })]);
    t.selection.set(["f", "s"]);
    t.run("edit.delete");
    expect(t.ids()).toEqual([]);
    expect(t.toasts[0].message).toBe("Deleted 1 object");
  });

  it("the delete toast's Undo still restores when other edits happened since", () => {
    const t = setup([shape("a", 0, 0), shape("b", 200, 0)]);
    t.selection.set(["a"]);
    t.run("edit.delete");
    t.doc.update("b", { x: 999 });
    t.doc.stopCapturing();
    t.toasts[0].action!.run();
    expect(t.ids()).toHaveLength(2);
    expect(t.get("b").x).toBe(999); // the later edit is not undone
  });

  it("delete refuses locked objects", () => {
    const t = setup([shape("a", 0, 0, 50, 50, { locked: true })]);
    t.selection.set(["a"]);
    t.run("edit.delete");
    expect(t.ids()).toEqual(["a"]);
    expect(t.toasts[0].message).toMatch(/locked/i);
  });
});

describe("paste style", () => {
  it("copies stroke, fill, strokeWidth, strokeStyle, opacity and cornerRadius between shapes", () => {
    const t = setup([
      shape("a", 0, 0, 100, 80, { fill: "var(--sticky-blue)", stroke: "var(--color-accent)", strokeWidth: 6, strokeStyle: "dashed", opacity: 0.5, cornerRadius: 12 }),
      shape("b", 300, 0),
    ]);
    t.selection.set(["a"]);
    t.run("edit.copyStyle");
    expect(t.ctx.clipboardStyle.current).not.toBeNull();
    t.selection.set(["b"]);
    t.run("edit.pasteStyle");
    const b = t.get("b") as ShapeObj;
    expect(b).toMatchObject({ fill: "var(--sticky-blue)", stroke: "var(--color-accent)", strokeWidth: 6, strokeStyle: "dashed", opacity: 0.5, cornerRadius: 12 });
    expect(b.x).toBe(300);
    expect(b.w).toBe(100);
  });

  it("copies crop ratio and opacity between images", () => {
    const t = setup([
      image("a", 0, 0, 200, 100, { crop: { x: 0.25, y: 0, w: 0.5, h: 1 }, opacity: 0.4 }), // shown ratio 2:1
      image("b", 400, 0, 300, 300), // square, uncropped
    ]);
    t.selection.set(["a"]);
    t.run("edit.copyStyle");
    t.selection.set(["b"]);
    t.run("edit.pasteStyle");
    const b = t.get("b") as Extract<CanvasObject, { type: "image" }>;
    expect(b.opacity).toBe(0.4);
    expect(b.crop).not.toBeNull();
    // displayed ratio of the cropped image equals the source's 2:1, and the intrinsic (1:1) picture is not stretched
    expect(b.w / b.h).toBeCloseTo(2);
    const intrinsic = (b.w / b.crop!.w) / (b.h / b.crop!.h);
    expect(intrinsic).toBeCloseTo(1);
    expect(b.w).toBe(300);
  });

  it("pasting an uncropped image style clears the crop; cross-type paste carries opacity only", () => {
    const t = setup([
      image("a", 0, 0, 200, 100, { opacity: 0.7 }),
      image("b", 400, 0, 200, 100, { crop: { x: 0, y: 0, w: 0.5, h: 1 } }),
      sticky("s", 0, 300),
    ]);
    t.selection.set(["a"]);
    t.run("edit.copyStyle");
    t.selection.set(["b", "s"]);
    t.run("edit.pasteStyle");
    expect((t.get("b") as Extract<CanvasObject, { type: "image" }>).crop).toBeNull();
    expect(t.get("s").opacity).toBe(0.7);
    expect((t.get("s") as Extract<CanvasObject, { type: "sticky" }>).fill).toBe("yellow");
  });

  it("pasteStyle does nothing without a copied style", () => {
    const t = setup([shape("a", 0, 0)]);
    t.selection.set(["a"]);
    expect(t.run("edit.pasteStyle")).toBe(false);
  });
});

describe("arrange: group and lock", () => {
  it("group wraps the selection, keeps world positions and selects the group; ungroup restores", () => {
    const t = setup([shape("a", 10, 10, 50, 50), shape("b", 200, 100, 60, 60), shape("c", 500, 500)]);
    t.selection.set(["a", "b"]);
    t.run("arrange.group");
    const g = [...t.selection.ids][0];
    const group = t.get(g);
    expect(group.type).toBe("group");
    expect(t.get("a")).toMatchObject({ x: 10, y: 10, parentId: g });
    expect(t.get("b")).toMatchObject({ x: 200, y: 100, parentId: g });
    expect(group).toMatchObject({ x: 10, y: 10, w: 250, h: 150, parentId: null });
    expect(t.get("c").parentId).toBeNull();

    t.run("arrange.ungroup");
    expect(t.doc.get(g)).toBeUndefined();
    expect(t.get("a")).toMatchObject({ x: 10, y: 10, parentId: null });
    expect(t.get("b")).toMatchObject({ x: 200, y: 100, parentId: null });
    expect([...t.selection.ids].sort()).toEqual(["a", "b"]);
  });

  it("ungroup keeps the members' z-order and slot among other objects", () => {
    const t = setup([shape("a", 0, 0), shape("b", 100, 0), shape("c", 200, 0), shape("d", 300, 0)]);
    t.selection.set(["b", "c"]);
    t.run("arrange.group");
    t.run("arrange.ungroup");
    expect(t.ids()).toEqual(["a", "b", "c", "d"]);
  });

  it("group is one undo step and needs at least two objects", () => {
    const t = setup([shape("a", 0, 0), shape("b", 100, 0)]);
    t.selection.set(["a"]);
    expect(t.run("arrange.group")).toBe(false);
    t.selection.set(["a", "b"]);
    t.run("arrange.group");
    t.run("edit.undo");
    expect(t.ids().sort()).toEqual(["a", "b"]);
    expect(t.get("a").parentId).toBeNull();
  });

  it("lock locks everything selected, and unlocks when all are already locked", () => {
    const t = setup([shape("a", 0, 0), shape("b", 100, 0, 50, 50, { locked: true })]);
    t.selection.set(["a", "b"]);
    t.run("arrange.lock");
    expect(t.get("a").locked && t.get("b").locked).toBe(true);
    t.run("arrange.lock");
    expect(t.get("a").locked || t.get("b").locked).toBe(false);
  });
});

describe("arrange: z-order", () => {
  const order = (t: ReturnType<typeof setup>) => t.ids();
  const four = () => setup([shape("a", 0, 0), shape("b", 100, 0), shape("c", 200, 0), shape("d", 300, 0)]);

  it("forward / backward move one step", () => {
    const t = four();
    t.selection.set(["a"]);
    t.run("arrange.forward");
    expect(order(t)).toEqual(["b", "a", "c", "d"]);
    t.selection.set(["d"]);
    t.run("arrange.backward");
    expect(order(t)).toEqual(["b", "a", "d", "c"]);
  });

  it("front / back send to the ends, keeping the selection's own order", () => {
    const t = four();
    t.selection.set(["b", "a"]);
    t.run("arrange.front");
    expect(order(t)).toEqual(["c", "d", "a", "b"]);
    t.selection.set(["d", "b"]);
    t.run("arrange.back");
    expect(order(t)).toEqual(["d", "b", "c", "a"]);
  });

  it("a multi-selection moves forward as a block and stops at the top", () => {
    const t = four();
    t.selection.set(["a", "b"]);
    t.run("arrange.forward");
    expect(order(t)).toEqual(["c", "a", "b", "d"]);
    t.selection.set(["d"]);
    t.run("arrange.forward");
    expect(order(t)).toEqual(["c", "a", "b", "d"]);
  });

  it("only reorders among siblings and is one undo step", () => {
    const t = setup([frame("f", 0, 0, 500, 500), shape("a", 0, 0, 10, 10, { parentId: "f" }), shape("b", 20, 0, 10, 10, { parentId: "f" }), shape("c", 700, 0)]);
    t.selection.set(["a"]);
    t.run("arrange.front");
    expect(t.doc.childrenOf("f").map((o) => o.id)).toEqual(["b", "a"]);
    expect(t.doc.childrenOf(null).map((o) => o.id)).toEqual(["f", "c"]);
    t.run("edit.undo");
    expect(t.doc.childrenOf("f").map((o) => o.id)).toEqual(["a", "b"]);
  });
});

describe("arrange: align, distribute, flip", () => {
  it("align.left moves every object to the left edge of the selection", () => {
    const t = setup([shape("a", 100, 0), shape("b", 300, 200, 50, 50), shape("c", 20, 400)]);
    t.selection.set(["a", "b", "c"]);
    t.run("arrange.align.left");
    expect(["a", "b", "c"].map((id) => t.get(id).x)).toEqual([20, 20, 20]);
    expect(t.get("b").y).toBe(200);
    t.run("edit.undo");
    expect(t.get("a").x).toBe(100);
  });

  it("align needs two objects; all six modes exist and work", () => {
    const t = setup([shape("a", 0, 0, 100, 100), shape("b", 300, 300, 50, 50)]);
    t.selection.set(["a"]);
    expect(t.run("arrange.align.left")).toBe(false);
    t.selection.set(["a", "b"]);
    t.run("arrange.align.hcenter");
    expect(t.get("b").x + 25).toBeCloseTo(t.get("a").x + 50);
    t.run("arrange.align.bottom");
    expect(t.get("a").y + 100).toBe(t.get("b").y + 50);
    t.run("arrange.align.top");
    expect(t.get("a").y).toBe(t.get("b").y);
    t.run("arrange.align.vcenter");
    t.run("arrange.align.right");
    t.run("arrange.align.left");
    expect(t.get("a").x).toBe(t.get("b").x);
  });

  it("align moves a group's members, and arrows bound to moved objects keep following", () => {
    const t = setup([
      shape("a", 0, 0, 100, 100),
      shape("b", 300, 300, 50, 50),
      {
        ...defaultsFor("arrow"),
        id: "ar",
        start: { kind: "bound", id: "b", anchor: { x: 0.5, y: 0.5 } },
        end: { kind: "point", x: 600, y: 600 },
      } as NewObject,
    ]);
    t.selection.set(["a", "b"]);
    t.run("arrange.align.top");
    const ar = t.get("ar") as ArrowObj;
    expect(ar.start.kind).toBe("bound");
    expect(ar.y).toBeLessThan(100); // bounds refreshed to the moved target (was 300 before the align)
  });

  it("distribute spaces three objects evenly along x and y", () => {
    const t = setup([shape("a", 0, 0, 10, 10), shape("b", 20, 100, 30, 10), shape("c", 100, 300, 20, 10)]);
    t.selection.set(["a", "b", "c"]);
    t.run("arrange.distribute.x");
    expect(t.get("b").x).toBe(40);
    t.run("arrange.distribute.y");
    expect([t.get("a").y, t.get("b").y, t.get("c").y]).toEqual([0, 150, 300]);
    const gapA = t.get("b").y - (t.get("a").y + 10);
    const gapB = t.get("c").y - (t.get("b").y + 10);
    expect(gapA).toBeCloseTo(gapB);
    expect(t.run("arrange.distribute.x")).toBe(true);
    t.selection.set(["a", "b"]);
    expect(t.run("arrange.distribute.x")).toBe(false);
  });

  it("flipH mirrors positions about the selection centre, negates rotation and toggles an image's flipX", () => {
    const t = setup([image("i", 0, 0, 100, 100), shape("s", 300, 0, 100, 100), shape("r", 150, 300, 50, 50, { rotation: 0.5 })]);
    t.selection.set(["i", "s", "r"]);
    t.run("arrange.flipH");
    expect(t.get("i").x).toBe(300);
    expect(t.get("s").x).toBe(0);
    expect(t.get("r").x).toBeCloseTo(200);
    expect(t.get("r").rotation).toBeCloseTo(-0.5);
    expect((t.get("i") as Extract<CanvasObject, { type: "image" }>).flipX).toBe(true);
    t.run("arrange.flipH");
    expect(t.get("i").x).toBe(0);
    expect((t.get("i") as Extract<CanvasObject, { type: "image" }>).flipX).toBe(false);
    expect(t.get("r").rotation).toBeCloseTo(0.5);
  });

  it("flipV toggles an image's flipY in place and is one undo step", () => {
    const t = setup([image("i", 0, 0, 100, 100)]);
    t.selection.set(["i"]);
    t.run("arrange.flipV");
    expect((t.get("i") as Extract<CanvasObject, { type: "image" }>).flipY).toBe(true);
    expect(t.get("i").y).toBe(0);
    t.run("edit.undo");
    expect((t.get("i") as Extract<CanvasObject, { type: "image" }>).flipY).toBe(false);
  });

  it("flip of a single image just toggles; a bound arrow stays bound with its anchor mirrored", () => {
    const t = setup([
      shape("a", 0, 0, 100, 100),
      shape("b", 300, 0, 100, 100),
      {
        ...defaultsFor("arrow"),
        id: "ar",
        start: { kind: "bound", id: "a", anchor: { x: 1, y: 0.5 } },
        end: { kind: "bound", id: "b", anchor: { x: 0, y: 0.5 } },
      } as NewObject,
    ]);
    t.selection.set(["a", "b", "ar"]);
    t.run("arrange.flipH");
    const ar = t.get("ar") as ArrowObj;
    expect(ar.start).toMatchObject({ kind: "bound", id: "a", anchor: { x: 0, y: 0.5 } });
    expect(ar.end).toMatchObject({ kind: "bound", id: "b", anchor: { x: 1, y: 0.5 } });
    expect(t.get("a").x).toBe(300);
  });
});

describe("view commands", () => {
  it("zoomFit, zoomSelection, zoomIn/Out and zoom100 set the camera without animating", () => {
    const t = setup([shape("a", 0, 0, 100, 100), shape("b", 2000, 2000, 100, 100)]);
    t.run("view.zoomFit");
    expect(t.setCamera).toHaveBeenCalledTimes(1);
    expect(t.setCamera.mock.calls[0][1]).toEqual({ animate: false });
    expect(t.setCamera.mock.calls[0][0].z).toBeLessThan(1);
    t.selection.set(["a"]);
    t.run("view.zoomSelection");
    expect(t.setCamera.mock.calls[1][0].z).toBeGreaterThan(1);
    const z0 = t.ctx.canvas.getCamera().z;
    t.run("view.zoomIn");
    expect(t.ctx.canvas.getCamera().z).toBeGreaterThan(z0);
    t.run("view.zoomOut");
    expect(t.ctx.canvas.getCamera().z).toBeCloseTo(z0);
    t.run("view.zoom100");
    expect(t.ctx.canvas.getCamera().z).toBeCloseTo(1);
    expect(t.run("view.zoomSelection")).toBe(true);
    t.selection.clear();
    expect(t.run("view.zoomSelection")).toBe(false);
  });

  it("animates only when the caller asks (menu clicks)", () => {
    const t = setup([shape("a", 0, 0)]);
    registry.run("view.zoomFit", { ...t.ctx, animate: true });
    expect(t.setCamera.mock.calls[0][1]).toEqual({ animate: true });
  });

  it("palette, find and snap go through the ui hooks; toggleTheme flips data-theme", () => {
    const t = setup();
    t.run("view.palette");
    t.run("view.find");
    t.run("view.toggleSnap");
    expect(t.ui.togglePalette).toHaveBeenCalled();
    expect(t.ui.openFind).toHaveBeenCalled();
    expect(t.ui.toggleSnap).toHaveBeenCalled();
    document.documentElement.dataset.theme = "light";
    t.run("view.toggleTheme");
    expect(document.documentElement.dataset.theme).toBe("dark");
    t.run("view.toggleTheme");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("tool commands switch tools; the image command opens the picker", () => {
    const t = setup();
    const map: Record<string, ToolId> = {
      "tool.select": "select", "tool.hand": "hand", "tool.sticky": "sticky", "tool.text": "text", "tool.shape": "shape",
      "tool.arrow": "arrow", "tool.pen": "pen", "tool.eraser": "eraser", "tool.frame": "frame",
    };
    for (const [id, tool] of Object.entries(map)) {
      t.run(id);
      expect(t.setTool).toHaveBeenLastCalledWith(tool);
    }
    const keys = Object.keys(map).map((id) => registry.get(id).shortcut);
    expect(keys).toEqual(["V", "H", "N", "T", "S", "L", "P", "E", "F"]);
    t.run("tool.image");
    expect(registry.get("tool.image").shortcut).toBe("I");
    expect(t.ui.pickImages).toHaveBeenCalled();
  });
});

describe("shortcuts", () => {
  const key = (init: KeyboardEventInit & { key: string }) => new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });

  it("matchShortcut understands Mod, Shift, Alt and symbol keys", () => {
    expect(matchShortcut(key({ key: "d", ctrlKey: true }), "Mod+D")).toBe(true);
    expect(matchShortcut(key({ key: "d", metaKey: true }), "Mod+D")).toBe(true);
    expect(matchShortcut(key({ key: "d" }), "Mod+D")).toBe(false);
    expect(matchShortcut(key({ key: "d", ctrlKey: true, shiftKey: true }), "Mod+D")).toBe(false);
    expect(matchShortcut(key({ key: "Z", ctrlKey: true, shiftKey: true }), "Mod+Shift+Z")).toBe(true);
    expect(matchShortcut(key({ key: "ç", code: "KeyC", ctrlKey: true, altKey: true }), "Mod+Alt+C")).toBe(true);
    expect(matchShortcut(key({ key: "]", code: "BracketRight", ctrlKey: true }), "Mod+]")).toBe(true);
    expect(matchShortcut(key({ key: "!", code: "Digit1", shiftKey: true }), "Shift+1")).toBe(true);
    expect(matchShortcut(key({ key: "v" }), "V")).toBe(true);
    expect(matchShortcut(key({ key: "V", shiftKey: true }), "V")).toBe(false);
    expect(matchShortcut(key({ key: "Backspace" }), "Backspace")).toBe(true);
  });

  it("formats shortcuts for display", () => {
    expect(formatShortcut("Mod+Shift+Z", false)).toBe("Ctrl+Shift+Z");
    expect(formatShortcut("Mod+Alt+C", true)).toBe("⌘⌥C");
    expect(formatShortcut("V", false)).toBe("V");
  });

  it("bindShortcuts runs commands, ignores typing in inputs and contenteditable, and never animates", () => {
    const t = setup([shape("a", 0, 0), shape("b", 1000, 1000)]);
    const root = document.createElement("div");
    const input = document.createElement("input");
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    Object.defineProperty(editable, "isContentEditable", { value: true });
    root.append(input, editable);
    document.body.append(root);
    const off = bindShortcuts(root, () => t.ctx);

    const a = key({ key: "a", ctrlKey: true });
    root.dispatchEvent(a);
    expect(a.defaultPrevented).toBe(true);
    expect(t.selection.size).toBe(2);

    t.selection.clear();
    const typed = key({ key: "a", ctrlKey: true });
    input.dispatchEvent(typed);
    expect(t.selection.size).toBe(0);
    expect(typed.defaultPrevented).toBe(false);
    editable.dispatchEvent(key({ key: "v" }));
    input.dispatchEvent(key({ key: "h" }));
    expect(t.setTool).not.toHaveBeenCalled();

    root.dispatchEvent(key({ key: "!", code: "Digit1", shiftKey: true }));
    expect(t.setCamera).toHaveBeenCalledWith(expect.anything(), { animate: false });
    root.dispatchEvent(key({ key: "h" }));
    expect(t.setTool).toHaveBeenLastCalledWith("hand");

    t.selection.set(["a"]);
    root.dispatchEvent(key({ key: "Delete" }));
    expect(t.doc.get("a")).toBeUndefined();
    t.selection.set(["b"]);
    root.dispatchEvent(key({ key: "Backspace" }));
    expect(t.doc.get("b")).toBeUndefined();

    off();
    t.setTool.mockClear();
    root.dispatchEvent(key({ key: "h" }));
    expect(t.setTool).not.toHaveBeenCalled();
    root.remove();
  });

  it("lets the palette and find open from a plain input, but not from rich text", () => {
    const t = setup([shape("a", 0, 0)]);
    const root = document.createElement("div");
    const input = document.createElement("input");
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    Object.defineProperty(editable, "isContentEditable", { value: true });
    root.append(input, editable);
    document.body.append(root);
    const off = bindShortcuts(root, () => t.ctx);
    const k = key({ key: "k", ctrlKey: true });
    input.dispatchEvent(k);
    expect(k.defaultPrevented).toBe(true);
    expect(t.ui.togglePalette).toHaveBeenCalledTimes(1);
    input.dispatchEvent(key({ key: "f", ctrlKey: true }));
    expect(t.ui.openFind).toHaveBeenCalledTimes(1);
    editable.dispatchEvent(key({ key: "k", ctrlKey: true }));
    expect(t.ui.togglePalette).toHaveBeenCalledTimes(1); // Mod+K is "link" inside the editor
    input.dispatchEvent(key({ key: "a", ctrlKey: true }));
    expect(t.selection.size).toBe(0);
    off();
    root.remove();
  });

  it("does not run native clipboard commands from keydown, and skips events that were already handled", () => {
    const t = setup([shape("a", 0, 0)]);
    const root = document.createElement("div");
    document.body.append(root);
    const run = vi.spyOn(registry, "run");
    const off = bindShortcuts(root, () => t.ctx);
    const copy = key({ key: "c", ctrlKey: true });
    root.dispatchEvent(copy);
    expect(copy.defaultPrevented).toBe(false); // the browser's copy event must still fire
    expect(run).not.toHaveBeenCalled();
    const handled = key({ key: "h" });
    root.addEventListener("keydown", (e) => e.preventDefault(), { capture: true });
    root.dispatchEvent(handled);
    expect(run).not.toHaveBeenCalled();
    off();
    root.remove();
  });

  it("redo has an alternative shortcut (Mod+Y)", () => {
    const t = setup([shape("a", 0, 0)]);
    const root = document.createElement("div");
    document.body.append(root);
    const off = bindShortcuts(root, () => t.ctx);
    t.doc.update("a", { x: 10 });
    t.doc.stopCapturing();
    t.doc.undo();
    root.dispatchEvent(key({ key: "y", ctrlKey: true }));
    expect(t.get("a").x).toBe(10);
    off();
    root.remove();
  });
});
