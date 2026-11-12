import * as Y from "yjs";
import { BoardDoc } from "./board-doc";

/** A board document rebuilt from one Yjs update (`Y.encodeStateAsUpdate`). Throws when the bytes are not a Yjs update. */
export function docFromState(state: Uint8Array): BoardDoc {
  const ydoc = new Y.Doc();
  try {
    Y.applyUpdate(ydoc, state);
  } catch (e) {
    ydoc.destroy();
    throw e instanceof Error ? e : new Error("Not a board document");
  }
  return new BoardDoc(ydoc);
}
