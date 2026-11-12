import type { BoardDoc } from "../doc/board-doc";
import { fitRect, pinchFactor, panBy, wheelToZoomFactor, zoomAt, type Camera } from "../geometry/camera";
import { boundsOf, unionRects } from "../geometry/rect";
import type { Point } from "../model/types";
import type { NavSettings } from "@/lib/settings";

// ---- wheel ---------------------------------------------------------------------------------------------------

export type WheelLike = { deltaX: number; deltaY: number; deltaMode: number; ctrlKey: boolean; metaKey: boolean };

export type WheelAction =
  | { kind: "zoom"; factor: number }
  /** Screen-space movement of the content: pass straight to `panBy`. */
  | { kind: "pan"; dx: number; dy: number };

const LINE_PX = 16;
const PAGE_PX = 400;
const MAX_PAN_PX = 2000;

function num(v: number): number {
  return Number.isFinite(v) ? v : 0;
}

function pixels(delta: number, mode: number): number {
  const unit = mode === 1 ? LINE_PX : mode === 2 ? PAGE_PX : 1;
  return Math.max(-MAX_PAN_PX, Math.min(MAX_PAN_PX, num(delta) * unit));
}

/**
 * A mouse wheel reports whole notches (deltaMode lines, or whole-number pixel jumps of 50+ with no sideways
 * component); a trackpad reports small, often fractional, pixel deltas and usually a horizontal part.
 */
function isTrackpadLike(e: WheelLike): boolean {
  if (e.deltaMode !== 0) return false;
  const dx = num(e.deltaX);
  const dy = num(e.deltaY);
  return dx !== 0 || !Number.isInteger(dy) || Math.abs(dy) < 50;
}

/** Trackpad pinch sends ctrl+wheel with tiny deltas; give it more gain so a pinch feels like one. */
const PINCH_GAIN = 5;

export function classifyWheel(e: WheelLike, s: NavSettings): WheelAction {
  if (e.ctrlKey || e.metaKey) {
    const dy = num(e.deltaY);
    const pinch = e.deltaMode === 0 && Math.abs(dy) < 50;
    return { kind: "zoom", factor: wheelToZoomFactor(dy, e.deltaMode, s.sensitivity * (pinch ? PINCH_GAIN : 1)) };
  }
  const mode: "zoom" | "pan" = s.locked ? s.wheel : isTrackpadLike(e) ? "pan" : s.wheel;
  if (mode === "zoom") return { kind: "zoom", factor: wheelToZoomFactor(num(e.deltaY), e.deltaMode, s.sensitivity) };
  return { kind: "pan", dx: -pixels(e.deltaX, e.deltaMode) + 0, dy: -pixels(e.deltaY, e.deltaMode) + 0 };
}

export function applyWheelAction(c: Camera, a: WheelAction, at: Point): Camera {
  return a.kind === "zoom" ? zoomAt(c, at, a.factor) : panBy(c, a.dx, a.dy);
}

// ---- pointers ------------------------------------------------------------------------------------------------

/** Screen pixels a pointer must travel before a press becomes a drag. */
export function dragThreshold(pointerType: string): number {
  return pointerType === "touch" ? 6 : 3;
}

export type TrackedPointer = { pointerId: number; pointerType: string; x: number; y: number };

export type PinchState = {
  /** Midpoint of the two touches (screen px). */
  center: Point;
  /** Distance ratio since the previous update, clamped to 0.5..2. */
  scale: number;
  /** Midpoint movement since the previous update. */
  dx: number;
  dy: number;
};

type Down = { x: number; y: number; type: string; startX: number; startY: number };

const valid = (p: TrackedPointer) => Number.isFinite(p.x) && Number.isFinite(p.y);

/**
 * Sorts raw pointer events into one of: a single primary pointer (mouse, pen or one finger), a two-finger pinch, or
 * ignored. Rules: a second touch turns a press that has not yet dragged into a pinch; once a single-pointer drag has
 * started (past the threshold), or a third touch arrives, extra pointers are ignored; after a pinch nothing reacts
 * until every pointer is lifted.
 */
export class PointerTracker {
  private readonly down_ = new Map<number, Down>(); // every pointer that is down, ignored ones included
  private mode: "idle" | "single" | "pinch" | "blocked" = "idle";
  private primary = -1;
  private pair: [number, number] | null = null;
  private drag = false;
  private prev = { distance: 0, center: { x: 0, y: 0 } };
  private pinchState: PinchState | null = null;

  /** True once the primary pointer has moved past the drag threshold. */
  get dragging(): boolean {
    return this.drag;
  }

  get pinch(): PinchState | null {
    return this.pinchState;
  }

  down(e: TrackedPointer): "primary" | "pinch" | "ignored" {
    if (!valid(e)) return "ignored";
    const entry: Down = { x: e.x, y: e.y, type: e.pointerType, startX: e.x, startY: e.y };
    this.down_.set(e.pointerId, entry);
    if (this.mode === "idle") {
      this.mode = "single";
      this.primary = e.pointerId;
      this.drag = false;
      return "primary";
    }
    if (this.mode === "single" && !this.drag && e.pointerType === "touch" && this.down_.get(this.primary)?.type === "touch") {
      this.mode = "pinch";
      this.pair = [this.primary, e.pointerId];
      const m = this.measure();
      this.prev = m;
      this.pinchState = { center: m.center, scale: 1, dx: 0, dy: 0 };
      return "pinch";
    }
    return "ignored";
  }

