import type { BoardDoc } from "../doc/board-doc";

/** Run `fn` as exactly one undo step: it never merges with the edit before it or the one after it. */
export function oneStepOn(doc: BoardDoc, fn: () => void): void {
  doc.stopCapturing();
  doc.transact(fn);
  doc.stopCapturing();
}

/**
 * Undo `item` (the undo-stack entry a command left behind) only while it is still the latest step. If the user has
 * edited since, undoing would undo that edit instead, so nothing happens. Returns whether it undid.
 */
export function undoIfLatest(doc: BoardDoc, item: unknown): boolean {
  const stack = doc.undoManager.undoStack;
  if (!item || stack[stack.length - 1] !== item || !doc.canUndo()) return false;
  doc.undo();
  return true;
}
