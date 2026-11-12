// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { defaultsFor } from "@/lib/engine/model/defaults";
import { SpatialIndex } from "@/lib/engine/spatial/spatial-index";
import type { CanvasObject, NewObject } from "@/lib/engine/model/types";
import type { Camera } from "@/lib/engine/geometry/camera";
import { DEFAULT_NAV_SETTINGS, type NavSettings } from "@/lib/settings";
import {
  OverlayStore,
  SelectionStore,
  ToolMachine,
  createToolMachine,
  type CanvasPointer,
  type ToolCtx,
} from "@/lib/engine/input/tool-machine";
import { createSelectTool } from "@/lib/engine/input/tools/select";
import { selectionBox, hitHandle, visibleHandles } from "@/lib/engine/input/handles";

type Mods = Partial<Pick<CanvasPointer, "shiftKey" | "altKey" | "metaKey" | "ctrlKey" | "pointerType">>;

function shape(id: string, x: number, y: number, w = 100, h = 80, extra: Partial<NewObject> = {}): NewObject {
  return { ...defaultsFor("shape"), id, x, y, w, h, ...extra } as NewObject;
}
function image(id: string, x: number, y: number, w = 200, h = 100, extra: Partial<NewObject> = {}): NewObject {
  return { ...defaultsFor("image"), id, assetId: "a", x, y, w, h, ...extra } as NewObject;
}
function frame(id: string, x: number, y: number, w: number, h: number, extra: Partial<NewObject> = {}): NewObject {
  return { ...defaultsFor("frame"), id, x, y, w, h, ...extra } as NewObject;
}

function setup(objs: NewObject[], opts: { camera?: Camera; settings?: Partial<NavSettings> } = {}) {
  const doc = new BoardDoc();
  doc.createMany(objs);
  doc.stopCapturing();
  const index = new SpatialIndex(doc);
  const selection = new SelectionStore();
  const overlays = new OverlayStore();
  let camera: Camera = opts.camera ?? { x: 0, y: 0, z: 1 };
  const setTool = vi.fn();
  const ctx: ToolCtx = {
    doc,
    index,
    camera: () => camera,
    selection,
    settings: { ...DEFAULT_NAV_SETTINGS, snap: false, ...opts.settings },
    setTool,
    overlays,
    viewport: () => ({ w: 1000, h: 800 }),
  };
  const tool = createSelectTool();
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
  const drag = (from: [number, number], to: [number, number], mods: Mods = {}, steps = 5) => {
    tool.onDown(ctx, P(from[0], from[1], mods));
    for (let i = 1; i <= steps; i++) {
      tool.onMove(ctx, P(from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps, mods));
    }
    tool.onUp(ctx, P(to[0], to[1], mods, 0));
  };
  const click = (x: number, y: number, mods: Mods = {}) => {
    tool.onDown(ctx, P(x, y, mods));
    tool.onUp(ctx, P(x, y, mods, 0));
  };
  const get = (id: string) => doc.get(id) as CanvasObject;
  return {
    doc, index, selection, overlays, ctx, tool, setTool, P, drag, click, get,
    setCamera: (c: Camera) => { camera = c; },
    sel: () => [...selection.ids].sort(),
  };
}

afterEach(() => vi.useRealTimers());

describe("SelectionStore and OverlayStore", () => {
  it("SelectionStore notifies on change only and exposes immutable snapshots", () => {
    const s = new SelectionStore();
    const cb = vi.fn();
    s.subscribe(cb);
    const first = s.ids;
    s.set(["a", "b"]);
    s.set(["b", "a"]);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(s.ids).not.toBe(first);
    s.toggle("a");
    expect([...s.ids]).toEqual(["b"]);
    s.toggle("c");
    expect([...s.ids].sort()).toEqual(["b", "c"]);
    s.clear();
    s.clear();
    expect(cb).toHaveBeenCalledTimes(4);
    s.set(["x", "y"]);
    s.prune((id) => id === "x");
    expect([...s.ids]).toEqual(["x"]);
  });

  it("OverlayStore merges patches and resets", () => {
    const o = new OverlayStore();
    const cb = vi.fn();
    o.subscribe(cb);
    o.set({ marquee: { x: 0, y: 0, w: 1, h: 1 } });
    o.set({ highlight: "f" });
    expect(o.state).toEqual({ guides: [], marquee: { x: 0, y: 0, w: 1, h: 1 }, highlight: "f" });
    o.reset();
    expect(o.state).toEqual({ guides: [], marquee: null, highlight: null });
    expect(cb).toHaveBeenCalledTimes(3);
    o.reset();
    expect(cb).toHaveBeenCalledTimes(3);
  });

  it("ToolMachine switches tools, notifies, and cancels the old tool first", () => {
    const m = createToolMachine();
    expect(m.id).toBe("select");
    const cb = vi.fn();
    m.subscribe(cb);
    const before = vi.fn();
    m.beforeSwitch = before;
    m.setTool("hand");
    expect(m.id).toBe("hand");
    expect(m.tool).toBeUndefined(); // not registered yet: the canvas pans
    expect(before).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledTimes(1);
    m.setTool("hand");
    expect(cb).toHaveBeenCalledTimes(1);
    expect(m).toBeInstanceOf(ToolMachine);
  });
});

