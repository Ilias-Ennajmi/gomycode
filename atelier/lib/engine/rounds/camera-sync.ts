// One camera for two canvases (the compare view): moving either moves the other, in the same tick.
import type { Camera } from "@/lib/engine/geometry/camera";

export interface SyncableCanvas {
  getCamera(): Camera;
  setCamera(c: Camera, opts?: { animate?: boolean; settle?: boolean }): void;
  subscribeCamera(cb: (c: Camera) => void): () => void;
}

const same = (a: Camera, b: Camera) => a.x === b.x && a.y === b.y && a.z === b.z;

/** Puts `b` where `a` is and keeps them together. Returns the function that unlinks them. */
export function linkCameras(a: SyncableCanvas, b: SyncableCanvas): () => void {
  let applying = false;
  const follow = (to: SyncableCanvas) => (c: Camera) => {
    if (applying || same(to.getCamera(), c)) return;
    applying = true;
    try {
      to.setCamera(c);
    } finally {
      applying = false;
    }
  };
  b.setCamera(a.getCamera());
  const offA = a.subscribeCamera(follow(b));
  const offB = b.subscribeCamera(follow(a));
  return () => {
    offA();
    offB();
  };
}
