// Reading a board state (one Yjs update) into plain data for diffing and comparing. Runs in the browser and on the server.
import { docFromState } from "@/lib/engine/doc/from-state";
import type { CanvasObject } from "@/lib/engine/model/types";
import { textFingerprints } from "./texts";

/** The valid objects of a state and a fingerprint of each one's rich text. Invalid entries are skipped. Throws when `state` is not a Yjs update. */
export function decodeBoardState(state: Uint8Array): { objects: Map<string, CanvasObject>; texts: Map<string, string> } {
  const doc = docFromState(state);
  try {
    return decodeDoc(doc);
  } finally {
    doc.destroy();
  }
}

/** The same for a live document (the board being edited). */
export function decodeDoc(doc: { all(): CanvasObject[]; content: Parameters<typeof textFingerprints>[0]["content"] }): { objects: Map<string, CanvasObject>; texts: Map<string, string> } {
  const objects = new Map<string, CanvasObject>();
  for (const o of doc.all()) objects.set(o.id, o);
  return { objects, texts: textFingerprints({ all: () => doc.all(), content: doc.content.bind(doc) }) };
}

export function objectsFromState(state: Uint8Array): Map<string, CanvasObject> {
  return decodeBoardState(state).objects;
}
