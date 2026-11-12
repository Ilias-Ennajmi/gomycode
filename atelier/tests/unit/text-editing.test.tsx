import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { defaultsFor } from "@/lib/engine/model/defaults";
import { richTextToPlainLines } from "@/lib/engine/model/rich-text-html";
import type { NewObject } from "@/lib/engine/model/types";
import { CanvasView, type CanvasHandle } from "@/components/canvas/CanvasView";

const noAssets = { url: () => null, available: () => null };

beforeEach(() => {
  class RO {
    constructor(private cb: () => void) {}
    observe() {
      queueMicrotask(this.cb);
    }
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", RO);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 800, width: 1000, height: 800, toJSON: () => ({}),
  });
  const rect = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) };
  const none = { length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] } as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => rect as DOMRect;
  Range.prototype.getClientRects = () => none;
  Element.prototype.getClientRects = () => none;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const objs: NewObject[] = [
  { ...defaultsFor("sticky"), id: "note", x: 100, y: 100, w: 200, h: 200 } as NewObject,
  { ...defaultsFor("text"), id: "label", x: 400, y: 100, w: 150, h: 32, autoWidth: false } as NewObject,
  { ...defaultsFor("shape"), id: "box", x: 100, y: 400, w: 200, h: 100 } as NewObject,
  { ...defaultsFor("frame"), id: "slide", x: 500, y: 400, w: 400, h: 300, name: "Intro" } as NewObject,
  { ...defaultsFor("image"), id: "pic", assetId: "a", x: 700, y: 100, w: 100, h: 100 } as NewObject,
];

async function mount(list = objs) {
  const doc = new BoardDoc();
  doc.createMany(list);
  doc.undoManager.clear();
  const ref = createRef<CanvasHandle>();
  const utils = render(<CanvasView ref={ref} doc={doc} assets={noAssets} initialCamera={{ x: 0, y: 0, z: 1 }} />);
  await act(async () => {});
  const root = utils.container.querySelector("[data-canvas-root]") as HTMLElement;
  return { doc, ref, root, ...utils };
}

const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 15));
  });
const editor = (c: HTMLElement) => c.querySelector<HTMLElement>(".ProseMirror");
const dbl = (root: HTMLElement, x: number, y: number) => fireEvent.doubleClick(root, { clientX: x, clientY: y });
const down = (root: HTMLElement, x: number, y: number) =>
  fireEvent.pointerDown(root, { pointerId: 1, pointerType: "mouse", button: 0, buttons: 1, clientX: x, clientY: y });
const up = (root: HTMLElement, x: number, y: number) =>
  fireEvent.pointerUp(root, { pointerId: 1, pointerType: "mouse", button: 0, buttons: 0, clientX: x, clientY: y });

