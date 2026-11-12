// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { arrowPath } from "@/lib/engine/geometry/arrow-path";
import type { Camera } from "@/lib/engine/geometry/camera";
import { boundsOf } from "@/lib/engine/geometry/rect";
import { defaultsFor, framePresetPx } from "@/lib/engine/model/defaults";
import type { ArrowObj, CanvasObject, NewObject, StickyObj, StrokeObj, TextObj } from "@/lib/engine/model/types";
import { EditingStore } from "@/lib/engine/input/editing-store";
import {
  OverlayStore,
  SelectionStore,
  ToolMachine,
  createToolMachine,
  type CanvasPointer,
  type Tool,
  type ToolCtx,
} from "@/lib/engine/input/tool-machine";
import { createAllTools } from "@/lib/engine/input/tools";
import { createArrowTool } from "@/lib/engine/input/tools/arrow";
import { createEraserTool } from "@/lib/engine/input/tools/eraser";
import { createFrameTool } from "@/lib/engine/input/tools/frame";
import { createPenTool } from "@/lib/engine/input/tools/pen";
import { createShapeTool } from "@/lib/engine/input/tools/shape";
import { createStickyTool } from "@/lib/engine/input/tools/sticky";
import { createTextTool } from "@/lib/engine/input/tools/text";
import { SpatialIndex } from "@/lib/engine/spatial/spatial-index";
import { DEFAULT_NAV_SETTINGS, type NavSettings } from "@/lib/settings";

type Mods = Partial<Pick<CanvasPointer, "shiftKey" | "altKey" | "metaKey" | "ctrlKey" | "pointerType" | "pressure">>;

function setup(objs: NewObject[] = [], opts: { camera?: Camera; settings?: Partial<NavSettings> } = {}) {
  const doc = new BoardDoc();
  if (objs.length) doc.createMany(objs);
  doc.stopCapturing();
  const index = new SpatialIndex(doc);
  const selection = new SelectionStore();
  const overlays = new OverlayStore();
  const camera: Camera = opts.camera ?? { x: 0, y: 0, z: 1 };
  const finishTool = vi.fn();
  const ctx: ToolCtx = {
    doc,
    index,
    camera: () => camera,
    selection,
    settings: { ...DEFAULT_NAV_SETTINGS, ...opts.settings },
    setTool: vi.fn(),
    overlays,
    viewport: () => ({ w: 1000, h: 800 }),
    editing: new EditingStore(doc),
    finishTool,
  };
  let t = 1000;
  const P = (x: number, y: number, mods: Mods = {}, buttons = 1): CanvasPointer => ({
    point: { x, y },
    screen: { x: (x - camera.x) * camera.z, y: (y - camera.y) * camera.z },
    pointerId: 1,
    pointerType: "mouse",
    pressure: 0.5,
    button: 0,
    buttons,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    ctrlKey: false,
    timeStamp: (t += 100),
    ...mods,
  });
  const drag = (tool: Tool, from: [number, number], to: [number, number], mods: Mods = {}, steps = 6) => {
    tool.onDown(ctx, P(from[0], from[1], mods));
    for (let i = 1; i <= steps; i++) {
      tool.onMove(ctx, P(from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps, mods));
    }
    tool.onUp(ctx, P(to[0], to[1], mods, 0));
  };
  const click = (tool: Tool, x: number, y: number, mods: Mods = {}) => {
    tool.onDown(ctx, P(x, y, mods));
    tool.onUp(ctx, P(x, y, mods, 0));
  };
  const all = () => doc.all();
  const only = <T extends CanvasObject>(type: T["type"]): T => {
    const found = doc.all().filter((o) => o.type === type);
    expect(found).toHaveLength(1);
    return found[0] as T;
  };
  return { doc, index, selection, overlays, ctx, finishTool, P, drag, click, all, only };
}

const shape = (id: string, x: number, y: number, w = 100, h = 80, extra: Partial<NewObject> = {}): NewObject =>
  ({ ...defaultsFor("shape"), id, x, y, w, h, ...extra }) as NewObject;

