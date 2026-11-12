"use client";

import { useEffect, useRef, type RefObject } from "react";
import type { BoardDoc } from "@/lib/engine/doc/board-doc";
import { panBy, zoomAt, type Camera } from "@/lib/engine/geometry/camera";
import type { CameraStore } from "@/lib/engine/input/camera-store";
import {
  PointerTracker,
  applyWheelAction,
  cameraKeyAction,
  classifyWheel,
  isSpaceKey,
  zoom100Camera,
  zoomFitCamera,
  zoomSelectionCamera,
  zoomStepCamera,
} from "@/lib/engine/input/gestures";
import type { SelectionStore } from "@/lib/engine/input/selection-store";
import type { NavSettings } from "@/lib/settings";

export type CanvasInputDeps = {
  doc: BoardDoc;
  camera: CameraStore;
  selection: SelectionStore;
  settings: () => NavSettings;
  viewport: () => { w: number; h: number };
  /** Stop a running camera animation (any input does). */
  cancelAnimation: () => void;
  /** A camera gesture began: the layer may promote itself to its own compositor layer until the camera settles. */
  gestureStart: () => void;
  cameraShortcuts: boolean;
};

export function isEditableTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT";
}

/**
 * One pointer pipeline for mouse, trackpad, touch and pen (pointer events, pointer capture while dragging), plus
 * wheel, Space-drag panning and the camera shortcuts. Listeners are attached natively so the wheel handler can be
 * non-passive and `touch-action: none` on the root keeps the browser from scrolling or zooming the page.
 */
export function useCanvasInput(root: RefObject<HTMLElement | null>, deps: CanvasInputDeps): void {
  const latest = useRef(deps);
  useEffect(() => {
    latest.current = deps;
  });

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const tracker = new PointerTracker();
    let spaceDown = false;
    let pan: { id: number; x: number; y: number } | null = null;
    const D = () => latest.current;

    const local = (e: { clientX: number; clientY: number }) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const tracked = (e: PointerEvent) => ({ pointerId: e.pointerId, pointerType: e.pointerType, ...local(e) });

    const updateCursor = () => {
      el.style.cursor = pan ? "grabbing" : spaceDown ? "grab" : "";
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0 && e.button !== 1) return;
      D().cancelAnimation();
      if (e.button === 1) e.preventDefault();
      if (!isEditableTarget(e.target)) el.focus({ preventScroll: true });
      const r = tracker.down(tracked(e));
      if (r === "ignored") return;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // the pointer is already gone; nothing to capture
      }
      if (r === "pinch") {
        pan = null;
        D().gestureStart();
        return;
      }
      if (spaceDown || e.button === 1) {
        pan = { id: e.pointerId, ...local(e) };
        D().gestureStart();
        updateCursor();
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const p = tracked(e);
      const r = tracker.move(p);
      if (r === "primary" && pan && pan.id === e.pointerId) {
        const { camera } = D();
        camera.set(panBy(camera.get(), p.x - pan.x, p.y - pan.y));
        pan.x = p.x;
        pan.y = p.y;
      } else if (r === "pinch" && tracker.pinch) {
        const { camera } = D();
        const { center, scale, dx, dy } = tracker.pinch;
        camera.set(panBy(zoomAt(camera.get(), center, scale), dx, dy));
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      tracker.up(e);
      if (pan && pan.id === e.pointerId) {
        pan = null;
        updateCursor();
      }
      if (el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId);
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const d = D();
      d.cancelAnimation();
      d.gestureStart();
      const action = classifyWheel(e, d.settings());
      d.camera.set(applyWheelAction(d.camera.get(), action, local(e)));
    };

    const runCameraAction = (act: NonNullable<ReturnType<typeof cameraKeyAction>>) => {
      const d = D();
      const vp = d.viewport();
      const cam: Camera = d.camera.get();
      let next: Camera | null = null;
      if (act === "fit") next = zoomFitCamera(d.doc, vp);
      else if (act === "selection") next = zoomSelectionCamera(d.doc, d.selection.ids, vp);
      else if (act === "zoom100") next = zoom100Camera(cam, vp);
      else next = zoomStepCamera(cam, vp, act === "zoomIn" ? 1 : -1);
      // Keyboard-triggered camera moves never animate.
      if (next) d.camera.set(next);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      D().cancelAnimation();
      if (isSpaceKey(e)) {
        e.preventDefault();
        if (!e.repeat) {
          spaceDown = true;
          updateCursor();
        }
        return;
      }
      if (!D().cameraShortcuts) return;
      const act = cameraKeyAction(e);
      if (act) {
        e.preventDefault();
        runCameraAction(act);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (isSpaceKey(e) && spaceDown) {
        spaceDown = false;
        updateCursor();
      }
    };
    const onBlur = () => {
      spaceDown = false;
      updateCursor();
    };

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerUp);
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("keydown", onKeyDown);
    el.addEventListener("keyup", onKeyUp);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerUp);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("keydown", onKeyDown);
      el.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      el.style.cursor = "";
    };
  }, [root]);
}
