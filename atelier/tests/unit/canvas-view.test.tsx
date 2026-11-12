import { act, render } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { defaultsFor } from "@/lib/engine/model/defaults";
import type { NewObject } from "@/lib/engine/model/types";
import { CanvasView, type CanvasHandle } from "@/components/canvas/CanvasView";

const noAssets = { url: () => null, available: () => null };
let resizeCallbacks: Array<() => void> = [];

beforeEach(() => {
  vi.useFakeTimers();
  resizeCallbacks = [];
  class RO {
    constructor(cb: () => void) {
      resizeCallbacks.push(cb);
    }
    observe() {
      queueMicrotask(() => resizeCallbacks.forEach((c) => c()));
    }
    disconnect() {}
    unobserve() {}
  }
  vi.stubGlobal("ResizeObserver", RO);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 800, width: 1000, height: 800, toJSON: () => ({}),
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function box(id: string, x: number, y: number): NewObject {
  return { ...defaultsFor("shape"), id, x, y, w: 100, h: 80 } as NewObject;
}

describe("CanvasView", () => {
  it("writes the camera straight to the layer element and exposes the handle", async () => {
    const doc = new BoardDoc();
    doc.create(box("a", 0, 0));
    const ref = createRef<CanvasHandle>();
    const { container } = render(<CanvasView ref={ref} doc={doc} assets={noAssets} initialCamera={{ x: 0, y: 0, z: 1 }} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const layer = container.querySelector("[data-canvas-layer]") as HTMLElement;
    expect(ref.current!.getCamera()).toEqual({ x: 0, y: 0, z: 1 });
    expect(ref.current!.viewport()).toEqual({ w: 1000, h: 800 });
    expect(ref.current!.container()).toBe(container.firstChild);
    act(() => ref.current!.setCamera({ x: 100, y: 50, z: 2 }));
    expect(layer.style.transform).toBe("translate(-200px, -100px) scale(2)");
    expect(layer.style.getPropertyValue("--inv-zoom")).toBe("0.5");
  });

  it("notifies camera subscribers without re-rendering the objects, and culls after the camera settles", async () => {
    const doc = new BoardDoc();
    doc.createMany([box("near", 0, 0), box("far", 20_000, 0)]);
    const ref = createRef<CanvasHandle>();
    const { container } = render(<CanvasView ref={ref} doc={doc} assets={noAssets} initialCamera={{ x: 0, y: 0, z: 1 }} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const ids = () => [...container.querySelectorAll("[data-object-id]")].map((e) => e.getAttribute("data-object-id"));
    expect(ids()).toEqual(["near"]);
    const seen: number[] = [];
    const off = ref.current!.subscribeCamera((c) => seen.push(c.x));
    act(() => ref.current!.setCamera({ x: 19_900, y: 0, z: 1 }));
    expect(seen).toEqual([19_900]);
    expect(ids()).toEqual(["near"]); // not yet: debounced
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    expect(ids()).toEqual(["far"]);
    off();
  });

  it("places the first camera: fit all objects, or the origin centred when empty", async () => {
    const empty = createRef<CanvasHandle>();
    render(<CanvasView ref={empty} doc={new BoardDoc()} assets={noAssets} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(empty.current!.getCamera()).toEqual({ x: -500, y: -400, z: 1 });

    const doc = new BoardDoc();
    doc.createMany([box("a", 0, 0), box("b", 4000, 3000)]);
    const full = createRef<CanvasHandle>();
    render(<CanvasView ref={full} doc={doc} assets={noAssets} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const cam = full.current!.getCamera();
    expect(cam.z).toBeLessThan(1);
    expect(Number.isFinite(cam.x + cam.y + cam.z)).toBe(true);
  });

  it("animates setCamera and a later setCamera cancels it", async () => {
    const doc = new BoardDoc();
    const ref = createRef<CanvasHandle>();
    render(<CanvasView ref={ref} doc={doc} assets={noAssets} initialCamera={{ x: 0, y: 0, z: 1 }} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    act(() => ref.current!.setCamera({ x: 1000, y: 0, z: 1 }, { animate: true }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120);
    });
    const mid = ref.current!.getCamera().x;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1000);
    act(() => ref.current!.setCamera({ x: 5, y: 5, z: 1 }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(ref.current!.getCamera()).toEqual({ x: 5, y: 5, z: 1 });
  });
});