describe("starting and ending text editing on the canvas", () => {
  it("double-clicking a sticky, a text, or a shape opens the editor for that object only", async () => {
    const { ref, root, container } = await mount();
    expect(editor(container)).toBeNull();
    act(() => dbl(root, 150, 150));
    await settle();
    expect(ref.current!.editing.id).toBe("note");
    expect(container.querySelectorAll(".ProseMirror")).toHaveLength(1);
    expect(editor(container)!.closest('[data-object-id="note"]')).not.toBeNull();
    expect([...ref.current!.selection.ids]).toEqual(["note"]);

    act(() => dbl(root, 450, 110));
    await settle();
    expect(ref.current!.editing.id).toBe("label");
    expect(container.querySelectorAll(".ProseMirror")).toHaveLength(1);
    expect(editor(container)!.closest('[data-object-id="label"]')).not.toBeNull();

    act(() => dbl(root, 200, 450));
    await settle();
    expect(ref.current!.editing.id).toBe("box");
    expect(editor(container)!.closest('[data-object-id="box"]')).not.toBeNull();
  });

  it("double-clicking an image or empty canvas edits nothing", async () => {
    const { ref, root, container } = await mount();
    act(() => dbl(root, 750, 150));
    act(() => dbl(root, 900, 780));
    await settle();
    expect(ref.current!.editing.id).toBeNull();
    expect(editor(container)).toBeNull();
  });

  it("double-clicking a frame's name edits the name, not its body", async () => {
    const { ref, root, container, doc } = await mount();
    act(() => dbl(root, 700, 550)); // inside the frame
    expect(ref.current!.editing.id).toBeNull();
    act(() => dbl(root, 510, 390)); // the label above the top-left corner
    await settle();
    expect(ref.current!.editing.id).toBe("slide");
    const input = container.querySelector<HTMLInputElement>('input[aria-label="Frame name"]')!;
    expect(input).not.toBeNull();
    expect(input.value).toBe("Intro");
    fireEvent.change(input, { target: { value: "Opening" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await settle();
    expect((doc.get("slide") as { name: string }).name).toBe("Opening");
    expect(ref.current!.editing.id).toBeNull();
  });

  it("an empty frame name falls back to 'Frame'", async () => {
    const { ref, root, container, doc } = await mount();
    act(() => dbl(root, 510, 390));
    await settle();
    const input = container.querySelector<HTMLInputElement>('input[aria-label="Frame name"]')!;
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    await settle();
    expect((doc.get("slide") as { name: string }).name).toBe("Frame");
    expect(ref.current!.editing.id).toBeNull();
  });

  it("Enter on a single selected sticky or text starts editing; on an image it does not", async () => {
    const { ref, root, container } = await mount();
    act(() => ref.current!.selection.set(["note"]));
    fireEvent.keyDown(root, { key: "Enter" });
    await settle();
    expect(ref.current!.editing.id).toBe("note");
    expect(editor(container)).not.toBeNull();

    act(() => ref.current!.editing.stop());
    act(() => ref.current!.selection.set(["pic"]));
    fireEvent.keyDown(root, { key: "Enter" });
    expect(ref.current!.editing.id).toBeNull();

    act(() => ref.current!.selection.set(["note", "label"]));
    fireEvent.keyDown(root, { key: "Enter" });
    expect(ref.current!.editing.id).toBeNull();
  });

  it("typing a character on a selected sticky starts editing with that character", async () => {
    const { ref, root, container, doc } = await mount();
    act(() => ref.current!.selection.set(["note"]));
    fireEvent.keyDown(root, { key: "h" });
    await settle();
    await settle();
    expect(ref.current!.editing.id).toBe("note");
    await waitFor(() => expect(richTextToPlainLines(doc.content("note")!)).toEqual(["h"]));
    expect(editor(container)).not.toBeNull();
  });

  it("typing on a selected text box or with a modifier does not start editing", async () => {
    const { ref, root } = await mount();
    act(() => ref.current!.selection.set(["label"]));
    fireEvent.keyDown(root, { key: "h" });
    expect(ref.current!.editing.id).toBeNull();
    act(() => ref.current!.selection.set(["note"]));
    fireEvent.keyDown(root, { key: "c", metaKey: true });
    fireEvent.keyDown(root, { key: "c", ctrlKey: true });
    expect(ref.current!.editing.id).toBeNull();
  });

  it("Escape closes the editor and returns the keyboard to the canvas", async () => {
    const { ref, root, container } = await mount();
    act(() => dbl(root, 150, 150));
    await settle();
    const pm = editor(container)!;
    fireEvent.keyDown(pm, { key: "Escape" });
    await settle();
    expect(ref.current!.editing.id).toBeNull();
    expect(editor(container)).toBeNull();
    expect(document.activeElement).toBe(root);
    expect([...ref.current!.selection.ids]).toEqual(["note"]); // still selected
  });

  it("a press on the canvas outside the editor ends editing; a press inside it does not", async () => {
    const { ref, root, container } = await mount();
    act(() => dbl(root, 150, 150));
    await settle();
    const pm = editor(container)!;
    fireEvent.pointerDown(pm, { pointerId: 1, pointerType: "mouse", button: 0, buttons: 1, clientX: 150, clientY: 150 });
    fireEvent.pointerUp(pm, { pointerId: 1, pointerType: "mouse", button: 0, buttons: 0, clientX: 150, clientY: 150 });
    expect(ref.current!.editing.id).toBe("note");
    // the editor was not treated as a canvas gesture: nothing moved, selection unchanged
    expect([...ref.current!.selection.ids]).toEqual(["note"]);
    act(() => down(root, 850, 700));
    act(() => up(root, 850, 700));
    expect(ref.current!.editing.id).toBeNull();
    expect(editor(container)).toBeNull();
  });

  it("keys typed in the editor are not taken by the canvas (no tool shortcuts, no camera shortcuts)", async () => {
    const { ref, root, container } = await mount();
    act(() => dbl(root, 150, 150));
    await settle();
    const pm = editor(container)!;
    const before = ref.current!.getCamera();
    const ev = new KeyboardEvent("keydown", { key: "1", shiftKey: true, bubbles: true, cancelable: true });
    pm.dispatchEvent(ev);
    expect(ref.current!.getCamera()).toEqual(before);
    const space = new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true, cancelable: true });
    pm.dispatchEvent(space);
    expect(space.defaultPrevented).toBe(false);
  });

  it("selection handles are hidden while the text is edited and come back afterwards", async () => {
    const { ref, root, container } = await mount();
    act(() => dbl(root, 150, 150));
    await settle();
    expect(container.querySelector("[data-selection-box]")).not.toBeNull();
    expect(container.querySelector("[data-handle]")).toBeNull();
    fireEvent.keyDown(editor(container)!, { key: "Escape" });
    await settle();
    expect(ref.current!.editing.id).toBeNull();
    expect(container.querySelector("[data-handle]")).not.toBeNull();
  });

  it("switching tools ends editing", async () => {
    const { ref, root } = await mount();
    act(() => dbl(root, 150, 150));
    await settle();
    expect(ref.current!.editing.id).toBe("note");
    act(() => ref.current!.tools.setTool("hand"));
    expect(ref.current!.editing.id).toBeNull();
  });

  it("deleting or undoing away the object being edited closes the editor", async () => {
    const { ref, root, doc, container } = await mount();
    act(() => dbl(root, 150, 150));
    await settle();
    act(() => doc.remove(["note"]));
    await settle();
    expect(ref.current!.editing.id).toBeNull();
    expect(editor(container)).toBeNull();
  });
});

describe("creating text and stickies", () => {
  it("the sticky tool creates a sticky, opens the editor, and typing lands in it; Select is active again", async () => {
    const { ref, root, container, doc } = await mount([]);
    act(() => ref.current!.tools.setTool("sticky"));
    act(() => down(root, 300, 300));
    act(() => up(root, 300, 300));
    await settle();
    const sticky = doc.all().find((o) => o.type === "sticky")!;
    expect(ref.current!.tools.id).toBe("select");
    expect(ref.current!.editing.id).toBe(sticky.id);
    expect(editor(container)).not.toBeNull();
    expect(sticky).toMatchObject({ w: 200, h: 200 });
  });

  it("a locked sticky tool stays active after creating one", async () => {
    const { ref, root } = await mount([]);
    act(() => ref.current!.tools.setTool("sticky"));
    ref.current!.tools.locked = true;
    act(() => down(root, 300, 300));
    act(() => up(root, 300, 300));
    expect(ref.current!.tools.id).toBe("sticky");
    act(() => down(root, 600, 300));
    act(() => up(root, 600, 300));
    expect(ref.current!.tools.id).toBe("sticky");
    expect(ref.current!.tools.locked).toBe(true);
  });

  it("the text tool creates an empty box; leaving it empty removes it again", async () => {
    const { ref, root, doc } = await mount([]);
    act(() => ref.current!.tools.setTool("text"));
    act(() => down(root, 300, 300));
    act(() => up(root, 300, 300));
    await settle();
    expect(doc.all().filter((o) => o.type === "text")).toHaveLength(1);
    expect(ref.current!.editing.id).not.toBeNull();
    act(() => down(root, 800, 700)); // click outside
    act(() => up(root, 800, 700));
    await settle();
    expect(doc.all()).toHaveLength(0);
    expect(doc.canUndo()).toBe(false);
  });

  it("Escape from the editor of an empty text box removes the box", async () => {
    const { ref, root, container, doc } = await mount([]);
    act(() => ref.current!.tools.setTool("text"));
    act(() => down(root, 300, 300));
    act(() => up(root, 300, 300));
    await settle();
    fireEvent.keyDown(editor(container)!, { key: "Escape" });
    await settle();
    expect(doc.all()).toHaveLength(0);
    expect(ref.current!.editing.id).toBeNull();
  });
});