describe("select tool: clicking", () => {
  it("click selects the top-most object under the pointer", () => {
    const s = setup([shape("below", 0, 0, 200, 200), shape("above", 50, 50, 200, 200)]);
    s.click(100, 100);
    expect(s.sel()).toEqual(["above"]);
    s.click(10, 10);
    expect(s.sel()).toEqual(["below"]);
  });

  it("clicking empty space clears the selection; Shift-clicking empty space keeps it", () => {
    const s = setup([shape("a", 0, 0)]);
    s.click(10, 10);
    s.click(900, 700, { shiftKey: true });
    expect(s.sel()).toEqual(["a"]);
    s.click(900, 700);
    expect(s.sel()).toEqual([]);
  });

  it("Shift-click toggles an object in and out of the selection", () => {
    const s = setup([shape("a", 0, 0), shape("b", 300, 0)]);
    s.click(10, 10);
    s.click(310, 10, { shiftKey: true });
    expect(s.sel()).toEqual(["a", "b"]);
    s.click(310, 10, { shiftKey: true });
    expect(s.sel()).toEqual(["a"]);
  });

  it("clicking one object of a multi-selection (without dragging) selects only it", () => {
    const s = setup([shape("a", 0, 0), shape("b", 300, 0)]);
    s.selection.set(["a", "b"]);
    s.click(10, 10);
    expect(s.sel()).toEqual(["a"]);
  });

  it("locked objects are not selectable by clicking", () => {
    const s = setup([shape("locked", 0, 0, 100, 80, { locked: true })]);
    s.click(10, 10);
    expect(s.sel()).toEqual([]);
  });

  it("hit-tests the real outline: a click in the empty corner of an ellipse misses", () => {
    const s = setup([shape("e", 0, 0, 100, 100, { kind: "ellipse" })]);
    s.click(3, 3);
    expect(s.sel()).toEqual([]);
    s.click(50, 50);
    expect(s.sel()).toEqual(["e"]);
  });

  it("a frame's empty body is not hit (so marquee can start there); its border and label are; its body is once selected", () => {
    const s = setup([frame("f", 0, 0, 400, 300)]);
    s.click(200, 150);
    expect(s.sel()).toEqual([]);
    s.click(200, 1); // border
    expect(s.sel()).toEqual(["f"]);
    s.selection.clear();
    s.click(20, -10); // label above the top-left corner
    expect(s.sel()).toEqual(["f"]);
    s.selection.clear();
    s.selection.set(["f"]);
    s.click(200, 150, { shiftKey: true }); // body while selected: shift toggles it off
    expect(s.sel()).toEqual([]);
  });

  it("a rotated frame is grabbed by its rotated border, not by where the unrotated border would be", () => {
    const s = setup([frame("f", 700, 120, 360, 240, { rotation: 0.3 })]);
    s.click(880, 114); // on the rotated top edge
    expect(s.sel()).toEqual(["f"]);
    s.selection.clear();
    s.click(880, 120); // where the unrotated top edge would be: now 6 px off the real edge
    expect(s.sel()).toEqual([]);
  });

  it("children of a clipping frame are not hit outside the frame", () => {
    const s = setup([frame("f", 0, 0, 200, 200), shape("k", 150, 150, 200, 200, { parentId: "f" })]);
    s.click(300, 300);
    expect(s.sel()).toEqual([]);
    s.click(180, 180);
    expect(s.sel()).toEqual(["k"]);
  });

  it("clicking a child of a group selects the group; double-click enters the group", () => {
    const s = setup([{ ...defaultsFor("group"), id: "g", x: 0, y: 0, w: 10, h: 10 } as NewObject]);
    s.doc.createMany([shape("k1", 0, 0, 100, 100, { parentId: "g" }), shape("k2", 300, 0, 100, 100, { parentId: "g" })]);
    s.click(50, 50);
    expect(s.sel()).toEqual(["g"]);
    s.tool.onDoubleClick!(s.ctx, s.P(50, 50));
    expect(s.sel()).toEqual(["k1"]);
  });

  it("zoom changes the hit tolerance: a 4 px slop is 40 canvas units at 10 %", () => {
    const s = setup([shape("a", 0, 0, 100, 100)], { camera: { x: 0, y: 0, z: 0.1 } });
    s.click(130, 50); // 30 canvas units right of the edge = 3 px on screen
    expect(s.sel()).toEqual(["a"]);
  });
});

