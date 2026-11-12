import { describe, expect, it, vi } from "vitest";
import { linkCameras } from "@/lib/engine/rounds/camera-sync";
import type { Camera } from "@/lib/engine/geometry/camera";

/** The part of a canvas handle the sync uses. */
function fakeCanvas(start: Camera = { x: 0, y: 0, z: 1 }) {
  let camera = start;
  const listeners = new Set<(c: Camera) => void>();
  const setCamera = vi.fn((c: Camera) => {
    camera = c;
    for (const cb of [...listeners]) cb(c);
  });
  return {
    handle: { getCamera: () => camera, setCamera, subscribeCamera: (cb: (c: Camera) => void) => (listeners.add(cb), () => listeners.delete(cb)) },
    setCamera,
    listeners,
    move: (c: Camera) => setCamera(c),
  };
}

describe("linkCameras", () => {
  it("moving A moves B in the same tick, and the other way round", () => {
    const a = fakeCanvas();
    const b = fakeCanvas();
    linkCameras(a.handle, b.handle);
    a.move({ x: 10, y: 20, z: 2 });
    expect(b.handle.getCamera()).toEqual({ x: 10, y: 20, z: 2 });
    b.move({ x: -5, y: 0, z: 0.5 });
    expect(a.handle.getCamera()).toEqual({ x: -5, y: 0, z: 0.5 });
  });

  it("does not ping-pong: each move is applied once to the other side", () => {
    const a = fakeCanvas();
    const b = fakeCanvas();
    linkCameras(a.handle, b.handle);
    a.setCamera.mockClear();
    b.setCamera.mockClear();
    a.move({ x: 1, y: 1, z: 1 });
    expect(a.setCamera).toHaveBeenCalledTimes(1); // the move itself, never an echo from B
    expect(b.setCamera).toHaveBeenCalledTimes(1);
  });

  it("makes the two start in step", () => {
    const a = fakeCanvas({ x: 3, y: 4, z: 1.5 });
    const b = fakeCanvas();
    linkCameras(a.handle, b.handle);
    expect(b.handle.getCamera()).toEqual({ x: 3, y: 4, z: 1.5 });
  });

  it("stops when unlinked, leaving no listener behind", () => {
    const a = fakeCanvas();
    const b = fakeCanvas();
    const off = linkCameras(a.handle, b.handle);
    off();
    expect(a.listeners.size).toBe(0);
    expect(b.listeners.size).toBe(0);
    a.move({ x: 9, y: 9, z: 9 });
    expect(b.handle.getCamera()).toEqual({ x: 0, y: 0, z: 1 });
  });
});
