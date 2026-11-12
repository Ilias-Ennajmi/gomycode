import { describe, expect, it, vi } from "vitest";
import type { Camera } from "@/lib/engine/geometry/camera";
import { PresentationController, type PresentCanvas } from "@/lib/engine/present/controller";
import { slideCamera, type Slide } from "@/lib/engine/present/slides";

const slides: Slide[] = [
  { id: "a", index: 0, name: "Cover", rect: { x: 0, y: 0, w: 1920, h: 1080 }, notes: "n0" },
  { id: "b", index: 1, name: "Moodboard", rect: { x: 2200, y: 0, w: 1080, h: 1920 }, notes: "n1" },
  { id: "c", index: 2, name: "Close", rect: { x: 5000, y: 100, w: 800, h: 800 }, notes: "" },
];
const VP = { w: 1440, h: 900 };

function rig(list: readonly Slide[] = slides) {
  let cam: Camera = { x: -40, y: -20, z: 0.5 };
  const calls: { cam: Camera; animate: boolean | undefined }[] = [];
  const cancel = vi.fn();
  const canvas: PresentCanvas = {
    getCamera: () => cam,
    setCamera: (c, o) => {
      cam = c;
      calls.push({ cam: c, animate: o?.animate });
    },
    viewport: () => VP,
    cancelCameraAnimation: cancel,
  };
  const c = new PresentationController({ slides: list, canvas });
  return { c, calls, cancel, cam: () => cam, canvas };
}