describe("select tool: marquee", () => {
  it("selects only objects fully inside; Alt selects anything touching", () => {
    const s = setup([shape("in", 20, 20, 50, 50), shape("part", 150, 20, 100, 50), shape("out", 600, 600)]);
    s.drag([5, 5], [200, 200]);
    expect(s.sel()).toEqual(["in"]);
    s.selection.clear();
    s.drag([5, 5], [200, 200], { altKey: true });
    expect(s.sel()).toEqual(["in", "part"]);
  });

  it("works in any drag direction, clears the overlay when done, and ignores locked objects", () => {
    const s = setup([shape("in", 20, 20, 50, 50), shape("locked", 100, 20, 50, 50, { locked: true })]);
    s.tool.onDown(s.ctx, s.P(300, 300));
    s.tool.onMove(s.ctx, s.P(0, 0));
    s.tool.onMove(s.ctx, s.P(-10, -10));
    expect(s.overlays.state.marquee).toEqual({ x: -10, y: -10, w: 310, h: 310 });
    expect(s.sel()).toEqual(["in"]);
    s.tool.onUp(s.ctx, s.P(-10, -10, {}, 0));
    expect(s.overlays.state.marquee).toBeNull();
  });

  it("Shift-marquee adds to the selection; a marquee never selects a frame's children as well as the frame", () => {
    const s = setup([shape("keep", 700, 700, 20, 20), frame("f", 0, 0, 300, 300), shape("kid", 20, 20, 50, 50, { parentId: "f" })]);
    s.selection.set(["keep"]);
    s.drag([-20, -20], [350, 350], { shiftKey: true });
    expect(s.sel()).toEqual(["f", "keep"]);
  });

  it("does not start before the drag threshold (3 px mouse, 6 px touch)", () => {
    const s = setup([shape("a", 0, 0, 20, 20)]);
    s.tool.onDown(s.ctx, s.P(500, 500));
    s.tool.onMove(s.ctx, s.P(502, 500));
    expect(s.overlays.state.marquee).toBeNull();
    s.tool.onMove(s.ctx, s.P(504, 500));
    expect(s.overlays.state.marquee).not.toBeNull();
    s.tool.onUp(s.ctx, s.P(504, 500, {}, 0));
    s.tool.onDown(s.ctx, s.P(500, 500, { pointerType: "touch" }));
    s.tool.onMove(s.ctx, s.P(505, 500, { pointerType: "touch" }));
    expect(s.overlays.state.marquee).toBeNull();
    s.tool.onMove(s.ctx, s.P(506, 500, { pointerType: "touch" }));
    expect(s.overlays.state.marquee).not.toBeNull();
    s.tool.onUp(s.ctx, s.P(506, 500, { pointerType: "touch" }, 0));
  });
});

