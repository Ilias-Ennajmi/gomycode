// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { defaultsFor } from "@/lib/engine/model/defaults";
import type { CanvasObject, ImageObj, NewObject } from "@/lib/engine/model/types";
import { SelectionStore } from "@/lib/engine/input/selection-store";
import { SpatialIndex } from "@/lib/engine/spatial/spatial-index";
import { registry, type CommandCtx, type ToastOptions } from "@/lib/engine/commands/registry";
import "@/lib/engine/commands/commands";
import { replaceImageWithFile } from "@/lib/engine/commands/image-commands";
import { bindShortcuts } from "@/lib/engine/commands/shortcuts";
import type { CanvasHandle } from "@/components/canvas/CanvasView";
import { EditingStore } from "@/lib/engine/input/editing-store";
import { OverlayStore, createToolMachine, type ToolCtx, type ToolId } from "@/lib/engine/input/tool-machine";
import { DEFAULT_NAV_SETTINGS } from "@/lib/settings";
import { cropPixelAspect } from "@/lib/engine/images/crop";

const image = (id: string, x = 0, extra: Partial<NewObject> = {}) =>
  ({ ...defaultsFor("image"), id, assetId: "a", x, y: 0, w: 200, h: 150, ...extra }) as NewObject;
const sticky = (id: string) => ({ ...defaultsFor("sticky"), id }) as NewObject;

const SIZES: Record<string, { width: number; height: number }> = { a: { width: 4000, height: 3000 }, b: { width: 1000, height: 3000 } };

function setup(objs: NewObject[]) {
  const doc = new BoardDoc();
  doc.createMany(objs);
  doc.stopCapturing();
  const selection = new SelectionStore();
  const tools = createToolMachine();
  const toasts: ToastOptions[] = [];
  // What CanvasView does: the incoming tool learns it is active.
  const toolCtx: ToolCtx = {
    doc, index: new SpatialIndex(doc), camera: () => ({ x: 0, y: 0, z: 1 }), selection, settings: DEFAULT_NAV_SETTINGS,
    setTool: (id) => tools.setTool(id), overlays: new OverlayStore(), viewport: () => ({ w: 1000, h: 800 }), editing: new EditingStore(doc), finishTool: () => {},
  };
  tools.afterSwitch = (tool) => tool?.onActivate?.(toolCtx);
  const canvas = { doc, selection, index: new SpatialIndex(doc), tools, getCamera: () => ({ x: 0, y: 0, z: 1 }), viewport: () => ({ w: 1000, h: 800 }) } as unknown as CanvasHandle;
  const replaceImage = vi.fn();
  const ctx: CommandCtx = {
    doc,
    selection,
    canvas,
    setTool: (id: ToolId) => tools.setTool(id),
    toast: (o) => {
      toasts.push(o);
    },
    clipboardStyle: { current: null },
    ui: { replaceImage },
    assets: { available: (id) => SIZES[id] ?? null },
  };
  const run = (id: string) => registry.run(id, ctx);
  const get = (id: string) => doc.get(id) as ImageObj;
  return { doc, selection, ctx, run, get, tools, toasts, replaceImage };
}

describe("image commands: registration", () => {
  it("registers the image commands and view.valueCheck", () => {
    for (const id of [
      "image.crop", "image.cropPreset.free", "image.cropPreset.1:1", "image.cropPreset.4:5", "image.cropPreset.3:4", "image.cropPreset.16:9", "image.cropPreset.9:16",
      "image.mask.rect", "image.mask.rounded", "image.mask.circle", "image.grayscale", "image.flipH", "image.flipV", "image.replace", "view.valueCheck",
    ]) {
      expect(registry.has(id), id).toBe(true);
    }
    expect(registry.get("image.crop").shortcut).toBe("C");
  });
  it("image commands are unavailable without an image selected", () => {
    const t = setup([image("i"), sticky("s")]);
    t.selection.set(["s"]);
    for (const id of ["image.crop", "image.mask.circle", "image.grayscale", "image.flipH", "image.replace", "image.cropPreset.1:1"]) {
      expect(registry.available(id, t.ctx), id).toBe(false);
    }
    t.selection.set(["i"]);
    expect(registry.available("image.crop", t.ctx)).toBe(true);
  });
  it("crop and replace need exactly one image; masks and presets work on several", () => {
    const t = setup([image("i"), image("j", 300)]);
    t.selection.set(["i", "j"]);
    expect(registry.available("image.crop", t.ctx)).toBe(false);
    expect(registry.available("image.replace", t.ctx)).toBe(false);
    expect(registry.available("image.mask.circle", t.ctx)).toBe(true);
    expect(registry.available("image.cropPreset.1:1", t.ctx)).toBe(true);
  });
  it("locked images are not available", () => {
    const t = setup([image("i", 0, { locked: true })]);
    t.selection.set(["i"]);
    expect(registry.available("image.crop", t.ctx)).toBe(false);
    expect(registry.available("image.mask.circle", t.ctx)).toBe(false);
  });
});

