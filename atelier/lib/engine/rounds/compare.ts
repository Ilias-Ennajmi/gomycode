// Comparing a board state with another state or with the board being edited, as a RoundDiff.
import type { BoardDoc } from "@/lib/engine/doc/board-doc";
import type { RoundDiff } from "@/lib/share/round-types";
import { decodeBoardState, decodeDoc } from "./decode";
import { diffObjects } from "./diff";

/** What changed from the state `prev` (null = nothing before it) to the document as it is now. Throws when `prev` is not a Yjs update. */
export function diffStateToDoc(prev: Uint8Array | null, doc: BoardDoc): RoundDiff {
  const before = prev ? decodeBoardState(prev) : null;
  const now = decodeDoc(doc);
  return diffObjects(before?.objects ?? null, now.objects, { prev: before?.texts ?? null, next: now.texts });
}

/** What changed from one state to another (both are Yjs updates). */
export function diffStates(prev: Uint8Array | null, next: Uint8Array): RoundDiff {
  const before = prev ? decodeBoardState(prev) : null;
  const after = decodeBoardState(next);
  return diffObjects(before?.objects ?? null, after.objects, { prev: before?.texts ?? null, next: after.texts });
}
