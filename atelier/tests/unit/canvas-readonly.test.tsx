import { act, fireEvent, render } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { SelectionStore } from "@/lib/engine/input/selection-store";
import { defaultsFor } from "@/lib/engine/model/defaults";
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
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const shape = (id: string, x: number, y: number): NewObject => ({ ...defaultsFor("shape"), id, x, y, w: 200, h: 200 }) as NewObject;

async function mount(props: Partial<Parameters<typeof CanvasView>[0]> = {}) {
  const doc = new BoardDoc();
  doc.create(shape("a", 100, 100));
  const ref = createRef<CanvasHandle>();
  const selection = new SelectionStore();
  const utils = render(<CanvasView ref={ref} doc={doc} selection={selection} assets={noAssets} initialCamera={{ x: 0, y: 0, z: 1 }} {...props} />);
  await act(async () => {});
  const root = utils.container.querySelector("[data-canvas-root]") as HTMLElement;
  return { ref, root, doc, selection, ...utils };
}

const drag = (root: HTMLElement, from: [number, number], to: [number, number], type = "mouse") => {
  fireEvent.pointerDown(root, { pointerId: 1, pointerType: type, button: 0, buttons: 1, clientX: from[0], clientY: from[1] });
  fireEvent.pointerMove(root, { pointerId: 1, pointerType: type, buttons: 1, clientX: to[0], clientY: to[1] });
  fireEvent.pointerUp(root, { pointerId: 1, pointerType: type, clientX: to[0], clientY: to[1] });
};

describe("CanvasView readOnly", () => {
  it("is marked read-only for assistive tech and tests", async () => {
    const { root } = await mount({ readOnly: true });
    expect(root.dataset.readOnly).toBe("true");
    const { root: editable } = await mount();
    expect(editable.dataset.readOnly).toBeUndefined();
  });

  it("a press-drag on an object pans the view instead of selecting or moving it", async () => {
    const { ref, root, doc, selection } = await mount({ readOnly: true });
    drag(root, [150, 150], [100, 120]);
    expect(ref.current!.getCamera()).toEqual({ x: 50, y: 30, z: 1 }); // content follows the pointer
    expect(selection.size).toBe(0);
    expect(doc.get("a")).toMatchObject({ x: 100, y: 100 });
  });

  it("the same drag in an editable canvas selects and moves (control)", async () => {
    const { ref, root, selection } = await mount();
    drag(root, [150, 150], [200, 200]);
    expect(selection.has("a")).toBe(true);
    expect(ref.current!.getCamera()).toEqual({ x: 0, y: 0, z: 1 });
  });

  it("a finger drags to pan and the wheel still zooms", async () => {
    const { ref, root } = await mount({ readOnly: true });
    drag(root, [300, 300], [250, 300], "touch");
    expect(ref.current!.getCamera().x).toBe(50);
    act(() => {
      fireEvent.wheel(root, { deltaY: -4, ctrlKey: true, clientX: 500, clientY: 400 });
    });
    expect(ref.current!.getCamera().z).toBeGreaterThan(1);
  });

  it("tool keys, Delete and Escape do nothing to the board", async () => {
    const { ref, root, doc, selection } = await mount({ readOnly: true });
    selection.set(["a"]);
    const onKey = vi.fn(() => true);
    ref.current!.tools.tool!.onKey = onKey;
    for (const key of ["v", "h", "r", "Delete", "Backspace", "Escape", "Enter"]) fireEvent.keyDown(root, { key });
    expect(onKey).not.toHaveBeenCalled();
    expect(doc.get("a")).toBeTruthy();
    expect(ref.current!.tools.id).toBe("select");
  });

  it("a double click does not start editing", async () => {
    const { ref, root } = await mount({ readOnly: true });
    fireEvent.dblClick(root, { clientX: 150, clientY: 150 });
    expect(ref.current!.editing.id).toBeNull();
  });

  it("the context menu is suppressed before any chrome hears it", async () => {
    const { root } = await mount({ readOnly: true });
    const chrome = vi.fn();
    root.addEventListener("contextmenu", chrome);
    const ev = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 150, clientY: 150 });
    root.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(chrome).not.toHaveBeenCalled();
  });

  it("draws no selection overlay, even for a selected object", async () => {
    const { selection, container } = await mount({ readOnly: true });
    selection.set(["a"]);
    await act(async () => {});
    expect(container.querySelector("[data-selection-overlay]")).toBeNull();
  });

  it("the camera shortcuts still work (Ctrl+0 fits)", async () => {
    const { ref, root } = await mount({ readOnly: true });
    act(() => ref.current!.setCamera({ x: 900, y: 900, z: 4 }));
    fireEvent.keyDown(root, { key: "1", code: "Digit1", shiftKey: true });
    expect(ref.current!.getCamera()).not.toEqual({ x: 900, y: 900, z: 4 });
  });

  it("handle.setReadOnly switches it on and off at runtime and stops editing", async () => {
    const { ref, root, selection } = await mount();
    selection.set(["a"]);
    ref.current!.editing.start("a");
    act(() => ref.current!.setReadOnly(true));
    expect(root.dataset.readOnly).toBe("true");
    expect(ref.current!.editing.id).toBeNull();
    drag(root, [150, 150], [100, 100]);
    expect(ref.current!.getCamera().x).toBe(50);
    act(() => ref.current!.setReadOnly(false));
    expect(root.dataset.readOnly).toBeUndefined();
    drag(root, [150, 150], [160, 160]);
    expect(ref.current!.getCamera().x).toBe(50); // select-drag again: the camera stays
  });

  it("does not show the value-check preview (what is shown is the board)", async () => {
    const { doc, root } = await mount({ readOnly: true });
    doc.meta.valueCheck = true;
    await act(async () => {});
    expect(root.dataset.valueCheck).toBeUndefined();
  });
});

