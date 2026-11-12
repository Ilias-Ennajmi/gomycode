import { describe, expect, it } from "vitest";
import type { Camera } from "@/lib/engine/geometry/camera";
import { CameraAnimator, MAX_TRANSITION_MS, animatedCanvas } from "@/lib/engine/present/animator";

/** A manual clock: `step(ms)` advances time and runs the queued frame callbacks once. */
function clock() {
  let t = 0;
  let next = 1;
  const queue = new Map<number, (t: number) => void>();
  return {
    now: () => t,
    raf: (cb: (t: number) => void) => {
      const id = next++;
      queue.set(id, cb);
      return id;
    },
    caf: (id: number) => void queue.delete(id),
    step(ms: number) {
      t += ms;
      const run = [...queue.values()];
      queue.clear();
      for (const cb of run) cb(t);
    },
    pending: () => queue.size,
  };
}

function rig(opts: { reduced?: boolean } = {}) {
  const c = clock();
  let cam: Camera = { x: 0, y: 0, z: 1 };
  const sets: Camera[] = [];
  const a = new CameraAnimator({
    get: () => cam,
    set: (n) => {
      cam = n;
      sets.push(n);
    },
    viewport: () => ({ w: 1000, h: 800 }),
    raf: c.raf,
    caf: c.caf,
    now: c.now,
    reducedMotion: () => !!opts.reduced,
  });
  return { a, c, cam: () => cam, sets };
}

describe("CameraAnimator", () => {
  it("reaches the target at 400 ms exactly and never overshoots", async () => {
    const r = rig();
    const target = { x: 2000, y: -500, z: 0.25 };
    const done = r.a.animateTo(target);
    expect(r.a.running).toBe(true);
    for (let i = 0; i < 24; i++) r.c.step(16);
    expect(r.cam()).not.toEqual(target);
    r.c.step(16);
    expect(await done).toBe("done");
    expect(r.cam()).toEqual(target);
    expect(r.a.running).toBe(false);
    expect(r.c.pending()).toBe(0);
  });

  it("caps the duration at 400 ms even when 5 s is asked", async () => {
    expect(MAX_TRANSITION_MS).toBe(400);
    const r = rig();
    const done = r.a.animateTo({ x: 100, y: 0, z: 1 }, { durationMs: 5000 });
    r.c.step(200);
    expect(r.a.running).toBe(true);
    r.c.step(201);
    expect(await done).toBe("done");
    expect(r.cam().x).toBe(100);
  });

  it("moves monotonically towards the target with ease-in-out", () => {
    const r = rig();
    void r.a.animateTo({ x: 1000, y: 0, z: 1 });
    const xs: number[] = [];
    for (let i = 0; i < 10; i++) {
      r.c.step(40);
      xs.push(r.cam().x);
    }
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThanOrEqual(xs[i - 1]);
    expect(xs[0]).toBeLessThan(100); // slow start
    expect(xs[4] - xs[3]).toBeGreaterThan(xs[1] - xs[0]); // faster in the middle
  });

  it("a second animateTo mid-flight resolves the first 'cancelled' and continues from the current camera", async () => {
    const r = rig();
    const first = r.a.animateTo({ x: 1000, y: 0, z: 1 });
    r.c.step(200);
    const mid = r.cam();
    expect(mid.x).toBeGreaterThan(0);
    const second = r.a.animateTo({ x: -1000, y: 0, z: 1 });
    expect(await first).toBe("cancelled");
    r.c.step(16);
    // the second move starts at `mid`, not at the first move's origin or target
    expect(Math.abs(r.cam().x - mid.x)).toBeLessThan(60);
    r.c.step(400);
    expect(await second).toBe("done");
    expect(r.cam().x).toBe(-1000);
  });

  it("cancel() stops where the camera is and resolves 'cancelled'", async () => {
    const r = rig();
    const p = r.a.animateTo({ x: 1000, y: 0, z: 1 });
    r.c.step(150);
    const at = r.cam();
    r.a.cancel();
    expect(await p).toBe("cancelled");
    expect(r.a.running).toBe(false);
    r.c.step(500);
    expect(r.cam()).toEqual(at);
  });

  it("cancel() with nothing running is harmless", () => {
    const r = rig();
    expect(() => r.a.cancel()).not.toThrow();
  });

  it("reduced motion jumps in one set and resolves done", async () => {
    const r = rig({ reduced: true });
    const target = { x: 500, y: 500, z: 2 };
    expect(await r.a.animateTo(target)).toBe("done");
    expect(r.sets).toEqual([target]);
    expect(r.a.running).toBe(false);
    expect(r.c.pending()).toBe(0);
  });

  it("a zero or negative duration is an instant move", async () => {
    const r = rig();
    expect(await r.a.animateTo({ x: 9, y: 9, z: 1 }, { durationMs: 0 })).toBe("done");
    expect(r.cam().x).toBe(9);
  });

  it("an animation to where the camera already is finishes without frames", async () => {
    const r = rig();
    expect(await r.a.animateTo({ x: 0, y: 0, z: 1 })).toBe("done");
    expect(r.c.pending()).toBe(0);
  });
});

describe("animatedCanvas", () => {
  it("drives a bare camera: animate eases, otherwise it jumps, and cancel stops", async () => {
    const c = clock();
    let cam: Camera = { x: 0, y: 0, z: 1 };
    const canvas = animatedCanvas({ get: () => cam, set: (n) => (cam = n), viewport: () => ({ w: 800, h: 600 }), raf: c.raf, caf: c.caf, now: c.now });
    expect(canvas.viewport()).toEqual({ w: 800, h: 600 });
    canvas.setCamera({ x: 100, y: 0, z: 1 });
    expect(cam.x).toBe(100);
    canvas.setCamera({ x: 500, y: 0, z: 1 }, { animate: true });
    c.step(200);
    expect(cam.x).toBeGreaterThan(100);
    expect(cam.x).toBeLessThan(500);
    canvas.cancelCameraAnimation();
    const at = cam;
    c.step(500);
    expect(cam).toEqual(at);
    expect(canvas.getCamera()).toEqual(at);
  });
});
