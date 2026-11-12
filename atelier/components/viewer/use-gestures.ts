"use client";

import { useEffect, useRef, type RefObject } from "react";
import { wheelToZoomFactor } from "@/lib/engine/geometry/camera";
import { PointerTracker } from "@/lib/engine/input/gestures";
import { swipeDirection } from "@/lib/engine/present/swipe";

export interface PointLike {
  clientX: number;
  clientY: number;
  /** Where the press started (before any capture), for finding links and buttons. */
  target: EventTarget | null;
  pointerType: string;
}

export interface GestureHandlers {
  /** Screen px the content should follow (single pointer drag, or the middle of a pinch). */
  pan(dx: number, dy: number): void;
  /** Zoom by `factor` about a client point. */
  zoom(factor: number, at: { clientX: number; clientY: number }): void;
  tap(p: PointLike): void;
  /** Mouse double-click. */
  doubleTap(p: PointLike): void;
  swipe(dir: "next" | "prev"): void;
  /** True while a finger or button is down and moving the view (so pictures do not swap to a smaller tier mid-gesture). */
  moving(active: boolean): void;
}

export interface GestureOptions {
  /** A touch swipe (not a pan) at this moment, e.g. a slide that is not zoomed in. */
  swipeEnabled(): boolean;
  /** Plain wheel pans (true) or does nothing (false); ctrl/meta + wheel and trackpad pinch always zoom. */
  wheelPans?(): boolean;
}

const TAP_MAX_MS = 500;

/**
 * Pointer, wheel and double-click handling for a pannable, zoomable surface, sorted by the same PointerTracker the editor
 * uses (one finger = pan or tap, two fingers = pinch, a third is ignored). Handlers are read through a ref, so passing
 * fresh closures every render is fine.
 */
export function useGestures(ref: RefObject<HTMLElement | null>, handlers: GestureHandlers, opts: GestureOptions): void {
  const h = useRef(handlers);
  const o = useRef(opts);
  useEffect(() => {
    h.current = handlers;
    o.current = opts;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const tracker = new PointerTracker();
    let start: { x: number; y: number; t: number; type: string; target: EventTarget | null } | null = null;
    let last = { x: 0, y: 0 };
    let pinched = false;
    let captured: number | null = null;
    let lastType = "mouse";

    const tp = (e: PointerEvent) => ({ pointerId: e.pointerId, pointerType: e.pointerType || "mouse", x: e.clientX, y: e.clientY });

    const down = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      lastType = e.pointerType || "mouse";
      const r = tracker.down(tp(e));
      if (r === "primary") {
        start = { x: e.clientX, y: e.clientY, t: e.timeStamp, type: e.pointerType || "mouse", target: e.target };
        last = { x: e.clientX, y: e.clientY };
        pinched = false;
      } else if (r === "pinch") {
        pinched = true;
        h.current.moving(true);
      }
    };

    const move = (e: PointerEvent) => {
      const r = tracker.move(tp(e));
      if (r === "primary" && tracker.dragging) {
        if (captured === null) {
          try {
            el.setPointerCapture(e.pointerId);
            captured = e.pointerId;
          } catch {
            /* the pointer is gone */
          }
          h.current.moving(true);
          last = { x: start?.x ?? e.clientX, y: start?.y ?? e.clientY };
        }
        h.current.pan(e.clientX - last.x, e.clientY - last.y);
        last = { x: e.clientX, y: e.clientY };
      } else if (r === "pinch" && tracker.pinch) {
        const p = tracker.pinch;
        h.current.pan(p.dx, p.dy);
        if (p.scale !== 1) h.current.zoom(p.scale, { clientX: p.center.x, clientY: p.center.y });
      }
    };

    const up = (e: PointerEvent, cancelled: boolean) => {
      const wasDragging = tracker.dragging;
      const r = tracker.up({ pointerId: e.pointerId });
      if (captured === e.pointerId) {
        try {
          el.releasePointerCapture(e.pointerId);
        } catch {
          /* already released */
        }
        captured = null;
      }
      if (r === "pinch-end") {
        h.current.moving(false);
        return;
      }
      if (r !== "primary" || !start) return;
      const s = start;
      start = null;
      h.current.moving(false);
      if (cancelled || pinched) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      const dt = e.timeStamp - s.t;
      if (wasDragging) {
        if (s.type !== "mouse" && o.current.swipeEnabled()) {
          const dir = swipeDirection(dx, dy, dt);
          if (dir) h.current.swipe(dir);
        }
        return;
      }
      if (dt <= TAP_MAX_MS) h.current.tap({ clientX: e.clientX, clientY: e.clientY, target: s.target, pointerType: s.type });
    };
    const onUp = (e: PointerEvent) => up(e, false);
    const onCancel = (e: PointerEvent) => up(e, true);

    const wheel = (e: WheelEvent) => {
      const zoomIntent = e.ctrlKey || e.metaKey;
      if (zoomIntent) {
        e.preventDefault();
        h.current.zoom(wheelToZoomFactor(e.deltaY, e.deltaMode, e.ctrlKey ? 2.5 : 1), { clientX: e.clientX, clientY: e.clientY });
      } else if (o.current.wheelPans?.() ?? true) {
        e.preventDefault();
        const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
        h.current.pan(-e.deltaX * unit, -e.deltaY * unit);
      }
    };

    const dbl = (e: MouseEvent) => {
      if (lastType !== "mouse") return;
      h.current.doubleTap({ clientX: e.clientX, clientY: e.clientY, target: e.target, pointerType: "mouse" });
    };

    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onCancel);
    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("dblclick", dbl);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onCancel);
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("dblclick", dbl);
    };
  }, [ref]);
}