describe("image commands: behaviour", () => {
  it("image.crop switches to the crop tool", () => {
    const t = setup([image("i")]);
    t.selection.set(["i"]);
    t.run("image.crop");
    expect(t.tools.id).toBe("crop");
  });
  it("a preset applied from the bar crops every selected image in one undo step", () => {
    const t = setup([image("i"), image("j", 300)]);
    t.selection.set(["i", "j"]);
    t.run("image.cropPreset.1:1");
    for (const id of ["i", "j"]) {
      const o = t.get(id);
      expect(o.crop).not.toBeNull();
      expect(o.w / o.h).toBeCloseTo(1);
      expect(o.w / o.h).toBeCloseTo(cropPixelAspect({ w: 4000, h: 3000 }, o.crop));
    }
    t.doc.undo();
    expect(t.get("i").crop).toBeNull();
    expect(t.get("j").crop).toBeNull();
  });
  it("a preset while the crop tool is active reshapes the window instead", () => {
    const t = setup([image("i")]);
    t.selection.set(["i"]);
    t.run("image.crop");
    t.run("image.cropPreset.16:9");
    expect(t.get("i").crop).toBeNull(); // nothing is applied until Enter
    const tool = t.tools.get("crop") as unknown as { state: { win: { w: number }; preset: string } };
    expect(tool.state.preset).toBe("16:9");
  });
  it("masks: circle, rounded keeps or defaults a radius, rect", () => {
    const t = setup([image("i")]);
    t.selection.set(["i"]);
    t.run("image.mask.circle");
    expect(t.get("i").mask.kind).toBe("circle");
    t.run("image.mask.rounded");
    expect(t.get("i").mask.kind).toBe("rounded");
    expect(t.get("i").mask.radius).toBeGreaterThan(0);
    t.run("image.mask.rect");
    expect(t.get("i").mask.kind).toBe("rect");
  });
  it("grayscale toggles on, then off, across a selection", () => {
    const t = setup([image("i"), image("j", 300, { grayscale: true })]);
    t.selection.set(["i", "j"]);
    t.run("image.grayscale");
    expect(t.get("i").grayscale && t.get("j").grayscale).toBe(true);
    t.run("image.grayscale");
    expect(t.get("i").grayscale || t.get("j").grayscale).toBe(false);
  });
  it("flip commands toggle the mirror of the image in place", () => {
    const t = setup([image("i")]);
    t.selection.set(["i"]);
    t.run("image.flipH");
    t.run("image.flipV");
    expect(t.get("i").flipX).toBe(true);
    expect(t.get("i").flipY).toBe(true);
    expect(t.get("i").x).toBe(0);
  });
  it("image.replace asks the UI to pick a file for the selected image", () => {
    const t = setup([image("i")]);
    t.selection.set(["i"]);
    t.run("image.replace");
    expect(t.replaceImage).toHaveBeenCalledWith("i");
  });
  it("view.valueCheck flips meta.valueCheck and changes no object", () => {
    const t = setup([image("i"), sticky("s")]);
    const before = JSON.stringify(t.doc.all());
    const undoDepth = t.doc.undoManager.undoStack.length;
    t.run("view.valueCheck");
    expect(t.doc.meta.valueCheck).toBe(true);
    expect(JSON.stringify(t.doc.all())).toBe(before);
    expect(t.doc.undoManager.undoStack.length).toBe(undoDepth);
    t.run("view.valueCheck");
    expect(t.doc.meta.valueCheck).toBe(false);
  });
});