describe("select tool: moving", () => {
  it("dragging an object moves it by the pointer delta and selects it", () => {
    const s = setup([shape("a", 100, 100)]);
    s.drag([150, 140], [250, 190]);
    expect(s.get("a")).toMatchObject({ x: 200, y: 150 });
    expect(s.sel()).toEqual(["a"]);
  });

  it("moves the whole selection together", () => {
    const s = setup([shape("a", 0, 0), shape("b", 300, 300)]);
    s.selection.set(["a", "b"]);
    s.drag([10, 10], [60, 10]);
    expect(s.get("a")).toMatchObject({ x: 50, y: 0 });
    expect(s.get("b")).toMatchObject({ x: 350, y: 300 });
    expect(s.sel()).toEqual(["a", "b"]);
  });

  it("is one undo step per gesture, even with long pauses mid-drag", () => {
    vi.useFakeTimers();
    const s = setup([shape("a", 100, 100)]);
    s.tool.onDown(s.ctx, s.P(150, 140));
    for (let i = 1; i <= 6; i++) {
      vi.advanceTimersByTime(900); // longer than the undo capture window
      s.tool.onMove(s.ctx, s.P(150 + i * 10, 140));
    }
    s.tool.onUp(s.ctx, s.P(210, 140, {}, 0));
    expect(s.get("a").x).toBe(160);
    s.doc.undo();
    expect(s.get("a").x).toBe(100);
    expect(s.doc.canUndo()).toBe(true); // the creation is still there: the whole drag was one step
    s.doc.redo();
    expect(s.get("a").x).toBe(160);
  });

  it("a separate gesture right after is its own undo step", () => {
    const s = setup([shape("a", 0, 0)]);
    s.drag([10, 10], [20, 10]);
    s.drag([20, 10], [40, 10]);
    expect(s.get("a").x).toBe(30);
    s.doc.undo();
    expect(s.get("a").x).toBe(10);
  });

  it("does not move locked objects in a mixed selection", () => {
    const s = setup([shape("free", 0, 0), shape("locked", 300, 0, 100, 80, { locked: true })]);
    s.selection.set(["free", "locked"]);
    s.drag([10, 10], [60, 10]);
    expect(s.get("free").x).toBe(50);
    expect(s.get("locked").x).toBe(300);
  });

  it("nudging a locked selection does nothing", () => {
    const s = setup([shape("locked", 0, 0, 100, 80, { locked: true })]);
    s.selection.set(["locked"]);
    expect(s.tool.onKey!(s.ctx, new KeyboardEvent("keydown", { key: "ArrowRight" }))).toBe(true);
    expect(s.get("locked").x).toBe(0);
  });

  it("carries a moving frame's children (also nested frames) and leaves other objects alone", () => {
    const s = setup([frame("f", 0, 0, 400, 300), shape("k", 20, 20, 50, 50, { parentId: "f" }), frame("inner", 100, 100, 100, 100, { parentId: "f" }), shape("kk", 120, 120, 20, 20, { parentId: "inner" }), shape("other", 600, 0)]);
    s.selection.set(["f"]);
    s.drag([100, 1], [160, 31]); // grab the border (away from the handles)
    expect(s.get("f")).toMatchObject({ x: 60, y: 30 });
    expect(s.get("k")).toMatchObject({ x: 80, y: 50 });
    expect(s.get("inner")).toMatchObject({ x: 160, y: 130 });
    expect(s.get("kk")).toMatchObject({ x: 180, y: 150 });
    expect(s.get("other")).toMatchObject({ x: 600, y: 0 });
    s.doc.undo();
    expect(s.get("kk")).toMatchObject({ x: 120, y: 120 });
  });

  it("dropping an object onto a frame makes it a child; dragging it out un-parents it", () => {
    const s = setup([frame("f", 0, 0, 400, 300), shape("a", 600, 100, 100, 80)]);
    s.drag([650, 140], [200, 150]); // centre lands inside the frame
    expect(s.get("a").parentId).toBe("f");
    s.drag([200, 150], [700, 500]);
    expect(s.get("a").parentId).toBeNull();
  });

  it("moving a frame does not re-parent its own children, and a frame can be dropped into another", () => {
    const s = setup([frame("big", 0, 0, 1000, 800), frame("f", 100, 100, 200, 200), shape("k", 120, 120, 50, 50, { parentId: "f" })]);
    s.selection.set(["f"]);
    s.drag([150, 101], [350, 301]);
    expect(s.get("k").parentId).toBe("f");
    expect(s.get("f").parentId).toBe("big");
  });

  it("highlights the frame an object would drop into while dragging", () => {
    const s = setup([frame("f", 0, 0, 400, 300), shape("a", 600, 100, 100, 80)]);
    s.tool.onDown(s.ctx, s.P(650, 140));
    s.tool.onMove(s.ctx, s.P(200, 150));
    s.tool.onMove(s.ctx, s.P(210, 150));
    expect(s.overlays.state.highlight).toBe("f");
    s.tool.onUp(s.ctx, s.P(210, 150, {}, 0));
    expect(s.overlays.state.highlight).toBeNull();
  });

  it("an arrow bound to a moved object follows it (bounds refreshed); one bound to an unmoved target keeps its binding when its target moves", () => {
    const s = setup([
      shape("t", 0, 0, 100, 100),
      shape("u", 400, 0, 100, 100),
      { ...defaultsFor("arrow"), id: "ar", x: 100, y: 49, w: 300, h: 2, start: { kind: "bound", id: "t", anchor: { x: 1, y: 0.5 } }, end: { kind: "bound", id: "u", anchor: { x: 0, y: 0.5 } } } as NewObject,
    ]);
    s.drag([50, 50], [50, 250]);
    const ar = s.get("ar") as Extract<CanvasObject, { type: "arrow" }>;
    expect(ar.start).toMatchObject({ kind: "bound", id: "t" });
    expect(ar.y + ar.h).toBeGreaterThan(200); // bounds now reach the moved target's anchor at y=300
    expect(ar.y).toBeLessThan(60);
  });

  it("moving an arrow on its own turns terminals bound to things that stay put into free points", () => {
    const s = setup([
      shape("t", 0, 0, 100, 100),
      { ...defaultsFor("arrow"), id: "ar", x: 100, y: 49, w: 200, h: 2, start: { kind: "bound", id: "t", anchor: { x: 1, y: 0.5 } }, end: { kind: "point", x: 300, y: 50 } } as NewObject,
    ]);
    s.selection.set(["ar"]);
    s.drag([200, 50], [200, 150]);
    const ar = s.get("ar") as Extract<CanvasObject, { type: "arrow" }>;
    expect(ar.start).toEqual({ kind: "point", x: 100, y: 150 });
    expect(ar.end).toEqual({ kind: "point", x: 300, y: 150 });
    expect(s.get("t")).toMatchObject({ x: 0, y: 0 });
  });

  it("Escape during a drag reverts the whole gesture", () => {
    const s = setup([shape("a", 100, 100)]);
    s.tool.onDown(s.ctx, s.P(150, 140));
    s.tool.onMove(s.ctx, s.P(250, 140));
    s.tool.onMove(s.ctx, s.P(350, 140));
    expect(s.get("a").x).toBe(300);
    expect(s.tool.onKey!(s.ctx, new KeyboardEvent("keydown", { key: "Escape" }))).toBe(true);
    expect(s.get("a").x).toBe(100);
    s.tool.onMove(s.ctx, s.P(450, 140));
    expect(s.get("a").x).toBe(100);
    s.tool.onUp(s.ctx, s.P(450, 140, {}, 0));
    expect(s.get("a").x).toBe(100);
    expect(s.overlays.state.guides).toEqual([]);
  });

  it("cancelling (second finger down) after the move began reverts too", () => {
    const s = setup([shape("a", 100, 100)]);
    s.tool.onDown(s.ctx, s.P(150, 140));
    s.tool.onMove(s.ctx, s.P(250, 140));
    s.tool.onCancel!(s.ctx);
    expect(s.get("a").x).toBe(100);
  });
});

