import { act, fireEvent, render } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { MAX_ZOOM, MIN_ZOOM } from "@/lib/engine/geometry/camera";
import { defaultsFor } from "@/lib/engine/model/defaults";
import type { NewObject } from "@/lib/engine/model/types";
import { DEFAULT_NAV_SETTINGS } from "@/lib/settings";
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

async function mount(doc = new BoardDoc(), props: Partial<Parameters<typeof CanvasView>[0]> = {}) {
  const ref = createRef<CanvasHandle>();
  const utils = render(<CanvasView ref={ref} doc={doc} assets={noAssets} initialCamera={{ x: 0, y: 0, z: 1 }} {...props} />);
  await act(async () => {});
  const root = utils.container.querySelector("[data-canvas-root]") as HTMLElement;
  return { ref, root, ...utils };
}

const finite = (c: { x: number; y: number; z: number }) => [c.x, c.y, c.z].every(Number.isFinite);

describe("CanvasView input", () => {
  it("is a pointer-driven surface: touch-action none, focusable, and prevents the default of every wheel event", async () => {
    const { root } = await mount();
    expect(root.style.touchAction).toBe("none");
    expect(root.tabIndex).toBe(0);
    const ev = new WheelEvent("wheel", { deltaY: 10, cancelable: true, bubbles: true });
    root.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });

  it("a mouse wheel (line mode) zooms around the cursor; the point under the cursor stays put", async () => {
    const { ref, root } = await mount();
    act(() => {
      fireEvent.wheel(root, { deltaY: -3, deltaMode: 1, clientX: 400, clientY: 300 });
    });
    const c = ref.current!.getCamera();
    expect(c.z).toBeGreaterThan(1);
    expect(400 / c.z + c.x).toBeCloseTo(400, 6);
    expect(300 / c.z + c.y).toBeCloseTo(300, 6);
  });

  it("trackpad scrolling (small pixel deltas) pans, and ctrl+wheel (pinch) zooms", async () => {
    const { ref, root } = await mount();
    act(() => {
      fireEvent.wheel(root, { deltaX: 10, deltaY: 20.5 });
    });
    expect(ref.current!.getCamera()).toEqual({ x: 10, y: 20.5, z: 1 });
    act(() => {
      fireEvent.wheel(root, { deltaY: -4, ctrlKey: true, clientX: 0, clientY: 0 });
    });
    expect(ref.current!.getCamera().z).toBeGreaterThan(1);
  });

  it("settings decide: locked + pan makes a notchy mouse wheel pan", async () => {
    const { ref, root } = await mount(new BoardDoc(), { settings: { ...DEFAULT_NAV_SETTINGS, wheel: "pan", locked: true } });
    act(() => {
      fireEvent.wheel(root, { deltaY: 100 });
    });
    expect(ref.current!.getCamera()).toEqual({ x: 0, y: 100, z: 1 });
  });

  it("extreme wheel deltas (10^4 up to 10^300) keep the camera finite and the zoom in range", async () => {
    const { ref, root } = await mount();
    for (const deltaY of [1e4, -1e4, 1e9, -1e9, 1e300, -1e300]) {
      for (const deltaMode of [0, 1, 2]) {
        act(() => {
          fireEvent.wheel(root, { deltaY, deltaX: deltaY, deltaMode, ctrlKey: deltaMode === 0, clientX: 500, clientY: 400 });
        });
        const c = ref.current!.getCamera();
        expect(finite(c)).toBe(true);
        expect(c.z).toBeGreaterThanOrEqual(MIN_ZOOM);
        expect(c.z).toBeLessThanOrEqual(MAX_ZOOM);
      }
    }
  });

  it("Space-drag pans with the pointer, and the cursor shows grab then grabbing", async () => {
    const { ref, root } = await mount();
    fireEvent.keyDown(root, { key: " ", code: "Space" });
    expect(root.style.cursor).toBe("grab");
    fireEvent.pointerDown(root, { pointerId: 1, pointerType: "mouse", button: 0, clientX: 300, clientY: 300 });
    expect(root.style.cursor).toBe("grabbing");
    fireEvent.pointerMove(root, { pointerId: 1, pointerType: "mouse", clientX: 250, clientY: 280 });
    expect(ref.current!.getCamera()).toEqual({ x: 50, y: 20, z: 1 }); // content follows the pointer
    fireEvent.pointerUp(root, { pointerId: 1, pointerType: "mouse", clientX: 250, clientY: 280 });
    fireEvent.pointerMove(root, { pointerId: 1, pointerType: "mouse", clientX: 100, clientY: 100 });
    expect(ref.current!.getCamera()).toEqual({ x: 50, y: 20, z: 1 }); // no longer panning
    fireEvent.keyUp(root, { key: " ", code: "Space" });
    expect(root.style.cursor).toBe("default"); // back to the Select tool's cursor
  });

  it("a middle-button drag pans without Space", async () => {
    const { ref, root } = await mount();
    fireEvent.pointerDown(root, { pointerId: 2, pointerType: "mouse", button: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(root, { pointerId: 2, pointerType: "mouse", clientX: 90, clientY: 100 });
    expect(ref.current!.getCamera().x).toBe(10);
  });

  it("two touches pinch-zoom around their midpoint and drag-pan together; a third touch is ignored", async () => {
    const { ref, root } = await mount();
    fireEvent.pointerDown(root, { pointerId: 1, pointerType: "touch", button: 0, clientX: 400, clientY: 400 });
    fireEvent.pointerDown(root, { pointerId: 2, pointerType: "touch", button: 0, clientX: 600, clientY: 400 });
    fireEvent.pointerDown(root, { pointerId: 3, pointerType: "touch", button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(root, { pointerId: 2, pointerType: "touch", clientX: 800, clientY: 400 }); // distance 200 -> 400
    const c = ref.current!.getCamera();
    expect(c.z).toBeCloseTo(2, 6);
    expect(finite(c)).toBe(true);
    fireEvent.pointerMove(root, { pointerId: 3, pointerType: "touch", clientX: 900, clientY: 900 });
    expect(ref.current!.getCamera()).toEqual(c);
  });

  it("pinching both fingers onto the same point (zero distance) leaves a finite camera", async () => {
    const { ref, root } = await mount();
    fireEvent.pointerDown(root, { pointerId: 1, pointerType: "touch", button: 0, clientX: 400, clientY: 400 });
    fireEvent.pointerDown(root, { pointerId: 2, pointerType: "touch", button: 0, clientX: 600, clientY: 400 });
    for (let i = 0; i < 30; i++) {
      fireEvent.pointerMove(root, { pointerId: 2, pointerType: "touch", clientX: 400, clientY: 400 });
      fireEvent.pointerMove(root, { pointerId: 2, pointerType: "touch", clientX: 600, clientY: 400 });
    }
    const c = ref.current!.getCamera();
    expect(finite(c)).toBe(true);
    expect(c.z).toBeGreaterThanOrEqual(MIN_ZOOM);
    expect(c.z).toBeLessThanOrEqual(MAX_ZOOM);
  });

  it("Shift+1 fits all objects, Shift+2 zooms to the selection, Ctrl +/-/0 step the zoom (instantly)", async () => {
    const doc = new BoardDoc();
    doc.createMany([
      { ...defaultsFor("shape"), id: "a", x: 0, y: 0, w: 100, h: 100 } as NewObject,
      { ...defaultsFor("shape"), id: "b", x: 4000, y: 3000, w: 400, h: 300 } as NewObject,
    ]);
    const { ref, root } = await mount(doc);
    fireEvent.keyDown(root, { key: "!", code: "Digit1", shiftKey: true });
    const fit = ref.current!.getCamera();
    expect(fit.z).toBeLessThan(0.25);
    ref.current!.selection.set(["b"]);
    fireEvent.keyDown(root, { key: "@", code: "Digit2", shiftKey: true });
    expect(ref.current!.getCamera().x).toBeGreaterThan(3000);
    fireEvent.keyDown(root, { key: "0", code: "Digit0", ctrlKey: true });
    expect(ref.current!.getCamera().z).toBe(1);
    fireEvent.keyDown(root, { key: "=", code: "Equal", ctrlKey: true });
    expect(ref.current!.getCamera().z).toBeCloseTo(1.25, 9);
    fireEvent.keyDown(root, { key: "-", code: "Minus", metaKey: true });
    expect(ref.current!.getCamera().z).toBeCloseTo(1, 9);
  });

  it("Shift+2 with nothing selected, and Shift+1 on an empty board, do nothing harmful", async () => {
    const { ref, root } = await mount();
    const before = ref.current!.getCamera();
    fireEvent.keyDown(root, { key: "@", code: "Digit2", shiftKey: true });
    expect(ref.current!.getCamera()).toEqual(before);
    fireEvent.keyDown(root, { key: "!", code: "Digit1", shiftKey: true });
    expect(finite(ref.current!.getCamera())).toBe(true);
  });

  it("shortcuts are ignored while typing in an input inside the canvas, and can be switched off", async () => {
    const { ref, root } = await mount();
    const input = document.createElement("input");
    root.appendChild(input);
    fireEvent.keyDown(input, { key: "0", code: "Digit0", ctrlKey: true });
    fireEvent.keyDown(input, { key: " ", code: "Space" });
    expect(root.style.cursor).toBe("");
    const off = await mount(new BoardDoc(), { cameraShortcuts: false });
    off.ref.current!.setCamera({ x: 0, y: 0, z: 3 });
    fireEvent.keyDown(off.root, { key: "0", code: "Digit0", ctrlKey: true });
    expect(off.ref.current!.getCamera().z).toBe(3);
    expect(ref.current!.getCamera().z).toBe(1);
  });

  it("any input cancels a running camera animation", async () => {
    vi.useFakeTimers();
    try {
      const { ref, root } = await mount();
      act(() => ref.current!.setCamera({ x: 5000, y: 0, z: 1 }, { animate: true }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });
      fireEvent.wheel(root, { deltaX: 1, deltaY: 1 });
      const stopped = ref.current!.getCamera();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(600);
      });
      expect(ref.current!.getCamera()).toEqual(stopped);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("CanvasView tools and overlays", () => {
  const box = (id: string, x: number, y: number): NewObject => ({ ...defaultsFor("shape"), id, x, y, w: 100, h: 80 }) as NewObject;
  const docWith = (...objs: NewObject[]) => {
    const doc = new BoardDoc();
    doc.createMany(objs);
    return doc;
  };

  it("clicking selects, the overlay shows the box with 8 handles and the rotate dot, dragging moves", async () => {
    const doc = docWith(box("a", 100, 100));
    const { ref, root, container } = await mount(doc);
    fireEvent.pointerDown(root, { pointerId: 1, pointerType: "mouse", button: 0, buttons: 1, clientX: 150, clientY: 140 });
    fireEvent.pointerUp(root, { pointerId: 1, pointerType: "mouse", button: 0, buttons: 0, clientX: 150, clientY: 140 });
    expect([...ref.current!.selection.ids]).toEqual(["a"]);
    const handles = [...container.querySelectorAll("[data-selection-overlay] [data-handle]")].map((h) => h.getAttribute("data-handle"));
    expect(handles.sort()).toEqual(["e", "n", "ne", "nw", "rotate", "s", "se", "sw", "w"]);

    fireEvent.pointerDown(root, { pointerId: 1, pointerType: "mouse", button: 0, buttons: 1, clientX: 150, clientY: 140 });
    fireEvent.pointerMove(root, { pointerId: 1, pointerType: "mouse", buttons: 1, clientX: 200, clientY: 190 });
    fireEvent.pointerMove(root, { pointerId: 1, pointerType: "mouse", buttons: 1, clientX: 250, clientY: 240 });
    fireEvent.pointerUp(root, { pointerId: 1, pointerType: "mouse", button: 0, buttons: 0, clientX: 250, clientY: 240 });
    expect(doc.get("a")).toMatchObject({ x: 200, y: 200 });
  });

  it("the rotate handle is drawn in the accent colour from tokens only (no raw colours)", async () => {
    const doc = docWith(box("a", 100, 100));
    const { ref, container } = await mount(doc);
    act(() => ref.current!.selection.set(["a"]));
    const dot = container.querySelector('[data-handle="rotate"]')!;
    expect(dot.getAttribute("fill")).toBe("var(--color-selection)");
    expect(container.querySelector("[data-selection-box]")!.getAttribute("stroke")).toBe("var(--color-selection)");
  });

  it("a marquee drag on empty space shows the marquee and selects what it encloses", async () => {
    const doc = docWith(box("a", 100, 100), box("b", 600, 500));
    const { ref, root, container } = await mount(doc);
    fireEvent.pointerDown(root, { pointerId: 1, pointerType: "mouse", button: 0, buttons: 1, clientX: 50, clientY: 50 });
    fireEvent.pointerMove(root, { pointerId: 1, pointerType: "mouse", buttons: 1, clientX: 300, clientY: 300 });
    expect(container.querySelector("[data-marquee]")).not.toBeNull();
    fireEvent.pointerUp(root, { pointerId: 1, pointerType: "mouse", button: 0, buttons: 0, clientX: 300, clientY: 300 });
    expect(container.querySelector("[data-marquee]")).toBeNull();
    expect([...ref.current!.selection.ids]).toEqual(["a"]);
  });

  it("the hand tool pans with a plain drag; Escape returns to Select", async () => {
    const { ref, root } = await mount(docWith(box("a", 100, 100)));
    act(() => ref.current!.tools.setTool("hand"));
    expect(root.style.cursor).toBe("grab");
    fireEvent.pointerDown(root, { pointerId: 1, pointerType: "mouse", button: 0, buttons: 1, clientX: 300, clientY: 300 });
    fireEvent.pointerMove(root, { pointerId: 1, pointerType: "mouse", buttons: 1, clientX: 280, clientY: 300 });
    fireEvent.pointerUp(root, { pointerId: 1, pointerType: "mouse", button: 0, buttons: 0, clientX: 280, clientY: 300 });
    expect(ref.current!.getCamera().x).toBe(20);
    expect(ref.current!.selection.size).toBe(0);
    fireEvent.keyDown(root, { key: "Escape" });
    expect(ref.current!.tools.id).toBe("select");
  });

  it("a second finger landing mid-drag reverts the drag and starts a pinch", async () => {
    const doc = docWith(box("a", 100, 100));
    const { ref, root } = await mount(doc);
    fireEvent.pointerDown(root, { pointerId: 1, pointerType: "touch", button: 0, buttons: 1, clientX: 150, clientY: 140 });
    fireEvent.pointerMove(root, { pointerId: 1, pointerType: "touch", buttons: 1, clientX: 152, clientY: 140 }); // under the 6 px touch threshold
    fireEvent.pointerDown(root, { pointerId: 2, pointerType: "touch", button: 0, buttons: 1, clientX: 350, clientY: 140 });
    fireEvent.pointerMove(root, { pointerId: 2, pointerType: "touch", buttons: 1, clientX: 550, clientY: 140 });
    expect(doc.get("a")).toMatchObject({ x: 100, y: 100 });
    expect(ref.current!.getCamera().z).toBeGreaterThan(1);
  });

  it("deleting a selected object drops it from the selection", async () => {
    const doc = docWith(box("a", 0, 0), box("b", 300, 0));
    const { ref } = await mount(doc);
    act(() => ref.current!.selection.set(["a", "b"]));
    act(() => doc.remove(["a"]));
    expect([...ref.current!.selection.ids]).toEqual(["b"]);
  });

  it("pen-draws-finger-pans: a touch drag with a drawing tool active pans the canvas", async () => {
    const { ref, root } = await mount(new BoardDoc(), { settings: { ...DEFAULT_NAV_SETTINGS, penOnlyDraws: true } });
    act(() => ref.current!.tools.setTool("pen"));
    fireEvent.pointerDown(root, { pointerId: 1, pointerType: "touch", button: 0, buttons: 1, clientX: 300, clientY: 300 });
    fireEvent.pointerMove(root, { pointerId: 1, pointerType: "touch", buttons: 1, clientX: 250, clientY: 300 });
    expect(ref.current!.getCamera().x).toBe(50);
  });
});