describe("registration", () => {
  it("every machine has its own set of tools, with the documented ids", () => {
    const a = createToolMachine();
    const b = createToolMachine();
    const ids = ["select", "sticky", "text", "shape", "arrow", "pen", "highlighter", "eraser", "frame", "crop"] as const;
    for (const id of ids) {
      expect(a.get(id)?.id).toBe(id);
      expect(a.get(id)).not.toBe(b.get(id));
    }
    expect(createAllTools().map((t) => t.id)).toEqual([...ids]);
    expect(a.get("hand")).toBeUndefined();
  });

  it("the machine has a lock flag that a tool switch clears and that notifies", () => {
    const m = new ToolMachine(createAllTools());
    const cb = vi.fn();
    m.subscribe(cb);
    m.setTool("sticky");
    m.locked = true;
    expect(m.locked).toBe(true);
    m.locked = true;
    expect(cb).toHaveBeenCalledTimes(2);
    m.setTool("shape");
    expect(m.locked).toBe(false);
  });
});

describe("sticky tool", () => {
  it("a click creates a 200 x 200 sticky centred on the pointer, selects it and starts editing", () => {
    const s = setup();
    const tool = createStickyTool();
    s.click(tool, 300, 200);
    const o = s.only<StickyObj>("sticky");
    expect(o).toMatchObject({ x: 200, y: 100, w: 200, h: 200, fill: "yellow", size: "M" });
    expect([...s.selection.ids]).toEqual([o.id]);
    expect(s.ctx.editing.id).toBe(o.id);
    expect(s.finishTool).toHaveBeenCalledTimes(1);
  });

  it("a drag sets the size; Shift makes it square", () => {
    const s = setup();
    const tool = createStickyTool();
    s.drag(tool, [100, 100], [400, 250]);
    expect(s.only<StickyObj>("sticky")).toMatchObject({ x: 100, y: 100, w: 300, h: 150 });
    const s2 = setup();
    s2.drag(tool, [100, 100], [400, 250], { shiftKey: true });
    expect(s2.only<StickyObj>("sticky")).toMatchObject({ x: 100, y: 100, w: 300, h: 300 });
  });

  it("dragging up and left grows towards the pointer", () => {
    const s = setup();
    s.drag(createStickyTool(), [400, 400], [300, 350]);
    expect(s.only<StickyObj>("sticky")).toMatchObject({ x: 300, y: 350, w: 100, h: 50 });
  });

  it("remembers colour and size set on the tool", () => {
    const s = setup();
    const tool = createStickyTool();
    tool.fill = "mint";
    tool.size = "L";
    s.click(tool, 0, 0);
    expect(s.only<StickyObj>("sticky")).toMatchObject({ fill: "mint", size: "L" });
  });

  it("creation is one undo step that is separate from the edit before it", () => {
    const s = setup([shape("a", 0, 0)]);
    s.doc.update("a", { x: 10 });
    const tool = createStickyTool();
    s.click(tool, 500, 500);
    expect(s.all()).toHaveLength(2);
    s.doc.undo();
    expect(s.all().map((o) => o.id)).toEqual(["a"]);
    expect(s.doc.get("a")!.x).toBe(10);
  });

  it("a locked tool is the caller's concern: the tool always asks to finish", () => {
    const s = setup();
    s.click(createStickyTool(), 10, 10);
    expect(s.finishTool).toHaveBeenCalled();
  });

  it("created inside a frame, it becomes the frame's child", () => {
    const s = setup([{ ...defaultsFor("frame"), id: "f", x: 0, y: 0, w: 800, h: 600 } as NewObject]);
    s.click(createStickyTool(), 400, 300);
    expect(s.only<StickyObj>("sticky").parentId).toBe("f");
  });
});