describe("select tool: alt-drag duplicates", () => {
  it("leaves the originals, creates copies with new ids, selects the copies and moves them", () => {
    const s = setup([shape("a", 100, 100), shape("b", 400, 100)]);
    s.selection.set(["a", "b"]);
    const before = s.doc.all().length;
    s.drag([150, 140], [150, 340], { altKey: true });
    expect(s.doc.all()).toHaveLength(before + 2);
    expect(s.get("a")).toMatchObject({ x: 100, y: 100 });
    expect(s.get("b")).toMatchObject({ x: 400, y: 100 });
    const copies = s.sel();
    expect(copies).toHaveLength(2);
    expect(copies.every((id) => id !== "a" && id !== "b")).toBe(true);
    const ys = copies.map((id) => s.get(id).y).sort();
    expect(ys).toEqual([300, 300]);
    s.doc.undo();
    expect(s.doc.all()).toHaveLength(before); // creation and move are one step
  });

  it("duplicates a frame with its children, remapping parents and arrow bindings", () => {
    const s = setup([
      frame("f", 0, 0, 300, 300),
      shape("k1", 20, 20, 50, 50, { parentId: "f" }),
      shape("k2", 120, 20, 50, 50, { parentId: "f" }),
      { ...defaultsFor("arrow"), id: "ar", x: 70, y: 40, w: 50, h: 2, parentId: "f", start: { kind: "bound", id: "k1", anchor: { x: 1, y: 0.5 } }, end: { kind: "bound", id: "k2", anchor: { x: 0, y: 0.5 } } } as NewObject,
    ]);
    s.selection.set(["f"]);
    s.drag([75, 1], [575, 1], { altKey: true });
    const [fc] = s.sel();
    expect(s.get(fc).type).toBe("frame");
    const kids = s.doc.childrenOf(fc);
    expect(kids).toHaveLength(3);
    const arrow = kids.find((o) => o.type === "arrow") as Extract<CanvasObject, { type: "arrow" }>;
    const kidIds = kids.filter((o) => o.type === "shape").map((o) => o.id);
    expect(arrow.start).toMatchObject({ kind: "bound" });
    expect(kidIds).toContain((arrow.start as { id: string }).id);
    expect(kidIds).toContain((arrow.end as { id: string }).id);
    expect(s.doc.childrenOf("f")).toHaveLength(3); // original untouched
    expect(s.get("f").x).toBe(0);
    expect(s.get(fc).x).toBe(500);
    expect(kids.every((o) => o.x >= 500)).toBe(true);
  });
});

describe("select tool: snapping while moving", () => {
  it("snaps edges to neighbours within 6 screen px and shows guides; stops when the drag ends", () => {
    const s = setup([shape("a", 0, 0, 100, 80), shape("ref", 300, 300, 100, 80)], { settings: { snap: true } });
    s.tool.onDown(s.ctx, s.P(50, 40));
    s.tool.onMove(s.ctx, s.P(200, 100));
    s.tool.onMove(s.ctx, s.P(340, 330));
    s.tool.onMove(s.ctx, s.P(354, 340)); // a.x would be 304 (4 px off ref.x=300), a.y 300
    expect(s.get("a").x).toBe(300);
    expect(s.get("a").y).toBe(300);
    expect(s.overlays.state.guides.length).toBeGreaterThan(0);
    s.tool.onUp(s.ctx, s.P(354, 340, {}, 0));
    expect(s.overlays.state.guides).toEqual([]);
    expect(s.get("a")).toMatchObject({ x: 300, y: 300 });
  });

  it("the threshold is in screen pixels: at 50 % zoom 6 px reaches 12 canvas units", () => {
    const s = setup([shape("a", 0, 0, 100, 80), shape("ref", 400, 400, 100, 80)], { settings: { snap: true }, camera: { x: 0, y: 0, z: 0.5 } });
    s.tool.onDown(s.ctx, s.P(50, 40));
    s.tool.onMove(s.ctx, s.P(100, 100));
    s.tool.onMove(s.ctx, s.P(450, 430));
    s.tool.onMove(s.ctx, s.P(460, 440)); // a.x = 410: 10 canvas units = 5 px
    expect(s.get("a").x).toBe(400);
    s.tool.onUp(s.ctx, s.P(460, 440, {}, 0));
  });

  it("Ctrl or Cmd disables snapping for that drag", () => {
    for (const mod of [{ metaKey: true }, { ctrlKey: true }]) {
      const s = setup([shape("a", 0, 0, 100, 80), shape("ref", 300, 300, 100, 80)], { settings: { snap: true } });
      s.drag([50, 40], [354, 340], mod);
      expect(s.get("a").x).toBe(304);
    }
  });

  it("does not snap while the pointer is faster than 1.5 px/ms, and does when it slows down", () => {
    const s = setup([shape("a", 0, 0, 100, 80), shape("ref", 300, 300, 100, 80)], { settings: { snap: true } });
    s.tool.onDown(s.ctx, s.P(50, 40));
    s.tool.onMove(s.ctx, s.P(200, 100));
    const fast = { ...s.P(354, 340), timeStamp: 1100 + 100 * 3 + 2 }; // 2 ms after the previous event: far over 1.5 px/ms
    s.tool.onMove(s.ctx, { ...s.P(300, 300), timeStamp: 5000 });
    s.tool.onMove(s.ctx, { ...fast, timeStamp: 5002 });
    expect(s.get("a").x).toBe(304);
    s.tool.onMove(s.ctx, { ...s.P(354, 340), timeStamp: 5400 });
    expect(s.get("a").x).toBe(300);
    s.tool.onUp(s.ctx, s.P(354, 340, {}, 0));
  });

  it("respects the snap setting", () => {
    const s = setup([shape("a", 0, 0, 100, 80), shape("ref", 300, 300, 100, 80)], { settings: { snap: false } });
    s.drag([50, 40], [354, 340]);
    expect(s.get("a").x).toBe(304);
  });

  it("does not snap to its own children or to the object itself", () => {
    const s = setup([frame("f", 0, 0, 300, 300), shape("k", 50, 50, 50, 50, { parentId: "f" })], { settings: { snap: true } });
    s.selection.set(["f"]);
    s.drag([100, 1], [103, 1]);
    expect(s.get("f").x).toBe(3); // a snap to its own child (x=53 -> no) would have pulled it back
  });
});