describe("image.crop shortcut C", () => {
  const press = (target: HTMLElement, key: string, over: KeyboardEventInit = {}) => {
    const e = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...over });
    target.dispatchEvent(e);
    return e;
  };
  it("C crops a selected image but is left alone in inputs and with other objects selected", () => {
    const t = setup([image("i"), sticky("s")]);
    const off = bindShortcuts(document.body, () => t.ctx);
    t.selection.set(["s"]);
    press(document.body, "c");
    expect(t.tools.id).toBe("select");
    t.selection.set(["i"]);
    const input = document.createElement("input");
    document.body.appendChild(input);
    press(input, "c");
    expect(t.tools.id).toBe("select");
    input.remove();
    const e = press(document.body, "c");
    expect(t.tools.id).toBe("crop");
    expect(e.defaultPrevented).toBe(true);
    off();
  });
  it("Escape cancels an active crop from anywhere, and does nothing otherwise", () => {
    const t = setup([image("i")]);
    const off = bindShortcuts(document.body, () => t.ctx);
    t.selection.set(["i"]);
    const e0 = press(document.body, "Escape");
    expect(e0.defaultPrevented).toBe(false);
    t.run("image.crop");
    expect(t.tools.id).toBe("crop");
    press(document.body, "Escape");
    expect(t.tools.id).toBe("select");
    expect(t.get("i").crop).toBeNull();
    off();
  });
  it("image.cropApply commits the crop in progress", () => {
    const t = setup([image("i")]);
    t.selection.set(["i"]);
    expect(registry.available("image.cropApply", t.ctx)).toBe(false);
    t.run("image.crop");
    t.run("image.cropPreset.1:1");
    expect(registry.available("image.cropApply", t.ctx)).toBe(true);
    t.run("image.cropApply");
    expect(t.tools.id).toBe("select");
    expect(t.get("i").crop).not.toBeNull();
    expect(t.get("i").w / t.get("i").h).toBeCloseTo(1);
  });
  it("Mod+C (copy) is not hijacked", () => {
    const t = setup([image("i")]);
    const off = bindShortcuts(document.body, () => t.ctx);
    t.selection.set(["i"]);
    press(document.body, "c", { ctrlKey: true });
    expect(t.tools.id).toBe("select");
    off();
  });
});

describe("replaceImageWithFile", () => {
  const file = new File([new Uint8Array(4)], "new.png", { type: "image/png" });
  it("swaps the asset keeping the box, mask and opacity, adjusts the crop, one undo step", async () => {
    const t = setup([image("i", 0, { w: 200, h: 200, mask: { kind: "circle", radius: 0 }, opacity: 0.6, crop: { x: 0.125, y: 0, w: 0.75, h: 1 } })]);
    const uploader = { addAssetOnly: vi.fn().mockResolvedValue("b") };
    const ok = await replaceImageWithFile(t.ctx, "i", file, uploader);
    expect(ok).toBe(true);
    const o = t.get("i");
    expect(o.assetId).toBe("b");
    expect([o.w, o.h, o.opacity, o.mask.kind]).toEqual([200, 200, 0.6, "circle"]);
    expect(cropPixelAspect({ w: 1000, h: 3000 }, o.crop)).toBeCloseTo(1, 6);
    t.doc.undo();
    expect(t.get("i").assetId).toBe("a");
    expect(t.get("i").crop).toEqual({ x: 0.125, y: 0, w: 0.75, h: 1 });
  });
  it("keeps the old asset and says so when the upload cannot start", async () => {
    const t = setup([image("i")]);
    const uploader = { addAssetOnly: vi.fn().mockRejectedValue(new Error("That file is not an image")) };
    const ok = await replaceImageWithFile(t.ctx, "i", file, uploader);
    expect(ok).toBe(false);
    expect(t.get("i").assetId).toBe("a");
    expect(t.toasts.at(-1)!.message).toContain("not an image");
  });
  it("does nothing when the image was deleted meanwhile", async () => {
    const t = setup([image("i")]);
    const uploader = { addAssetOnly: vi.fn().mockImplementation(async () => { t.doc.remove(["i"]); return "b"; }) };
    expect(await replaceImageWithFile(t.ctx, "i", file, uploader)).toBe(false);
  });
});

describe("paste style for images", () => {
  it("copies opacity, mask, grayscale and the crop's pixel aspect between images with different sources", () => {
    const t = setup([
      image("a1", 0, { w: 200, h: 200, opacity: 0.4, grayscale: true, mask: { kind: "rounded", radius: 18 }, crop: { x: 0.125, y: 0, w: 0.75, h: 1 } }),
      image("a2", 400, { assetId: "b", w: 300, h: 900 }),
    ]);
    t.selection.set(["a1"]);
    t.run("edit.copyStyle");
    t.selection.set(["a2"]);
    t.run("edit.pasteStyle");
    const o = t.get("a2");
    expect(o.opacity).toBe(0.4);
    expect(o.grayscale).toBe(true);
    expect(o.mask).toEqual({ kind: "rounded", radius: 18 });
    expect(o.w / o.h).toBeCloseTo(1, 6);
    expect(cropPixelAspect({ w: 1000, h: 3000 }, o.crop)).toBeCloseTo(1, 6);
  });
});

void ({} as CanvasObject);
