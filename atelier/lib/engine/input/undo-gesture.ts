import type { BoardDoc } from "../doc/board-doc";

const previous = new WeakMap<BoardDoc, number>();

/**
 * Make everything written until `endUndoGesture` one undo step. Yjs merges edits that are less than
 * `captureTimeout` apart, so a drag with a long pause would otherwise split into two steps: for the duration of a
 * gesture the window is unlimited. Always pair with endUndoGesture (also on cancel).
 */
export function beginUndoGesture(doc: BoardDoc): void {
  doc.stopCapturing(); // the gesture starts a new step
  if (!previous.has(doc)) previous.set(doc, doc.undoManager.captureTimeout);
  doc.undoManager.captureTimeout = Number.MAX_SAFE_INTEGER;
}

export function endUndoGesture(doc: BoardDoc): void {
  const was = previous.get(doc);
  if (was !== undefined) {
    doc.undoManager.captureTimeout = was;
    previous.delete(doc);
  }
  doc.stopCapturing(); // the next edit is a new step
}