describe("select tool: nudging and keys", () => {
  it("arrow keys nudge by 1 px, Shift by 10, in canvas units regardless of zoom; modifiers are left alone", () => {
    const s = setup([shape("a", 0, 0)], { camera: { x: 0, y: 0, z: 4 } });
    s.selection.set(["a"]);
    const key = (k: string, init: KeyboardEventInit = {}) => s.tool.onKey!(s.ctx, new KeyboardEvent("keydown", { key: k, ...init }));
    expect(key("ArrowRight")).toBe(true);
    expect(key("ArrowDown", { shiftKey: true })).toBe(true);
    expect(key("ArrowLeft", { shiftKey: true })).toBe(true);
    expect(key("ArrowUp")).toBe(true);
    expect(s.get("a")).toMatchObject({ x: -9, y: 9 });
    expect(key("ArrowRight", { metaKey: true })).toBe(false);
    expect(s.get("a").x).toBe(-9);
  });

  it("nudging carries a frame's children; arrow keys with nothing selected are not handled", () => {
    const s = setup([frame("f", 0, 0, 200, 200), shape("k", 10, 10, 20, 20, { parentId: "f" })]);
    expect(s.tool.onKey!(s.ctx, new KeyboardEvent("keydown", { key: "ArrowRight" }))).toBe(false);
    s.selection.set(["f"]);
    s.tool.onKey!(s.ctx, new KeyboardEvent("keydown", { key: "ArrowRight", shiftKey: true }));
    expect(s.get("k").x).toBe(20);
  });

  it("Escape clears the selection (and reports it handled only when it did something)", () => {
    const s = setup([shape("a", 0, 0)]);
    const esc = () => s.tool.onKey!(s.ctx, new KeyboardEvent("keydown", { key: "Escape" }));
    expect(esc()).toBe(false);
    s.selection.set(["a"]);
    expect(esc()).toBe(true);
    expect(s.sel()).toEqual([]);
  });
});