  move(e: TrackedPointer): "primary" | "pinch" | "hover" | "ignored" {
    const entry = this.down_.get(e.pointerId);
    if (!entry) return "hover";
    if (!valid(e)) return "ignored";
    entry.x = e.x;
    entry.y = e.y;
    if (this.mode === "single" && e.pointerId === this.primary) {
      if (!this.drag && Math.hypot(e.x - entry.startX, e.y - entry.startY) >= dragThreshold(entry.type)) this.drag = true;
      return "primary";
    }
    if (this.mode === "pinch" && this.pair && (e.pointerId === this.pair[0] || e.pointerId === this.pair[1])) {
      const m = this.measure();
      this.pinchState = {
        center: m.center,
        scale: pinchFactor(this.prev.distance, m.distance),
        dx: m.center.x - this.prev.center.x,
        dy: m.center.y - this.prev.center.y,
      };
      this.prev = m;
      return "pinch";
    }
    return "ignored";
  }

  /** Also use for pointercancel. */
  up(e: { pointerId: number }): "primary" | "pinch-end" | "ignored" {
    if (!this.down_.delete(e.pointerId)) return "ignored";
    let result: "primary" | "pinch-end" | "ignored" = "ignored";
    if (this.mode === "single" && e.pointerId === this.primary) {
      result = "primary";
      this.mode = "idle";
      this.drag = false;
    } else if (this.mode === "pinch" && this.pair?.includes(e.pointerId)) {
      result = "pinch-end";
      this.mode = "blocked";
      this.pair = null;
      this.pinchState = null;
    }
    if (this.down_.size === 0) {
      this.mode = "idle";
      this.drag = false;
    }
    return result;
  }

  private measure(): { distance: number; center: Point } {
    const [a, b] = this.pair!.map((id) => this.down_.get(id)!);
    return { distance: Math.hypot(a.x - b.x, a.y - b.y), center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  }
}

// ---- keyboard ------------------------------------------------------------------------------------------------

export type CameraKeyAction = "fit" | "selection" | "zoomIn" | "zoomOut" | "zoom100";

export type KeyLike = { key: string; code: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean };

/** Shift+1 fit, Shift+2 selection, Ctrl/Cmd + - 0. Matched by physical key so they work on any keyboard layout. */
export function cameraKeyAction(e: KeyLike): CameraKeyAction | null {
  const mod = e.ctrlKey || e.metaKey;
  if (e.altKey) return null;
  if (!mod && e.shiftKey) {
    if (e.code === "Digit1" || e.code === "Numpad1") return "fit";
    if (e.code === "Digit2" || e.code === "Numpad2") return "selection";
    return null;
  }
  if (mod) {
    if (e.code === "Equal" || e.code === "NumpadAdd" || e.key === "=" || e.key === "+") return "zoomIn";
    if (!e.shiftKey && (e.code === "Minus" || e.code === "NumpadSubtract" || e.key === "-")) return "zoomOut";
    if (!e.shiftKey && (e.code === "Digit0" || e.code === "Numpad0" || e.key === "0")) return "zoom100";
  }
  return null;
}

export const isSpaceKey = (e: { key: string; code: string }) => e.code === "Space" || e.key === " ";

// ---- camera targets for the shortcuts ---------------------------------------------------------------------------

type Viewport = { w: number; h: number };

const safeViewport = (vp: Viewport): Viewport => ({
  w: Number.isFinite(vp.w) && vp.w > 0 ? vp.w : 1,
  h: Number.isFinite(vp.h) && vp.h > 0 ? vp.h : 1,
});

/** Camera showing everything (never above 100 %); an empty board shows the origin in the middle. */
export function zoomFitCamera(doc: BoardDoc, viewport: Viewport): Camera {
  const vp = safeViewport(viewport);
  const box = unionRects(doc.all().map(boundsOf));
  if (!box) return { x: -vp.w / 2, y: -vp.h / 2, z: 1 };
  return fitRect(box, vp, 64, 1);
}

/** Camera framing the selected objects, or null when none of the ids exist. */
export function zoomSelectionCamera(doc: BoardDoc, ids: ReadonlySet<string>, viewport: Viewport): Camera | null {
  const rects = [...ids].flatMap((id) => {
    const o = doc.get(id);
    return o ? [boundsOf(o)] : [];
  });
  const box = unionRects(rects);
  return box ? fitRect(box, safeViewport(viewport), 64, 4) : null;
}

const STEP = 1.25;

function aroundCentre(c: Camera, viewport: Viewport, factor: number): Camera {
  const vp = safeViewport(viewport);
  return zoomAt(c, { x: vp.w / 2, y: vp.h / 2 }, factor);
}

export function zoomStepCamera(c: Camera, viewport: Viewport, direction: 1 | -1): Camera {
  return aroundCentre(c, viewport, direction > 0 ? STEP : 1 / STEP);
}

export function zoom100Camera(c: Camera, viewport: Viewport): Camera {
  return aroundCentre(c, viewport, 1 / (Number.isFinite(c.z) && c.z > 0 ? c.z : 1));
}
