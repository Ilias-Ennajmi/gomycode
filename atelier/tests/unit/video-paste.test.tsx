import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CanvasHandle } from "@/components/canvas/CanvasView";
import { useClipboard } from "@/components/canvas/useClipboard";
import { useDropFiles } from "@/components/canvas/useDropFiles";
import type { CommandCtx, ToastOptions } from "@/lib/engine/commands/registry";
import { parseClipboard } from "@/lib/engine/clipboard/parse";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { SelectionStore } from "@/lib/engine/input/selection-store";
import type { Point } from "@/lib/engine/model/types";
import { SpatialIndex } from "@/lib/engine/spatial/spatial-index";

function setup() {
  const doc = new BoardDoc();
  const selection = new SelectionStore();
  const container = document.createElement("div");
  document.body.append(container);
  const toasts: ToastOptions[] = [];
  const handle = {
    doc,
    selection,
    index: new SpatialIndex(doc),
    container: () => container,
    getCamera: () => ({ x: 0, y: 0, z: 1 }),
    viewport: () => ({ w: 1000, h: 800 }),
  } as unknown as CanvasHandle;
  const ctx: CommandCtx = { doc, selection, canvas: handle, setTool: vi.fn(), toast: (o) => void toasts.push(o), clipboardStyle: { current: null } };
  const add = vi.fn<(f: File, at: Point) => Promise<string>>(async () => "obj");
  const hook = renderHook(() => useClipboard({ handle, ctx: () => ctx, addImage: add }));
  return { container, toasts, add, handle, hook };
}
const file = (name: string, type: string, size = 10) => {
  const f = new File([new Uint8Array(Math.min(size, 10))], name, { type });
  if (size > 10) Object.defineProperty(f, "size", { value: size });
  return f;
};
const MB = 1024 * 1024;
function paste(files: File[]) {
  const e = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(e, "clipboardData", { value: { getData: () => "", files, items: files.map((f) => ({ kind: "file", getAsFile: () => f })), types: ["Files"] } });
  document.body.dispatchEvent(e);
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("pasting and dropping video files", () => {
  it("parseClipboard hands mp4 and webm files on like pictures", () => {
    const items = parseClipboard({ files: [file("a.mp4", "video/mp4"), file("b.webm", "video/webm"), file("c.png", "image/png")] });
    expect(items.map((i) => i.kind)).toEqual(["image", "image", "image"]);
    expect(parseClipboard({ files: [file("m.mov", "video/quicktime")] })).toEqual([]);
  });

  it("a pasted mp4 and webm go to the uploader", async () => {
    const t = setup();
    paste([file("a.mp4", "video/mp4"), file("b.webm", "video/webm")]);
    expect(t.toasts).toHaveLength(0);
    expect(t.add).toHaveBeenCalledTimes(2);
  });

  it("a video larger than the 50 MB picture limit but within 200 MB is accepted", () => {
    const t = setup();
    paste([file("trip.mp4", "video/mp4", 120 * MB)]);
    expect(t.toasts).toHaveLength(0);
    expect(t.add).toHaveBeenCalledTimes(1);
  });

  it("a 250 MB video is refused by name with the 200 MB limit, and nothing is added", () => {
    const t = setup();
    paste([file("big.mp4", "video/mp4", 250 * MB)]);
    expect(t.add).not.toHaveBeenCalled();
    expect(t.toasts).toHaveLength(1);
    expect(t.toasts[0].message).toBe("Couldn't add big.mp4: too large (250 MB; the limit for videos is 200 MB)");
  });

  it("an unsupported video type (mov) is refused by name", () => {
    const t = setup();
    paste([file("clip.mov", "video/quicktime")]);
    expect(t.add).not.toHaveBeenCalled();
    expect(t.toasts[0].message).toMatch(/^Couldn't add clip\.mov/);
  });

  it("dropping a video file onto the canvas adds it at the drop point", () => {
    const t = setup();
    renderHook(() => useDropFiles(t.handle, t.hook.result.current.pasteInput));
    const e = new MouseEvent("drop", { clientX: 300, clientY: 200, bubbles: true, cancelable: true });
    Object.defineProperty(e, "dataTransfer", { value: { files: [file("a.mp4", "video/mp4")], types: ["Files"], getData: () => "", dropEffect: "none" } });
    t.container.dispatchEvent(e);
    expect(t.add).toHaveBeenCalledTimes(1);
    expect(t.add.mock.calls[0][1]).toEqual({ x: 300, y: 200 });
  });
});