describe("select tool: resizing", () => {
  const handleAt = (s: ReturnType<typeof setup>, name: string) => {
    const box = selectionBox(s.doc, s.selection.ids)!;
    const hp = visibleHandles(box, 1).find((h) => h.handle === name)!;
    return [hp.point.x, hp.point.y] as [number, number];
  };

  it("dragging the east handle resizes a shape freely", () => {
    const s = setup([shape("a", 100, 100, 100, 80)]);
    s.selection.set(["a"]);
    s.drag(handleAt(s, "e"), [250, 140]);
    expect(s.get("a")).toMatchObject({ x: 100, y: 100, w: 150, h: 80 });
  });

  it("images and stickies keep their aspect ratio by default", () => {
    const s = setup([image("i", 0, 0, 200, 100), { ...defaultsFor("sticky"), id: "st", x: 500, y: 0, w: 200, h: 200 } as NewObject]);
    s.selection.set(["i"]);
    s.drag(handleAt(s, "e"), [400, 50]);
    const i = s.get("i");
    expect(i.w / i.h).toBeCloseTo(2, 6);
    expect(i.w).toBeCloseTo(400, 6);
    s.selection.set(["st"]);
    s.drag(handleAt(s, "se"), [800, 400]);
    const st = s.get("st");
    expect(st.w).toBeCloseTo(st.h, 6);
  });

  it("Shift keeps the aspect of a shape; Alt resizes from the centre", () => {
    const s = setup([shape("a", 100, 100, 100, 50)]);
    s.selection.set(["a"]);
    s.drag(handleAt(s, "se"), [300, 160], { shiftKey: true });
    expect(s.get("a").w / s.get("a").h).toBeCloseTo(2, 6);
    s.doc.undo();
    s.drag(handleAt(s, "e"), [250, 125], { altKey: true });
    expect(s.get("a")).toMatchObject({ x: 50, y: 100, w: 200, h: 50 });
  });

  it("dragging past the opposite edge flips and never goes below the minimum size", () => {
    const s = setup([shape("a", 100, 100, 100, 80)]);
    s.selection.set(["a"]);
    s.drag(handleAt(s, "e"), [50, 140]);
    const a = s.get("a");
    expect(a.x).toBe(50);
    expect(a.w).toBe(50);
    s.drag([a.x + a.w, 140], [a.x - 100, 140]); // east handle again, far left
    expect(s.get("a").w).toBeGreaterThanOrEqual(1);
  });

  it("a rotated rect keeps its opposite edge fixed in the world", () => {
    const s = setup([shape("a", 100, 100, 100, 50, { rotation: Math.PI / 2 })]);
    s.selection.set(["a"]);
    // rotated 90deg: the 'e' handle points down on screen. Fix point = west edge midpoint.
    const before = selectionBox(s.doc, s.selection.ids)!;
    const west = (b: typeof before) => {
      const c = { x: b.rect.x + b.rect.w / 2, y: b.rect.y + b.rect.h / 2 };
      return { x: c.x - (b.rect.w / 2) * Math.cos(b.rotation), y: c.y - (b.rect.w / 2) * Math.sin(b.rotation) };
    };
    const w0 = west(before);
    const [hx, hy] = handleAt(s, "e");
    s.drag([hx, hy], [hx, hy + 60]);
    const after = selectionBox(s.doc, s.selection.ids)!;
    expect(after.rect.w).toBeCloseTo(160, 6);
    const w1 = west(after);
    expect(w1.x).toBeCloseTo(w0.x, 6);
    expect(w1.y).toBeCloseTo(w0.y, 6);
    expect(s.get("a").rotation).toBeCloseTo(Math.PI / 2, 9);
  });

  it("resizing a multi-selection scales every object with the box", () => {
    const s = setup([shape("a", 0, 0, 100, 100), shape("b", 200, 0, 100, 100)]);
    s.selection.set(["a", "b"]);
    s.drag(handleAt(s, "e"), [600, 50]); // box 300 -> 600 wide
    expect(s.get("a")).toMatchObject({ x: 0, w: 200 });
    expect(s.get("b")).toMatchObject({ x: 400, w: 200 });
  });

  it("resizing a frame leaves its children where they are; auto-width text becomes fixed width", () => {
    const s = setup([frame("f", 0, 0, 300, 300), shape("k", 10, 10, 20, 20, { parentId: "f" }), { ...defaultsFor("text"), id: "t", x: 500, y: 0, w: 100, h: 30 } as NewObject]);
    s.selection.set(["f"]);
    s.drag(handleAt(s, "se"), [400, 400]);
    expect(s.get("f")).toMatchObject({ w: 400, h: 400 });
    expect(s.get("k")).toMatchObject({ x: 10, y: 10, w: 20 });
    s.selection.set(["t"]);
    s.drag(handleAt(s, "e"), [700, 15]);
    expect(s.get("t")).toMatchObject({ w: 200, autoWidth: false });
  });

  it("scales a pen stroke's points with its box", () => {
    const s = setup([{ ...defaultsFor("stroke"), id: "p", x: 0, y: 0, w: 100, h: 50, points: [0, 0, 0.5, 100, 50, 0.5] } as NewObject]);
    s.selection.set(["p"]);
    s.drag(handleAt(s, "se"), [200, 100]);
    const p = s.get("p") as Extract<CanvasObject, { type: "stroke" }>;
    expect(p).toMatchObject({ w: 200, h: 100 });
    expect(p.points).toEqual([0, 0, 0.5, 200, 100, 0.5]);
  });

  it("is one undo step", () => {
    const s = setup([shape("a", 100, 100, 100, 80)]);
    s.selection.set(["a"]);
    s.drag(handleAt(s, "se"), [300, 300], {}, 12);
    s.doc.undo();
    expect(s.get("a")).toMatchObject({ w: 100, h: 80 });
  });

  it("hitHandle: 16 px square with a mouse, 44 px for touch, tolerance follows zoom", () => {
    const s = setup([shape("a", 0, 0, 400, 300)]);
    s.selection.set(["a"]);
    const box = selectionBox(s.doc, s.selection.ids)!;
    expect(hitHandle(box, { x: 407, y: 307 }, 1, "mouse")).toEqual({ kind: "resize", handle: "se" });
    expect(hitHandle(box, { x: 409, y: 309 }, 1, "mouse")).toBeNull();
    expect(hitHandle(box, { x: 419, y: 319 }, 1, "touch")).toEqual({ kind: "resize", handle: "se" });
    expect(hitHandle(box, { x: 440, y: 340 }, 1, "touch")).toBeNull();
    expect(hitHandle(box, { x: 412, y: 312 }, 0.5, "mouse")).toEqual({ kind: "resize", handle: "se" }); // 6 px away on screen at 50 %
    expect(hitHandle(box, { x: 200, y: -28 }, 1, "mouse")).toEqual({ kind: "rotate" });
  });

  it("hides edge handles on boxes too small for them, keeps the corners", () => {
    const s = setup([shape("a", 0, 0, 12, 12)]);
    s.selection.set(["a"]);
    const box = selectionBox(s.doc, s.selection.ids)!;
    expect(visibleHandles(box, 1).map((h) => h.handle).sort()).toEqual(["ne", "nw", "se", "sw"]);
    expect(visibleHandles(box, 10)).toHaveLength(8);
  });
});

