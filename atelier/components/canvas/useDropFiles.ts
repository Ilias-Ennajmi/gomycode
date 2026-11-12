"use client";

import { useEffect, useRef } from "react";
import { screenToCanvas } from "@/lib/engine/geometry/camera";
import type { Point } from "@/lib/engine/model/types";
import type { CanvasHandle } from "./CanvasView";
import type { ClipboardInput } from "./useClipboard";

const USABLE = ["Files", "text/uri-list", "text/plain", "text/html"];

function carriesSomething(dt: DataTransfer | null): boolean {
  return !!dt && Array.from(dt.types ?? []).some((t) => USABLE.includes(t));
}

/**
 * Drop files, URLs, text or Atelier objects onto the canvas: the data is handled exactly like a paste, centred on the
 * point where it was dropped. While something usable is dragged over the canvas it carries `data-drop-active`.
 * Drags that carry nothing we understand are left to the browser.
 */
export function useDropFiles(handle: CanvasHandle | null, pasteInput: (input: ClipboardInput, at: Point) => void): void {
  const paste = useRef(pasteInput);
  useEffect(() => {
    paste.current = pasteInput;
  });

  useEffect(() => {
    const el = handle?.container();
    if (!el || !handle) return;
    const setActive = (on: boolean) => {
      if (on) {
        el.dataset.dropActive = "true";
        el.style.outline = "2px dashed var(--color-selection)";
      } else {
        delete el.dataset.dropActive;
        el.style.outline = "";
      }
    };
    const onOver = (e: DragEvent) => {
      if (!carriesSomething(e.dataTransfer)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
      setActive(true);
    };
    const onLeave = (e: DragEvent) => {
      const to = e.relatedTarget;
      if (to instanceof Node && el.contains(to)) return;
      setActive(false);
    };
    const onDrop = (e: DragEvent) => {
      setActive(false);
      const dt = e.dataTransfer;
      if (!dt || !carriesSomething(dt)) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const at = screenToCanvas(handle.getCamera(), { x: e.clientX - r.left, y: e.clientY - r.top });
      paste.current(
        {
          html: dt.getData("text/html"),
          text: dt.getData("text/plain") || dt.getData("text/uri-list"),
          files: Array.from(dt.files ?? []),
        },
        at,
      );
    };
    el.addEventListener("dragenter", onOver);
    el.addEventListener("dragover", onOver);
    el.addEventListener("dragleave", onLeave);
    el.addEventListener("drop", onDrop);
    return () => {
      el.removeEventListener("dragenter", onOver);
      el.removeEventListener("dragover", onOver);
      el.removeEventListener("dragleave", onLeave);
      el.removeEventListener("drop", onDrop);
      setActive(false);
    };
  }, [handle]);
}