describe("text tool", () => {
  it("a click creates an auto-width text box at the pointer and starts editing", () => {
    const s = setup();
    s.click(createTextTool(), 100, 100);
    const o = s.only<TextObj>("text");
    expect(o.autoWidth).toBe(true);
    expect(o.x).toBe(100);
    expect(o.y + o.h / 2).toBeCloseTo(100);
    expect(s.ctx.editing.id).toBe(o.id);
  });

  it("a drag creates a fixed-width box that wraps", () => {
    const s = setup();
    s.drag(createTextTool(), [100, 100], [400, 160]);
    const o = s.only<TextObj>("text");
    expect(o).toMatchObject({ x: 100, y: 100, w: 300, autoWidth: false });
  });

  it("an empty text box is removed when editing ends, and nothing is left to undo", () => {
    const s = setup([shape("a", 0, 0)]);
    const depth = s.doc.undoManager.undoStack.length;
    s.click(createTextTool(), 100, 100);
    expect(s.all()).toHaveLength(2);
    s.ctx.editing.stop();
    expect(s.all().map((o) => o.id)).toEqual(["a"]);
    expect(s.doc.undoManager.undoStack.length).toBe(depth);
    expect(s.doc.canRedo()).toBe(false);
  });
});

describe("shape tool", () => {
  it("a click creates a 160 x 120 shape of the remembered kind; a drag sizes it; Shift squares it", () => {
    const s = setup();
    const tool = createShapeTool();
    tool.kind = "ellipse";
    s.click(tool, 200, 200);
    expect(s.only("shape")).toMatchObject({ kind: "ellipse", x: 120, y: 140, w: 160, h: 120 });

    const s2 = setup();
    s2.drag(tool, [0, 0], [300, 100]);
    expect(s2.only("shape")).toMatchObject({ kind: "ellipse", w: 300, h: 100 });

    const s3 = setup();
    s3.drag(tool, [0, 0], [300, 100], { shiftKey: true });
    expect(s3.only("shape")).toMatchObject({ w: 300, h: 300 });
    expect(tool.kind).toBe("ellipse"); // the last kind stays
  });

  it("does not start editing", () => {
    const s = setup();
    s.click(createShapeTool(), 0, 0);
    expect(s.ctx.editing.id).toBeNull();
  });
});

describe("frame tool", () => {
  it("a click creates the preset size, scaled down to fit the viewport", () => {
    const s = setup();
    const tool = createFrameTool();
    tool.preset = "square";
    s.click(tool, 500, 400);
    const f = s.only("frame");
    // viewport 1000 x 800 at zoom 1: 80 % of the height = 640 for a 1080 square
    expect(f.w).toBeCloseTo(640);
    expect(f.h).toBeCloseTo(640);
    expect(f).toMatchObject({ preset: "square" });

    const small = setup([], { camera: { x: 0, y: 0, z: 0.25 } });
    small.click(tool, 500, 400);
    expect(small.only("frame")).toMatchObject(framePresetPx("square"));
  });

  it("a drag sets a custom size; Shift keeps the preset ratio", () => {
    const s = setup();
    const tool = createFrameTool();
    s.drag(tool, [0, 0], [400, 100]);
    expect(s.only("frame")).toMatchObject({ w: 400, h: 100, preset: "custom" });
    const s2 = setup();
    s2.drag(tool, [0, 0], [320, 10], { shiftKey: true });
    const f = s2.only("frame");
    expect(f.w / f.h).toBeCloseTo(1920 / 1080, 3);
    expect(f).toMatchObject({ preset: "slide-16-9" });
  });

  it("a new frame adopts the objects fully inside it, not the ones that only overlap", () => {
    const s = setup([shape("in", 100, 100, 50, 50), shape("edge", 380, 100, 100, 50), shape("out", 700, 700)]);
    s.drag(createFrameTool(), [50, 50], [450, 400]);
    const f = s.only("frame");
    expect(s.doc.get("in")!.parentId).toBe(f.id);
    expect(s.doc.get("edge")!.parentId).toBeNull();
    expect(s.doc.get("out")!.parentId).toBeNull();
    // positions are absolute and untouched
    expect(s.doc.get("in")).toMatchObject({ x: 100, y: 100 });
  });

  it("does not take children away from a frame that is itself inside", () => {
    const s = setup([
      { ...defaultsFor("frame"), id: "inner", x: 100, y: 100, w: 200, h: 200 } as NewObject,
      shape("k", 150, 150, 50, 50, { parentId: "inner" }),
    ]);
    s.drag(createFrameTool(), [0, 0], [500, 500]);
    const outer = s.all().find((o) => o.type === "frame" && o.id !== "inner")!;
    expect(s.doc.get("inner")!.parentId).toBe(outer.id);
    expect(s.doc.get("k")!.parentId).toBe("inner");
  });

  it("sits behind the objects it holds, is named and gets a presentation order", () => {
    const s = setup([shape("a", 100, 100, 50, 50)]);
    const tool = createFrameTool();
    s.drag(tool, [0, 0], [300, 300]);
    s.drag(tool, [400, 0], [700, 300]);
    const frames = s
      .all()
      .flatMap((o) => (o.type === "frame" ? [o] : []))
      .sort((a, b) => a.order.localeCompare(b.order));
    expect(frames.map((f) => f.name)).toEqual(["Frame 1", "Frame 2"]);
    expect(frames[0].order < frames[1].order).toBe(true);
    expect(s.all()[0].type).toBe("frame");
    expect(frames.every((f) => f.index < s.doc.get("a")!.index)).toBe(true);
  });

  it("adopting is part of the same undo step as the frame", () => {
    const s = setup([shape("in", 100, 100, 50, 50)]);
    s.drag(createFrameTool(), [0, 0], [300, 300]);
    s.doc.undo();
    expect(s.all().map((o) => o.id)).toEqual(["in"]);
    expect(s.doc.get("in")!.parentId).toBeNull();
  });
});

