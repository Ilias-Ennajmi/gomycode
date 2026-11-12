"use client";

import { useEffect, useRef, type RefObject } from "react";
import type { BoardDoc } from "@/lib/engine/doc/board-doc";
import { panBy, screenToCanvas, zoomAt, type Camera } from "@/lib/engine/geometry/camera";
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
import type { EditingStore } from "@/lib/engine/input/editing-store";
import type { SelectionStore } from "@/lib/engine/input/selection-store";
import type { CanvasPointer, ToolCtx, ToolMachine } from "@/lib/engine/input/tool-machine";
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
  machine: ToolMachine;
  /** Builds the context handed to tools (fresh settings and camera on every call). */
  toolCtx: () => ToolCtx;
  /** A press anywhere on the canvas outside the editor ends editing. */
  editing: EditingStore;
};

/** Tools whose drag draws: with "pen draws, finger pans" a touch pans instead of reaching them. */
const DRAWING_TOOLS = new Set(["pen", "highlighter", "eraser"]);

/** An element of the object being edited (its editor or name field): the canvas leaves pointer input to it. */
export function isEditingSurface(t: EventTarget | null): boolean {
  return t instanceof Element && t.closest("[data-editing-surface]") !== null;
}

export function isEditableTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT") return true;
  // Some environments (jsdom) do not implement isContentEditable: look for the attribute on the element or above it.
  const host = t.closest("[contenteditable]");
  return host !== null && host.getAttribute("contenteditable") !== "false";
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
    let toolPointer: number | null = null;

    const toCanvasPointer = (e: MouseEvent | PointerEvent): CanvasPointer => {
      const screen = local(e);
      const pe = e as PointerEvent;
      const pointerType = pe.pointerType || "mouse";
      return {
        point: screenToCanvas(D().camera.get(), screen),
        screen,
        pointerId: pe.pointerId ?? 1,
        pointerType,
        pressure: pe.pressure > 0 ? pe.pressure : 0.5,
        button: e.button,
        buttons: e.buttons,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        metaKey: e.metaKey,
        ctrlKey: e.ctrlKey,
        timeStamp: e.timeStamp,
      };
    };

    const updateCursor = () => {
      const d = D();
      const handTool = d.machine.id === "hand";
      el.style.cursor = pan ? "grabbing" : spaceDown || handTool ? "grab" : (d.machine.tool?.cursor?.(d.toolCtx()) ?? "");
    };

    const cancelTool = () => {
      if (toolPointer === null) return;
      toolPointer = null;
      const d = D();
      d.machine.tool?.onCancel?.(d.toolCtx());
    };

    const onPointerDown = (e: PointerEvent) => {
      // Presses on the editor belong to the editor (caret, selection); presses elsewhere end editing.
      if (isEditingSurface(e.target) || isEditableTarget(e.target)) return;
      D().editing.stop();
      if (e.pointerType === "mouse" && e.button !== 0 && e.button !== 1) return;
      D().cancelAnimation();
      if (e.button === 1) e.preventDefault();
      // Focus follows pointer use without a focus ring (keyboard users still get one when they Tab in).
      if (!isEditableTarget(e.target)) el.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
      const r = tracker.down(tracked(e));
      if (r === "ignored") return;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // the pointer is already gone; nothing to capture
      }
      if (r === "pinch") {
        pan = null;
        cancelTool();
        D().gestureStart();
        return;
      }
      const d = D();
      const fingerPans = d.settings().penOnlyDraws && e.pointerType === "touch" && DRAWING_TOOLS.has(d.machine.id);
      if (spaceDown || e.button === 1 || d.machine.id === "hand" || fingerPans) {
        pan = { id: e.pointerId, ...local(e) };
        d.gestureStart();
        updateCursor();
        return;
      }
      const tool = d.machine.tool;
      if (tool) {
        toolPointer = e.pointerId;
        tool.onDown(d.toolCtx(), toCanvasPointer(e));
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
      } else if (r === "primary" && toolPointer === e.pointerId) {
        const d = D();
        d.machine.tool?.onMove(d.toolCtx(), toCanvasPointer(e));
        updateCursor();
      } else if (r === "hover") {
        const d = D();
        if (!pan && e.pointerType !== "touch") {
          d.machine.tool?.onMove(d.toolCtx(), toCanvasPointer(e));
          updateCursor();
        }
      } else if (r === "pinch" && tracker.pinch) {
        const { camera } = D();
        const { center, scale, dx, dy } = tracker.pinch;
        camera.set(panBy(zoomAt(camera.get(), center, scale), dx, dy));
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      const r = tracker.up(e);
      if (pan && pan.id === e.pointerId) {
        pan = null;
        updateCursor();
      }
      if (r === "primary" && toolPointer === e.pointerId) {
        toolPointer = null;
        const d = D();
        if (e.type === "pointercancel") d.machine.tool?.onCancel?.(d.toolCtx());
        else d.machine.tool?.onUp(d.toolCtx(), toCanvasPointer(e));
        updateCursor();
      }
      if (el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId);
    };

    const onDoubleClick = (e: MouseEvent) => {
      if (isEditableTarget(e.target)) return;
      const d = D();
      d.machine.tool?.onDoubleClick?.(d.toolCtx(), toCanvasPointer(e));
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
      const d = D();
      d.cancelAnimation();
      if (!isSpaceKey(e)) {
        if (d.machine.tool?.onKey?.(d.toolCtx(), e)) {
          e.preventDefault();
          return;
        }
        if (e.key === "Escape" && d.machine.id !== "select") {
          e.preventDefault();
          d.machine.setTool("select"); // Escape always returns to Select
          return;
        }
      }
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
    el.addEventListener("dblclick", onDoubleClick);
    el.addEventListener("keydown", onKeyDown);
    el.addEventListener("keyup", onKeyUp);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    const offMachine = D().machine.subscribe(updateCursor);
    return () => {
      offMachine();
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerUp);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("dblclick", onDoubleClick);
      el.removeEventListener("keydown", onKeyDown);
      el.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      el.style.cursor = "";
    };
  }, [root]);
}
