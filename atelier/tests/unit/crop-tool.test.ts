// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { defaultsFor } from "@/lib/engine/model/defaults";
import { SpatialIndex } from "@/lib/engine/spatial/spatial-index";
import type { ImageObj, NewObject } from "@/lib/engine/model/types";
import { DEFAULT_NAV_SETTINGS } from "@/lib/settings";
import { EditingStore } from "@/lib/engine/input/editing-store";
import { OverlayStore, SelectionStore, createToolMachine, type CanvasPointer, type ToolCtx } from "@/lib/engine/input/tool-machine";
import { createCropTool } from "@/lib/engine/input/tools/crop";
import { cropPixelAspect } from "@/lib/engine/images/crop";

const SRC = { w: 4000, h: 3000 };

function setup(extra: Partial<ImageObj> = {}) {
  const doc = new BoardDoc();
  doc.createMany([{ ...defaultsFor("image"), id: "i", assetId: "a", x: 100, y: 100, w: 400, h: 300, ...extra } as NewObject]);
  doc.stopCapturing();
  const selection = new SelectionStore();
  selection.set(["i"]);
  const setTool = vi.fn();
  const ctx: ToolCtx = {
    doc,
    index: new SpatialIndex(doc),
    camera: () => ({ x: 0, y: 0, z: 1 }),
    selection,
    settings: { ...DEFAULT_NAV_SETTINGS, snap: false },
    setTool,
    overlays: new OverlayStore(),
    viewport: () => ({ w: 1000, h: 800 }),
    editing: new EditingStore(doc),
    finishTool: vi.fn(),
  };
  const tool = createCropTool();
  tool.setAssets({ available: () => ({ width: SRC.w, height: SRC.h }) });
  let t = 0;
  const P = (x: number, y: number, mods: Partial<CanvasPointer> = {}, buttons = 1): CanvasPointer => ({
    point: { x, y }, screen: { x, y }, pointerId: 1, pointerType: "mouse", pressure: 0.5, button: 0, buttons,
    shiftKey: false, altKey: false, metaKey: false, ctrlKey: false, timeStamp: (t += 100), ...mods,
  });
  const key = (k: string, mods: Partial<KeyboardEvent> = {}) => tool.onKey!(ctx, { key: k, shiftKey: false, metaKey: false, ctrlKey: false, altKey: false, ...mods } as KeyboardEvent);
  const drag = (from: [number, number], to: [number, number], mods: Partial<CanvasPointer> = {}) => {
    tool.onDown(ctx, P(from[0], from[1], mods));
    tool.onMove(ctx, P((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, mods));
    tool.onMove(ctx, P(to[0], to[1], mods));
    tool.onUp(ctx, P(to[0], to[1], mods, 0));
  };
  const img = () => doc.get("i") as ImageObj;
  return { doc, ctx, tool, setTool, key, drag, img, selection, P };
}

describe("CropTool", () => {
  it("activating with no single image selected falls back to Select", () => {
    const t = setup();
    t.selection.clear();
    t.tool.onActivate!(t.ctx);
    expect(t.tool.state).toBeNull();
    expect(t.setTool).toHaveBeenCalledWith("select");
  });

  it("activating on an image shows the whole picture as the window", () => {
    const t = setup();
    t.tool.onActivate!(t.ctx);
    expect(t.tool.state?.win).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    expect(t.tool.state?.preset).toBe("free");
  });

  it("activating on a cropped image starts from its window", () => {
    const t = setup({ crop: { x: 0.25, y: 0, w: 0.5, h: 1 }, w: 200, h: 300 });
    t.tool.onActivate!(t.ctx);
    expect(t.tool.state?.win).toEqual({ x: 0.25, y: 0, w: 0.5, h: 1 });
  });

  it("a preset shapes the window; Enter commits it with the box refitted, then returns to Select", () => {
    const t = setup();
    t.tool.onActivate!(t.ctx);
    t.tool.setPreset("1:1");
    expect(t.key("Enter")).toBe(true);
    const o = t.img();
    expect(o.crop!.x).toBeCloseTo(0.125);
    expect(o.crop!.w).toBeCloseTo(0.75);
    expect(o.w).toBe(400);
    expect(o.w / o.h).toBeCloseTo(cropPixelAspect(SRC, o.crop));
    expect(t.setTool).toHaveBeenCalledWith("select");
    expect(t.tool.state).toBeNull();
    t.doc.undo();
    expect(t.img().crop).toBeNull();
    expect(t.img().h).toBe(300);
  });

  it("Escape leaves the crop unchanged and adds no undo step", () => {
    const t = setup();
    const before = t.doc.undoManager.undoStack.length;
    t.tool.onActivate!(t.ctx);
    t.tool.setPreset("16:9");
    t.drag([300, 250], [350, 280]);
    expect(t.key("Escape")).toBe(true);
    expect(t.img().crop).toBeNull();
    expect(t.img().h).toBe(300);
    expect(t.doc.undoManager.undoStack.length).toBe(before);
    expect(t.setTool).toHaveBeenCalledWith("select");
    expect(t.tool.state).toBeNull();
  });

  it("dragging inside the window moves it and keeps it in the image", () => {
    const t = setup();
    t.tool.onActivate!(t.ctx);
    t.tool.setPreset("1:1"); // window 300x300 canvas px at x 150..450
    t.drag([300, 250], [340, 250]);
    expect(t.tool.state!.win.x).toBeCloseTo(0.125 + 40 / 400);
    t.drag([300, 250], [900, 250]);
    expect(t.tool.state!.win.x + t.tool.state!.win.w).toBeLessThanOrEqual(1 + 1e-9);
  });

  it("dragging a handle with a preset keeps the pixel ratio", () => {
    const t = setup();
    t.tool.onActivate!(t.ctx);
    t.tool.setPreset("1:1"); // x 150..450, y 100..400
    t.drag([450, 400], [330, 330]); // se corner
    const w = t.tool.state!.win;
    expect((w.w * SRC.w) / (w.h * SRC.h)).toBeCloseTo(1, 9);
    expect(w.w).toBeLessThan(0.75);
  });

  it("free resize changes only the dragged edges; Shift locks the current ratio", () => {
    const t = setup();
    t.tool.onActivate!(t.ctx);
    t.drag([500, 250], [400, 250]); // east edge
    expect(t.tool.state!.win.w).toBeCloseTo(0.75);
    expect(t.tool.state!.win.h).toBeCloseTo(1);
    const ratio = (t.tool.state!.win.w * SRC.w) / (t.tool.state!.win.h * SRC.h);
    t.drag([400, 400], [300, 300], { shiftKey: true }); // se corner with Shift
    const w = t.tool.state!.win;
    expect((w.w * SRC.w) / (w.h * SRC.h)).toBeCloseTo(ratio, 9);
  });

  it("arrow keys nudge the window by 1% (Shift 10%) and clamp at the edges", () => {
    const t = setup();
    t.tool.onActivate!(t.ctx);
    t.tool.setPreset("1:1");
    const x0 = t.tool.state!.win.x;
    expect(t.key("ArrowRight")).toBe(true);
    expect(t.tool.state!.win.x).toBeCloseTo(x0 + 0.01);
    t.key("ArrowLeft", { shiftKey: true });
    expect(t.tool.state!.win.x).toBeCloseTo(x0 + 0.01 - 0.1);
    for (let i = 0; i < 20; i++) t.key("ArrowLeft", { shiftKey: true });
    expect(t.tool.state!.win.x).toBe(0);
    for (let i = 0; i < 20; i++) t.key("ArrowRight", { shiftKey: true });
    expect(t.tool.state!.win.x + t.tool.state!.win.w).toBeCloseTo(1);
  });

  it("other keys are not handled", () => {
    const t = setup();
    t.tool.onActivate!(t.ctx);
    expect(t.key("a")).toBe(false);
  });

  it("with a flipped image the window is in display space and the stored crop is in source space", () => {
    const t = setup({ flipX: true });
    t.tool.onActivate!(t.ctx);
    t.tool.setWindow({ x: 0, y: 0, w: 0.5, h: 1 }); // the left half as displayed = the source's right half
    t.key("Enter");
    expect(t.img().crop!.x).toBeCloseTo(0.5);
    expect(t.img().crop!.w).toBeCloseTo(0.5);
  });

  it("setWindow (the Inspector fields) clamps and notifies", () => {
    const t = setup();
    const cb = vi.fn();
    t.tool.subscribe(cb);
    t.tool.onActivate!(t.ctx);
    t.tool.setWindow({ x: -1, y: 0.9, w: 3, h: 0.5 });
    const w = t.tool.state!.win;
    expect(w.x).toBe(0);
    expect(w.w).toBe(1);
    expect(w.y + w.h).toBeLessThanOrEqual(1);
    expect(cb).toHaveBeenCalled();
  });

  it("a double-click commits", () => {
    const t = setup();
    t.tool.onActivate!(t.ctx);
    t.tool.setPreset("1:1");
    t.tool.onDoubleClick!(t.ctx, t.P(300, 250));
    expect(t.img().crop).not.toBeNull();
    expect(t.setTool).toHaveBeenCalledWith("select");
  });

  it("a press outside the picture commits", () => {
    const t = setup();
    t.tool.onActivate!(t.ctx);
    t.tool.setPreset("1:1");
    t.tool.onDown(t.ctx, t.P(900, 700));
    expect(t.img().crop).not.toBeNull();
  });

  it("switching tools mid-crop discards it", () => {
    const t = setup();
    t.tool.onActivate!(t.ctx);
    t.tool.setPreset("1:1");
    t.tool.onCancel!(t.ctx);
    expect(t.img().crop).toBeNull();
    expect(t.tool.state).toBeNull();
  });

  it("is part of every tool machine", () => {
    const m = createToolMachine();
    expect(m.get("crop")).toBeDefined();
  });
});

describe("Select tool enters crop mode", () => {
  it("Enter on a single selected image and a double-click on an image", async () => {
    const { createSelectTool } = await import("@/lib/engine/input/tools/select");
    const t = setup();
    const sel = createSelectTool();
    expect(sel.onKey!(t.ctx, { key: "Enter", shiftKey: false, metaKey: false, ctrlKey: false, altKey: false } as KeyboardEvent)).toBe(true);
    expect(t.setTool).toHaveBeenCalledWith("crop");
    t.setTool.mockClear();
    t.selection.clear();
    sel.onDoubleClick!(t.ctx, t.P(300, 250));
    expect(t.setTool).toHaveBeenCalledWith("crop");
    expect([...t.selection.ids]).toEqual(["i"]);
  });
  it("a locked image does not enter crop mode", async () => {
    const { createSelectTool } = await import("@/lib/engine/input/tools/select");
    const t = setup({ locked: true });
    const sel = createSelectTool();
    expect(sel.onKey!(t.ctx, { key: "Enter", shiftKey: false, metaKey: false, ctrlKey: false, altKey: false } as KeyboardEvent)).toBe(false);
    sel.onDoubleClick!(t.ctx, t.P(300, 250));
    expect(t.setTool).not.toHaveBeenCalled();
  });
});