describe("arrow tool", () => {
  const two = () => setup([shape("a", 0, 0, 100, 100), shape("b", 400, 0, 100, 100)]);

  it("released on empty space the end stays a free point", () => {
    const s = setup();
    s.drag(createArrowTool(), [0, 0], [300, 0]);
    const a = s.only<ArrowObj>("arrow");
    expect(a.start.kind).toBe("point");
    expect(a.end).toEqual({ kind: "point", x: 300, y: 0 });
    expect(a.endHead).toBe("arrow");
    expect(a.w).toBeGreaterThanOrEqual(1);
    expect(a.h).toBeGreaterThanOrEqual(1);
  });

  it("released over an object it binds, with an anchor inside [0, 1]", () => {
    const s = two();
    s.drag(createArrowTool(), [50, 50], [430, 20]);
    const a = s.only<ArrowObj>("arrow");
    expect(a.start).toMatchObject({ kind: "bound", id: "a" });
    expect(a.end.kind).toBe("bound");
    if (a.end.kind !== "bound") return;
    expect(a.end.id).toBe("b");
    expect(a.end.anchor.x).toBeGreaterThanOrEqual(0);
    expect(a.end.anchor.x).toBeLessThanOrEqual(1);
    expect(a.end.anchor.y).toBeGreaterThanOrEqual(0);
    expect(a.end.anchor.y).toBeLessThanOrEqual(1);
    expect(a.end.anchor.x).toBeCloseTo(0.3);
    expect(a.end.anchor.y).toBeCloseTo(0.2);
  });

  it("highlights the target while dragging and clears it on release", () => {
    const s = two();
    const tool = createArrowTool();
    tool.onDown(s.ctx, s.P(20, 150));
    tool.onMove(s.ctx, s.P(300, 150));
    tool.onMove(s.ctx, s.P(430, 50));
    expect(s.overlays.state.highlight).toBe("b");
    tool.onMove(s.ctx, s.P(300, 300));
    expect(s.overlays.state.highlight).toBeNull();
    tool.onMove(s.ctx, s.P(430, 50));
    tool.onUp(s.ctx, s.P(430, 50, {}, 0));
    expect(s.overlays.state.highlight).toBeNull();
  });

  it("Cmd or Ctrl held never binds", () => {
    const s = two();
    s.drag(createArrowTool(), [50, 50], [430, 20], { metaKey: true });
    const a = s.only<ArrowObj>("arrow");
    expect(a.start.kind).toBe("point");
    expect(a.end.kind).toBe("point");
    const s2 = two();
    s2.drag(createArrowTool(), [20, 150], [430, 20], { ctrlKey: true });
    expect(s2.only<ArrowObj>("arrow").end.kind).toBe("point");
  });

  it("it does not bind to the object it starts on", () => {
    const s = two();
    s.drag(createArrowTool(), [20, 20], [80, 80]);
    const a = s.only<ArrowObj>("arrow");
    expect(a.start.kind).toBe("bound");
    expect(a.end.kind).toBe("point");
  });

  it("writes bounds of a bound arrow so culling and hit-testing agree with its path", () => {
    const s = two();
    s.drag(createArrowTool(), [50, 50], [450, 50]);
    const a = s.only<ArrowObj>("arrow");
    const geom = arrowPath(a, (id) => s.doc.get(id));
    const b = boundsOf(a);
    for (const p of geom.points) {
      expect(p.x).toBeGreaterThanOrEqual(b.x - 0.5);
      expect(p.x).toBeLessThanOrEqual(b.x + b.w + 0.5);
      expect(p.y).toBeGreaterThanOrEqual(b.y - 0.5);
      expect(p.y).toBeLessThanOrEqual(b.y + b.h + 0.5);
    }
  });

  it("route and heads come from the tool; a line has no heads", () => {
    const s = setup();
    const tool = createArrowTool();
    tool.route = "elbow";
    s.drag(tool, [0, 0], [200, 100]);
    expect(s.only<ArrowObj>("arrow")).toMatchObject({ route: "elbow", startHead: "none", endHead: "arrow" });

    const s2 = setup();
    tool.setVariant("line");
    expect(tool.variant).toBe("line");
    s2.drag(tool, [0, 0], [200, 100]);
    expect(s2.only<ArrowObj>("arrow")).toMatchObject({ startHead: "none", endHead: "none" });
  });

  it("Shift snaps a free end to 15 degree steps", () => {
    const s = setup();
    s.drag(createArrowTool(), [0, 0], [200, 5], { shiftKey: true });
    const a = s.only<ArrowObj>("arrow");
    expect(a.end.kind === "point" && Math.abs(a.end.y)).toBeLessThan(1e-6);
  });

  it("a click without a drag creates nothing; one drag is one undo step", () => {
    const s = setup();
    const tool = createArrowTool();
    s.click(tool, 10, 10);
    expect(s.all()).toHaveLength(0);
    s.drag(tool, [0, 0], [300, 0]);
    expect(s.all()).toHaveLength(1);
    s.doc.undo();
    expect(s.all()).toHaveLength(0);
  });

  it("Escape during a drag abandons the arrow", () => {
    const s = setup();
    const tool = createArrowTool();
    tool.onDown(s.ctx, s.P(0, 0));
    tool.onMove(s.ctx, s.P(100, 0));
    expect(s.all()).toHaveLength(1);
    expect(tool.onKey!(s.ctx, new KeyboardEvent("keydown", { key: "Escape" }))).toBe(true);
    expect(s.all()).toHaveLength(0);
    expect(s.doc.canRedo()).toBe(false);
  });

  it("an arrow between two shapes in the same frame belongs to that frame", () => {
    const s = setup([
      { ...defaultsFor("frame"), id: "f", x: -50, y: -50, w: 700, h: 300 } as NewObject,
      shape("a", 0, 0, 100, 100, { parentId: "f" }),
      shape("b", 400, 0, 100, 100, { parentId: "f" }),
    ]);
    s.drag(createArrowTool(), [50, 50], [450, 50]);
    expect(s.only<ArrowObj>("arrow").parentId).toBe("f");
  });
});