describe("select tool: rotating", () => {
  const around = (cx: number, cy: number, r: number, deg: number): [number, number] => {
    const a = (deg * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };

  it("dragging the rotate handle rotates about the centre, following the pointer", () => {
    const s = setup([shape("a", 0, 0, 100, 100)]);
    s.selection.set(["a"]);
    const box = selectionBox(s.doc, s.selection.ids)!;
    const handle = [box.center.x, box.rect.y - 28] as [number, number];
    s.drag(handle, around(50, 50, 200, -90 + 17)); // 17 degrees clockwise of "up"
    expect(s.get("a").rotation).toBeCloseTo((17 * Math.PI) / 180, 6);
    expect(s.get("a")).toMatchObject({ x: 0, y: 0, w: 100, h: 100 });
  });

  it("Shift snaps to 15 degree steps", () => {
    const s = setup([shape("a", 0, 0, 100, 100)]);
    s.selection.set(["a"]);
    s.drag([50, -28], around(50, 50, 200, -90 + 17), { shiftKey: true });
    expect(s.get("a").rotation).toBeCloseTo(Math.PI / 12, 9);
    s.doc.undo();
    s.drag([50, -28], around(50, 50, 200, -90 + 38), { shiftKey: true });
    expect(s.get("a").rotation).toBeCloseTo((45 * Math.PI) / 180, 9);
  });

  it("rotating a multi-selection rotates every object about the common centre", () => {
    const s = setup([shape("a", 0, 0, 100, 100), shape("b", 200, 0, 100, 100)]);
    s.selection.set(["a", "b"]);
    const box = selectionBox(s.doc, s.selection.ids)!;
    s.drag([box.center.x, box.rect.y - 28], around(box.center.x, box.center.y, 300, 0)); // up -> right: +90 degrees
    expect(s.get("a").rotation).toBeCloseTo(Math.PI / 2, 6);
    expect(s.get("b").rotation).toBeCloseTo(Math.PI / 2, 6);
    const ca = { x: s.get("a").x + 50, y: s.get("a").y + 50 };
    expect(ca.x).toBeCloseTo(150, 6); // (50,50) rotated 90deg about (150,50)
    expect(ca.y).toBeCloseTo(-50, 6);
  });

  it("rotating a frame turns its children with it", () => {
    const s = setup([frame("f", 0, 0, 200, 100), shape("k", 150, 10, 40, 40, { parentId: "f" })]);
    s.selection.set(["f"]);
    const box = selectionBox(s.doc, s.selection.ids)!;
    s.drag([box.center.x, box.rect.y - 28], around(box.center.x, box.center.y, 300, 0));
    expect(s.get("f").rotation).toBeCloseTo(Math.PI / 2, 6);
    expect(s.get("k").rotation).toBeCloseTo(Math.PI / 2, 6);
    expect(s.get("k").x + 20).toBeCloseTo(100 - (30 - 50), 6); // child centre (170,30) about (100,50) by +90deg -> (120,120)
  });
});

describe("select tool: cursor", () => {
  it("shows resize cursors over handles and the default elsewhere", () => {
    const s = setup([shape("a", 0, 0, 400, 300)]);
    s.selection.set(["a"]);
    s.tool.onMove(s.ctx, s.P(402, 302, {}, 0));
    expect(s.tool.cursor!(s.ctx)).toBe("nwse-resize");
    s.tool.onMove(s.ctx, s.P(200, -28, {}, 0));
    expect(s.tool.cursor!(s.ctx)).toBe("grab");
    s.tool.onMove(s.ctx, s.P(900, 900, {}, 0));
    expect(s.tool.cursor!(s.ctx)).toBe("default");
  });
});

describe("selectionBox", () => {
  it("is the object itself for one object and the union of bounds for several", () => {
    const s = setup([shape("a", 0, 0, 100, 50, { rotation: 0.5 }), shape("b", 300, 200, 100, 100)]);
    expect(selectionBox(s.doc, new Set(["a"]))).toMatchObject({ rect: { x: 0, y: 0, w: 100, h: 50 }, rotation: 0.5, single: true });
    const multi = selectionBox(s.doc, new Set(["a", "b"]))!;
    expect(multi.rotation).toBe(0);
    expect(multi.single).toBe(false);
    expect(multi.rect.x + multi.rect.w).toBe(400);
    expect(selectionBox(s.doc, new Set())).toBeNull();
    expect(selectionBox(s.doc, new Set(["nope"]))).toBeNull();
  });

  it("offers no handles for a lone arrow or an all-locked selection", () => {
    const s = setup([
      { ...defaultsFor("arrow"), id: "ar", x: 0, y: 0, w: 100, h: 1 } as NewObject,
      shape("l", 300, 0, 100, 100, { locked: true }),
    ]);
    expect(selectionBox(s.doc, new Set(["ar"]))!.resizable).toBe(false);
    expect(selectionBox(s.doc, new Set(["l"]))!.resizable).toBe(false);
  });
});