describe("PresentationController", () => {
  it("starts inactive and describes itself", () => {
    const { c } = rig();
    expect(c.state).toEqual({ active: false, index: 0, count: 3, uiHidden: false, laser: false, notesOpen: false, freeRoam: false });
  });

  it("start(2) frames the third slide without animating", () => {
    const { c, calls } = rig();
    expect(c.start(2)).toBe(true);
    expect(c.state.active).toBe(true);
    expect(c.state.index).toBe(2);
    expect(c.index).toBe(2);
    expect(calls.at(-1)).toEqual({ cam: slideCamera(slides[2].rect, VP), animate: false });
  });

  it("asks the canvas to draw each slide at once (no empty flash), and when it restores the camera", () => {
    let seen: unknown[] = [];
    const cam = { x: 0, y: 0, z: 1 };
    const canvas: PresentCanvas = { getCamera: () => cam, setCamera: (_c, o) => void seen.push(o), viewport: () => VP, cancelCameraAnimation: () => {} };
    const c = new PresentationController({ slides, canvas });
    c.start(0);
    c.next({ animate: true });
    c.exit();
    expect(seen).toEqual([
      { animate: false, settle: true },
      { animate: true, settle: true },
      { animate: false, settle: true },
    ]);
    seen = [];
  });

  it("start() begins at the first slide and clamps a bad index", () => {
    const a = rig();
    a.c.start();
    expect(a.c.index).toBe(0);
    const b = rig();
    b.c.start(99);
    expect(b.c.index).toBe(2);
    const n = rig();
    n.c.start(Number.NaN);
    expect(n.c.index).toBe(0);
  });

  it("does not start with no slides", () => {
    const { c, calls } = rig([]);
    expect(c.start()).toBe(false);
    expect(c.state.active).toBe(false);
    expect(calls).toEqual([]);
  });

  it("works with exactly one slide: next and prev stay put", () => {
    const { c } = rig([slides[0]]);
    expect(c.start()).toBe(true);
    c.next();
    c.prev();
    expect(c.index).toBe(0);
  });

  it("next() on the last slide is a no-op (no wrap), prev() on the first too", () => {
    const { c, calls } = rig();
    c.start(2);
    const n = calls.length;
    c.next();
    expect(c.index).toBe(2);
    expect(calls.length).toBe(n);
    c.start(0);
    const m = calls.length;
    c.prev();
    expect(c.index).toBe(0);
    expect(calls.length).toBe(m);
  });

  it("a keyboard next does not animate and a swipe next does", () => {
    const { c, calls } = rig();
    c.start(0);
    c.next();
    expect(calls.at(-1)).toEqual({ cam: slideCamera(slides[1].rect, VP), animate: false });
    c.next({ animate: true });
    expect(calls.at(-1)).toEqual({ cam: slideCamera(slides[2].rect, VP), animate: true });
    c.prev({ animate: true });
    expect(calls.at(-1)?.animate).toBe(true);
    expect(c.index).toBe(1);
  });

  it("goTo clamps, first/last jump, and nothing happens when not presenting", () => {
    const { c, calls } = rig();
    c.goTo(1);
    expect(calls).toEqual([]);
    c.start(1);
    c.goTo(-5);
    expect(c.index).toBe(0);
    c.last();
    expect(c.index).toBe(2);
    c.first();
    expect(c.index).toBe(0);
    c.goTo(1, { animate: true });
    expect(calls.at(-1)?.animate).toBe(true);
  });

  it("goTo the same slide re-frames it (a pan in free roam is undone)", () => {
    const { c, calls } = rig();
    c.start(1);
    const n = calls.length;
    c.goTo(1);
    expect(calls.length).toBe(n + 1);
  });

  it("every move interrupts a running transition first", () => {
    const { c, cancel } = rig();
    c.start(0);
    cancel.mockClear();
    c.next({ animate: true });
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("interrupt() cancels the camera animation and nothing else", () => {
    const { c, cancel } = rig();
    c.start(0);
    cancel.mockClear();
    c.interrupt();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(c.index).toBe(0);
  });

  it("exit() restores the camera from before start and ends the presentation", () => {
    const { c, cam, calls } = rig();
    const before = cam();
    c.start(1);
    c.next();
    c.exit();
    expect(cam()).toEqual(before);
    expect(calls.at(-1)?.animate).toBe(false);
    expect(c.state.active).toBe(false);
    c.exit(); // twice is harmless
    expect(cam()).toEqual(before);
  });

  it("a second start does not lose the camera from before the first", () => {
    const { c, cam } = rig();
    const before = cam();
    c.start(0);
    c.start(1);
    c.exit();
    expect(cam()).toEqual(before);
  });

  it("toggles the interface, the laser and the notes", () => {
    const { c } = rig();
    c.start();
    c.toggleUi();
    c.toggleLaser();
    c.toggleNotes();
    expect(c.state).toMatchObject({ uiHidden: true, laser: true, notesOpen: true });
    c.toggleUi();
    c.toggleLaser();
    c.toggleNotes();
    expect(c.state).toMatchObject({ uiHidden: false, laser: false, notesOpen: false });
  });

  it("exiting turns the laser off and shows the interface again", () => {
    const { c } = rig();
    c.start();
    c.toggleLaser();
    c.toggleUi();
    c.exit();
    expect(c.state).toMatchObject({ laser: false, uiHidden: false, freeRoam: false });
  });

  it("free roam stops the controller fighting the camera; leaving it re-frames the slide", () => {
    const { c, calls, cam } = rig();
    c.start(1);
    c.toggleFreeRoam();
    expect(c.state.freeRoam).toBe(true);
    const n = calls.length;
    c.refit(); // a resize while roaming leaves the camera alone
    expect(calls.length).toBe(n);
    c.toggleFreeRoam();
    expect(c.state.freeRoam).toBe(false);
    expect(cam()).toEqual(slideCamera(slides[1].rect, VP));
  });

  it("refit() re-frames the current slide instantly after a resize", () => {
    const { c, calls } = rig();
    c.start(1);
    c.refit();
    expect(calls.at(-1)).toEqual({ cam: slideCamera(slides[1].rect, VP), animate: false });
  });

  it("notifies subscribers on every change and stops after unsubscribe", () => {
    const { c } = rig();
    const cb = vi.fn();
    const off = c.subscribe(cb);
    c.start();
    c.next();
    expect(cb).toHaveBeenCalledTimes(2);
    const snapshot = c.state;
    expect(c.state).toBe(snapshot); // stable between changes (useSyncExternalStore)
    off();
    c.next();
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("current() is the slide being shown", () => {
    const { c } = rig();
    expect(c.current()).toBeNull();
    c.start(1);
    expect(c.current()?.name).toBe("Moodboard");
  });

  it("is not changed by later edits to the list it was given (concurrent edits are ignored)", () => {
    const list = [...slides];
    const { c } = rig(list);
    c.start(0);
    list.pop();
    c.last();
    expect(c.index).toBe(2);
  });
});