describe("pen and highlighter", () => {
  const stroke = (s: ReturnType<typeof setup>, tool: Tool, pts: [number, number][], mods: Mods = {}) => {
    tool.onDown(s.ctx, s.P(pts[0][0], pts[0][1], mods));
    for (const [x, y] of pts.slice(1)) tool.onMove(s.ctx, s.P(x, y, mods));
    const last = pts[pts.length - 1];
    tool.onUp(s.ctx, s.P(last[0], last[1], mods, 0));
  };

  it("stores points relative to the bounding box, with pressure", () => {
    const s = setup();
    stroke(s, createPenTool("pen"), [
      [100, 200],
      [130, 220],
      [160, 190],
      [200, 260],
    ]);
    const o = s.only<StrokeObj>("stroke");
    expect(o).toMatchObject({ tool: "pen", x: 100, y: 190, w: 100, h: 70 });
    expect(o.points.length % 3).toBe(0);
    const xs = o.points.filter((_, i) => i % 3 === 0);
    const ys = o.points.filter((_, i) => i % 3 === 1);
    expect(Math.min(...xs)).toBe(0);
    expect(Math.min(...ys)).toBe(0);
    expect(Math.max(...xs)).toBe(100);
    expect(o.points.slice(0, 3)).toEqual([0, 10, 0.5]);
  });

  it("uses the pointer pressure; a mouse reports 0.5", () => {
    const s = setup();
    const tool = createPenTool("pen");
    tool.onDown(s.ctx, s.P(0, 0, { pressure: 0.2 }));
    tool.onMove(s.ctx, s.P(50, 0, { pressure: 0.9 }));
    tool.onUp(s.ctx, s.P(100, 0, { pressure: 0.6 }, 0));
    const o = s.only<StrokeObj>("stroke");
    const pressures = o.points.filter((_, i) => i % 3 === 2);
    expect(pressures[0]).toBe(0.2);
    expect(pressures[1]).toBe(0.9);
  });

  it("drops points closer than 1.5 screen px, but keeps the last one", () => {
    const s = setup();
    stroke(s, createPenTool("pen"), [
      [0, 0],
      [0.5, 0],
      [1, 0],
      [1.4, 0],
      [10, 0],
      [10.5, 0],
    ]);
    const o = s.only<StrokeObj>("stroke");
    // kept: 0, 10, and the end at 10.5 (forced)
    expect(o.points.length / 3).toBe(3);
    expect(o.w).toBeCloseTo(10.5);
  });

  it("the minimum distance is in screen px, so it follows the zoom", () => {
    const s = setup([], { camera: { x: 0, y: 0, z: 4 } });
    stroke(s, createPenTool("pen"), [
      [0, 0],
      [0.5, 0], // 2 px on screen: kept
      [1, 0],
    ]);
    expect(s.only<StrokeObj>("stroke").points.length / 3).toBe(3);
  });

  it("a click makes a dot; boxes are never smaller than 1 x 1", () => {
    const s = setup();
    s.click(createPenTool("pen"), 50, 50);
    const o = s.only<StrokeObj>("stroke");
    expect(o).toMatchObject({ x: 50, y: 50, w: 1, h: 1 });
    expect(o.points).toEqual([0, 0, 0.5]);
  });

  it("the highlighter makes highlighter strokes with its own width and colour", () => {
    const s = setup();
    const tool = createPenTool("highlighter");
    expect(tool.id).toBe("highlighter");
    stroke(s, tool, [
      [0, 0],
      [100, 0],
    ]);
    const o = s.only<StrokeObj>("stroke");
    expect(o.tool).toBe("highlighter");
    expect(o.size).toBeGreaterThan(createPenTool("pen").size);
  });

  it("colour and size set on the tool are used", () => {
    const s = setup();
    const tool = createPenTool("pen");
    tool.color = "var(--color-accent)";
    tool.size = 9;
    stroke(s, tool, [
      [0, 0],
      [50, 50],
    ]);
    expect(s.only<StrokeObj>("stroke")).toMatchObject({ color: "var(--color-accent)", size: 9 });
  });

  it("shows the stroke as a draft while drawing and writes the document only on release", () => {
    const s = setup();
    const tool = createPenTool("pen");
    tool.onDown(s.ctx, s.P(0, 0));
    tool.onMove(s.ctx, s.P(50, 0));
    tool.onMove(s.ctx, s.P(100, 20));
    expect(s.all()).toHaveLength(0);
    expect(s.overlays.state.draft?.points.length).toBe(9);
    tool.onUp(s.ctx, s.P(100, 20, {}, 0));
    expect(s.overlays.state.draft).toBeNull();
    expect(s.all()).toHaveLength(1);
  });

  it("touch with 'pen draws, finger pans' creates no stroke; a pen still does", () => {
    const s = setup([], { settings: { penOnlyDraws: true } });
    const tool = createPenTool("pen");
    stroke(s, tool, [[0, 0], [50, 50], [100, 0]], { pointerType: "touch" });
    expect(s.all()).toHaveLength(0);
    stroke(s, tool, [[0, 0], [50, 50], [100, 0]], { pointerType: "pen" });
    expect(s.all()).toHaveLength(1);
  });

  it("touch draws when the mode is off", () => {
    const s = setup();
    stroke(s, createPenTool("pen"), [[0, 0], [50, 50]], { pointerType: "touch" });
    expect(s.all()).toHaveLength(1);
  });

  it("one stroke is one undo step; Escape abandons it", () => {
    const s = setup();
    const tool = createPenTool("pen");
    stroke(s, tool, [[0, 0], [50, 50]]);
    s.doc.undo();
    expect(s.all()).toHaveLength(0);

    tool.onDown(s.ctx, s.P(0, 0));
    tool.onMove(s.ctx, s.P(50, 50));
    expect(tool.onKey!(s.ctx, new KeyboardEvent("keydown", { key: "Escape" }))).toBe(true);
    tool.onUp(s.ctx, s.P(50, 50, {}, 0));
    expect(s.all()).toHaveLength(0);
  });
});

