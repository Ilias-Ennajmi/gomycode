// An interruptible camera move: ease-in-out, 400 ms at most, instant under reduced motion. Pure apart from the
// injected frame scheduler, so the share viewer reuses it with its own camera.
import { clampZoom, type Camera } from "../geometry/camera";
import { easeInOut, interpolateCamera } from "../input/camera-store";
import type { PresentCanvas } from "./controller";

/** SPEC §6: camera moves never take longer than this. */
export const MAX_TRANSITION_MS = 400;

export type AnimatorDeps = {
  get(): Camera;
  set(c: Camera): void;
  viewport(): { w: number; h: number };
  raf?: (cb: (t: number) => void) => number;
  caf?: (id: number) => void;
  now?: () => number;
  /** True when the person asked for reduced motion: moves are then a single jump. */
  reducedMotion?: () => boolean;
};

type Move = { from: Camera; to: Camera; start: number; ms: number; raf: number; resolve(r: "done" | "cancelled"): void };

export class CameraAnimator {
  private move: Move | null = null;
  private readonly raf: (cb: (t: number) => void) => number;
  private readonly caf: (id: number) => void;
  private readonly now: () => number;

  constructor(private readonly d: AnimatorDeps) {
    this.raf = d.raf ?? ((cb) => requestAnimationFrame(cb));
    this.caf = d.caf ?? ((id) => cancelAnimationFrame(id));
    this.now = d.now ?? (() => performance.now());
  }

  get running(): boolean {
    return this.move !== null;
  }

  /**
   * Ease the camera to `target`. A move already running is cancelled (its promise resolves "cancelled") and the new
   * one starts from wherever the camera is now. Resolves "done" once the target is reached.
   */
  animateTo(target: Camera, o: { durationMs?: number } = {}): Promise<"done" | "cancelled"> {
    this.cancel();
    const asked = o.durationMs ?? MAX_TRANSITION_MS;
    const ms = Math.min(MAX_TRANSITION_MS, Number.isFinite(asked) ? asked : MAX_TRANSITION_MS);
    const from = this.d.get();
    const same = from.x === target.x && from.y === target.y && from.z === clampZoom(target.z);
    if (this.d.reducedMotion?.() || ms <= 0 || same) {
      this.d.set(target);
      return Promise.resolve("done");
    }
    return new Promise((resolve) => {
      const m: Move = { from, to: target, start: this.now(), ms, raf: 0, resolve };
      this.move = m;
      const tick = () => {
        if (this.move !== m) return;
        const t = (this.now() - m.start) / m.ms;
        if (t >= 1) {
          this.move = null;
          this.d.set(m.to); // exactly the target, never an interpolated near miss
          m.resolve("done");
          return;
        }
        this.d.set(interpolateCamera(m.from, m.to, this.d.viewport(), easeInOut(t)));
        m.raf = this.raf(tick);
      };
      m.raf = this.raf(tick);
    });
  }

  /** Stop where the camera is. */
  cancel(): void {
    const m = this.move;
    if (!m) return;
    this.move = null;
    this.caf(m.raf);
    m.resolve("cancelled");
  }
}

/** A `PresentCanvas` over a bare camera: the share viewer's way to drive a `PresentationController`. */
export function animatedCanvas(d: AnimatorDeps): PresentCanvas {
  const animator = new CameraAnimator(d);
  return {
    getCamera: () => d.get(),
    setCamera(c, o) {
      if (o?.animate) void animator.animateTo(c);
      else {
        animator.cancel();
        d.set(c);
      }
    },
    viewport: () => d.viewport(),
    cancelCameraAnimation: () => animator.cancel(),
  };
}