describe("CanvasView settle", () => {
  const far = async () => {
    vi.useFakeTimers();
    const doc = new BoardDoc();
    doc.createMany([shape("near", 0, 0), shape("far", 20_000, 0)]);
    const ref = createRef<CanvasHandle>();
    const utils = render(<CanvasView ref={ref} doc={doc} assets={noAssets} initialCamera={{ x: 0, y: 0, z: 1 }} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const ids = () => [...utils.container.querySelectorAll("[data-object-id]")].map((e) => e.getAttribute("data-object-id"));
    return { ref, ids };
  };

  it("a plain jump is debounced; with settle the objects at the new camera are mounted at once", async () => {
    const a = await far();
    act(() => a.ref.current!.setCamera({ x: 19_900, y: 0, z: 1 }));
    expect(a.ids()).toEqual(["near"]); // not yet: debounced
    act(() => a.ref.current!.setCamera({ x: 19_901, y: 0, z: 1 }, { settle: true }));
    expect(a.ids()).toEqual(["far"]);
    vi.useRealTimers();
  });
});

describe("CanvasView animated camera", () => {
  it("setCamera({ animate }) stays within 400 ms and ends exactly on the target", async () => {
    vi.useFakeTimers();
    const { ref } = await mount();
    act(() => ref.current!.setCamera({ x: 1000, y: 0, z: 1 }, { animate: true }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(399 + 20);
    });
    expect(ref.current!.getCamera()).toEqual({ x: 1000, y: 0, z: 1 });
    vi.useRealTimers();
  });

  it("cancelCameraAnimation stops it where it is", async () => {
    vi.useFakeTimers();
    const { ref } = await mount();
    act(() => ref.current!.setCamera({ x: 1000, y: 0, z: 1 }, { animate: true }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120);
    });
    const mid = ref.current!.getCamera();
    act(() => ref.current!.cancelCameraAnimation());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(ref.current!.getCamera()).toEqual(mid);
    vi.useRealTimers();
  });
});
