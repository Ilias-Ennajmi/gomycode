// The state of a presentation: which slide, which helpers are on, where the camera was before. No DOM, no document,
// no editor imports: the owner's Present view and the share viewer both drive it with a camera of their own.
import type { Camera } from "../geometry/camera";
import { cameraForSlide, clamp, nextIndex, type Slide } from "./slides";

/** The camera the controller moves. The canvas handle fits; so does `animatedCanvas(...)` for a bare camera. */
export type PresentCanvas = {
  getCamera(): Camera;
  /**
   * Set the camera; `animate` eases it (and the canvas decides how: reduced motion makes it instant). `settle` asks the
   * canvas to draw what is at the new camera at once rather than after its usual debounce (a slide must not flash empty).
   */
  setCamera(c: Camera, opts?: { animate?: boolean; settle?: boolean }): void;
  viewport(): { w: number; h: number };
  /** Stop a running transition where it is. */
  cancelCameraAnimation(): void;
};

export type PresentState = {
  active: boolean;
  index: number;
  count: number;
  /** The control bar is hidden (key U). */
  uiHidden: boolean;
  laser: boolean;
  notesOpen: boolean;
  /** Pan and zoom freely instead of one slide at a time (the camera is the person's again). */
  freeRoam: boolean;
};

export type Move = {
  /**
   * Ease the camera to the slide (350 to 400 ms, interruptible). Default false: keyboard-triggered moves never animate
   * (SPEC §6); swipes, taps, the arrows and the slide strip pass true.
   */
  animate?: boolean;
};

export class PresentationController {
  private readonly slides: Slide[];
  private readonly canvas: PresentCanvas;
  private readonly padding: number | undefined;
  private snapshot: PresentState;
  private before: Camera | null = null;
  private readonly listeners = new Set<() => void>();

  /** `slides` is copied: edits made to the board while presenting do not change the deck. */
  constructor(d: { slides: readonly Slide[]; canvas: PresentCanvas; padding?: number }) {
    this.slides = [...d.slides];
    this.canvas = d.canvas;
    this.padding = d.padding;
    this.snapshot = { active: false, index: 0, count: this.slides.length, uiHidden: false, laser: false, notesOpen: false, freeRoam: false };
  }

  get state(): PresentState {
    return this.snapshot;
  }

  get index(): number {
    return this.snapshot.index;
  }

  /** The deck as it was when this controller was made. */
  get deck(): readonly Slide[] {
    return this.slides;
  }

  current(): Slide | null {
    return this.snapshot.active ? (this.slides[this.snapshot.index] ?? null) : null;
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private set(patch: Partial<PresentState>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const cb of [...this.listeners]) cb();
  }

  private frame(index: number, animate: boolean): void {
    const s = this.slides[index];
    if (!s) return;
    this.canvas.cancelCameraAnimation();
    this.canvas.setCamera(cameraForSlide(s, this.canvas.viewport(), this.padding), { animate, settle: true });
  }

  /** Begin at slide `index` (default the first). Remembers the camera to restore on exit. False when there are no slides. */
  start(index = 0): boolean {
    if (this.slides.length === 0) return false;
    const i = clamp(index, this.slides.length);
    if (!this.snapshot.active) this.before = this.canvas.getCamera();
    this.set({ active: true, index: i, freeRoam: false });
    this.frame(i, false);
    return true;
  }

  goTo(i: number, o: Move = {}): void {
    if (!this.snapshot.active) return;
    const index = clamp(i, this.slides.length);
    this.set({ index, freeRoam: false });
    this.frame(index, !!o.animate);
  }

  next(o?: Move): void {
    this.step(1, o);
  }

  prev(o?: Move): void {
    this.step(-1, o);
  }

  private step(dir: 1 | -1, o: Move = {}): void {
    if (!this.snapshot.active) return;
    const to = nextIndex(this.snapshot.index, this.slides.length, dir);
    if (to === this.snapshot.index && !this.snapshot.freeRoam) return; // the end of the deck: no wrap, nothing moves
    this.goTo(to, o);
  }

  first(o?: Move): void {
    this.goTo(0, o);
  }

  last(o?: Move): void {
    this.goTo(this.slides.length - 1, o);
  }

  /** Any user input (a press, a wheel turn) ends a running transition where it is. */
  interrupt(): void {
    this.canvas.cancelCameraAnimation();
  }

  /** The viewport changed size (resize, rotation): frame the slide again, instantly. Not while roaming freely. */
  refit(): void {
    if (this.snapshot.active && !this.snapshot.freeRoam) this.frame(this.snapshot.index, false);
  }

  toggleFreeRoam(): void {
    if (!this.snapshot.active) return;
    const freeRoam = !this.snapshot.freeRoam;
    this.set({ freeRoam });
    if (!freeRoam) this.frame(this.snapshot.index, false);
  }

  toggleUi(): void {
    this.set({ uiHidden: !this.snapshot.uiHidden });
  }

  toggleLaser(): void {
    this.set({ laser: !this.snapshot.laser });
  }

  toggleNotes(): void {
    this.set({ notesOpen: !this.snapshot.notesOpen });
  }

  /** Leave: restore the camera from before `start`. Instant unless `animate`. */
  exit(o: Move = {}): void {
    if (!this.snapshot.active) return;
    this.canvas.cancelCameraAnimation();
    const back = this.before;
    this.before = null;
    this.set({ active: false, laser: false, uiHidden: false, freeRoam: false });
    if (back) this.canvas.setCamera(back, { animate: !!o.animate, settle: true });
  }
}
