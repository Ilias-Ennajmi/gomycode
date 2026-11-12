// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { CanvasHandle } from "@/components/canvas/CanvasView";
import { registry, type CommandCtx, type CommandUI, type ToastOptions } from "@/lib/engine/commands/registry";
import "@/lib/engine/commands/commands";
import { matchShortcut } from "@/lib/engine/commands/shortcuts";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { SelectionStore } from "@/lib/engine/input/selection-store";
import { defaultsFor } from "@/lib/engine/model/defaults";
import type { FrameObj, NewObject } from "@/lib/engine/model/types";
import { slidesOfDoc } from "@/lib/engine/present/doc-slides";
import { startIndexFor } from "@/lib/engine/present/doc-slides";

const frame = (id: string, order: string, extra: Record<string, unknown> = {}) =>
  ({ ...defaultsFor("frame"), id, order, name: id, ...extra }) as NewObject;
const shape = (id: string, extra: Record<string, unknown> = {}) => ({ ...defaultsFor("shape"), id, ...extra }) as NewObject;

function setup(objs: NewObject[], ui: Partial<CommandUI> = {}) {
  const doc = new BoardDoc();
  doc.createMany(objs);
  doc.stopCapturing();
  const selection = new SelectionStore();
  const toasts: ToastOptions[] = [];
  const canvas = { doc, selection, getCamera: () => ({ x: 0, y: 0, z: 1 }), viewport: () => ({ w: 1000, h: 800 }) } as unknown as CanvasHandle;
  const ctx: CommandCtx = { doc, selection, canvas, setTool: vi.fn(), toast: (o) => void toasts.push(o), clipboardStyle: { current: null }, ui };
  return { doc, selection, ctx, toasts, run: (id: string) => registry.run(id, ctx) };
}

describe("present commands", () => {
  it("are unavailable where the editor cannot present (no UI hook)", () => {
    const t = setup([frame("a", "a0")]);
    expect(registry.available("present.start", t.ctx)).toBe(false);
    expect(registry.available("present.fromSelection", t.ctx)).toBe(false);
  });

  it("present.start begins at the first slide", () => {
    const startPresent = vi.fn();
    const t = setup([frame("b", "a1"), frame("a", "a0")], { startPresent });
    expect(t.run("present.start")).toBe(true);
    expect(startPresent).toHaveBeenCalledWith({ index: 0 });
  });

  it("present.start with no frames says so and does not start", () => {
    const startPresent = vi.fn();
    const t = setup([shape("s")], { startPresent });
    t.run("present.start");
    expect(startPresent).not.toHaveBeenCalled();
    expect(t.toasts.map((x) => x.message)).toEqual(["Add frames to present."]);
  });

  it("present.fromSelection starts at the selected frame, or the frame that holds the selection", () => {
    const startPresent = vi.fn();
    const t = setup([frame("a", "a0"), frame("b", "a1"), frame("c", "a2"), shape("in-c", { parentId: "c" })], { startPresent });
    t.selection.set(["b"]);
    t.run("present.fromSelection");
    expect(startPresent).toHaveBeenLastCalledWith({ index: 1 });
    t.selection.set(["in-c"]);
    t.run("present.fromSelection");
    expect(startPresent).toHaveBeenLastCalledWith({ index: 2 });
  });

  it("present.fromSelection falls back to the frame at the middle of the view, then the first", () => {
    const startPresent = vi.fn();
    const t = setup([frame("a", "a0", { x: 5000 }), frame("b", "a1", { x: 0, y: 0 })], { startPresent });
    t.run("present.fromSelection"); // camera 0,0 with a 1000x800 view: centre (500, 400) is inside b
    expect(startPresent).toHaveBeenLastCalledWith({ index: 1 });
    const u = setup([frame("a", "a0", { x: 9000 })], { startPresent });
    u.run("present.fromSelection");
    expect(startPresent).toHaveBeenLastCalledWith({ index: 0 });
  });

  it("present.exit runs only while presenting", () => {
    const exitPresent = vi.fn();
    let on = false;
    const t = setup([frame("a", "a0")], { exitPresent, isPresenting: () => on });
    expect(t.run("present.exit")).toBe(false);
    on = true;
    expect(t.run("present.exit")).toBe(true);
    expect(exitPresent).toHaveBeenCalledTimes(1);
  });

  it("binds Mod+Alt+P to present.start and Escape to present.exit", () => {
    const start = registry.get("present.start");
    expect(start.shortcut).toBe("Mod+Alt+P");
    expect(matchShortcut({ key: "π", code: "KeyP", ctrlKey: true, metaKey: false, shiftKey: false, altKey: true }, start.shortcut!)).toBe(true);
    expect(registry.get("present.exit").shortcut).toBe("Escape");
  });

  it("frame.setSlideOrder opens the Slides panel", () => {
    const togglePanel = vi.fn();
    const t = setup([frame("a", "a0")], { togglePanel });
    t.run("frame.setSlideOrder");
    expect(togglePanel).toHaveBeenCalledWith("slides");
  });

  it("frame.slideEarlier and frame.slideLater move the selected frame one place", () => {
    const t = setup([frame("a", "a0"), frame("b", "a1"), frame("c", "a2")]);
    t.selection.set(["b"]);
    expect(t.run("frame.slideEarlier")).toBe(true);
    expect(slidesOfDoc(t.doc).map((s) => s.id)).toEqual(["b", "a", "c"]);
    expect(registry.available("frame.slideEarlier", t.ctx)).toBe(false); // already first
    expect(t.run("frame.slideLater")).toBe(true);
    expect(slidesOfDoc(t.doc).map((s) => s.id)).toEqual(["a", "b", "c"]);
    t.selection.set(["c"]);
    expect(registry.available("frame.slideLater", t.ctx)).toBe(false); // already last
    t.selection.set(["a", "b"]);
    expect(registry.available("frame.slideLater", t.ctx)).toBe(false); // needs exactly one frame
  });
});

describe("startIndexFor", () => {
  it("is 0 for an empty selection with nothing under the view", () => {
    const doc = new BoardDoc();
    doc.create(frame("a", "a0", { x: 9000 }));
    expect(startIndexFor(doc, slidesOfDoc(doc), new Set(), { x: 0, y: 0 })).toBe(0);
  });

  it("walks up from a nested object to the slide that holds it", () => {
    const doc = new BoardDoc();
    doc.createMany([frame("a", "a0"), frame("b", "a1", { x: 3000 }), shape("s", { parentId: "b" }), shape("t", { parentId: "s" })]);
    expect(startIndexFor(doc, slidesOfDoc(doc), new Set(["t"]), { x: 0, y: 0 })).toBe(1);
    const f = doc.get("b") as FrameObj;
    expect(f.type).toBe("frame");
  });
});
