"use client";

import { useEffect, useRef } from "react";
import type { CanvasHandle } from "@/components/canvas/CanvasView";
import { assetOnBoard, parseAddRequest, placeAsset } from "@/lib/assets/place-asset";
import type { BoardDoc } from "@/lib/engine/doc/board-doc";
import { screenToCanvas } from "@/lib/engine/geometry/camera";

/**
 * "Add to board" from the library opens `/b/{id}?add=…`: once the board is ready this puts that asset in the middle of the
 * view (one undo step, selected), says so, and drops the request from the address so a reload does not add it again. An
 * asset already on the board is still added, with a note. Does nothing when the address carries no valid request.
 */
export function useAddRequest(doc: BoardDoc | null, canvas: CanvasHandle | null, notify: (message: string) => void): void {
  const done = useRef(false);
  const say = useRef(notify);
  useEffect(() => {
    say.current = notify;
  });
  useEffect(() => {
    if (!doc || !canvas || done.current) return;
    const request = parseAddRequest(window.location.search);
    if (!request) return;
    done.current = true;
    const already = assetOnBoard(doc, request.assetId);
    const vp = canvas.viewport();
    const id = placeAsset(doc, request, screenToCanvas(canvas.getCamera(), { x: vp.w / 2, y: vp.h / 2 }));
    canvas.selection.set([id]);
    say.current(already ? "Already on this board. Added another copy." : "Added to this board.");
    try {
      window.history.replaceState(window.history.state, "", window.location.pathname);
    } catch {
      /* the address stays; the request was done once already */
    }
  }, [doc, canvas]);
}