describe("eraser", () => {
  const stroked = (id: string, x: number, y: number, extra: Partial<NewObject> = {}): NewObject =>
    ({
      ...defaultsFor("stroke"),
      id,
      x,
      y,
      w: 100,
      h: 1,
      points: [0, 0, 0.5, 50, 0, 0.5, 100, 0, 0.5],
      ...extra,
    }) as NewObject;

  it("removes the strokes it crosses and nothing else", () => {
    const s = setup([
      stroked("s1", 0, 100),
      stroked("s2", 0, 300),
      { ...defaultsFor("sticky"), id: "note", x: 0, y: 90, w: 200, h: 20 } as NewObject,
      shape("box", 0, 95, 200, 10),
    ]);
    s.drag(createEraserTool(), [50, 80], [50, 120]);
    expect(s.doc.get("s1")).toBeUndefined();
    expect(s.doc.get("s2")).toBeDefined();
    expect(s.doc.get("note")).toBeDefined();
    expect(s.doc.get("box")).toBeDefined();
  });

  it("a fast drag does not skip over a thin stroke", () => {
    const s = setup([stroked("s1", 0, 100)]);
    const tool = createEraserTool();
    tool.onDown(s.ctx, s.P(50, 0));
    tool.onMove(s.ctx, s.P(50, 400)); // one event, 400 px
    tool.onUp(s.ctx, s.P(50, 400, {}, 0));
    expect(s.doc.get("s1")).toBeUndefined();
  });

  it("one drag is one undo step that brings every erased stroke back", () => {
    const s = setup([stroked("s1", 0, 100), stroked("s2", 0, 200), stroked("s3", 0, 300)]);
    s.drag(createEraserTool(), [50, 50], [50, 350], {}, 30);
    expect(s.all()).toHaveLength(0);
    s.doc.undo();
    expect(s.all().map((o) => o.id).sort()).toEqual(["s1", "s2", "s3"]);
  });

  it("does not erase locked strokes", () => {
    const s = setup([stroked("s1", 0, 100, { locked: true })]);
    s.drag(createEraserTool(), [50, 80], [50, 120]);
    expect(s.doc.get("s1")).toBeDefined();
  });

  it("a click on a stroke erases it; a touch with 'pen draws, finger pans' erases nothing", () => {
    const s = setup([stroked("s1", 0, 100)], { settings: { penOnlyDraws: true } });
    const tool = createEraserTool();
    s.click(tool, 50, 100, { pointerType: "touch" });
    expect(s.doc.get("s1")).toBeDefined();
    s.click(tool, 50, 100, { pointerType: "pen" });
    expect(s.doc.get("s1")).toBeUndefined();
  });
});
