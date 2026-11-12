import type { BoardDoc } from "../doc/board-doc";
import { oneStepOn } from "../model/one-step";
import type { Provenance } from "../model/types";
import { hasProvenance, validateProvenance } from "./validate";

export type SaveProvenanceDeps = {
  /** Tell the server about the asset's provenance (PATCH /api/assets/:id). Failures are not the editor's problem. */
  patchAsset(assetId: string, p: Provenance): Promise<void>;
  /** Whether the asset already carries provenance (first capture wins: it is never overwritten). */
  assetHasProvenance(assetId: string): boolean;
};

/**
 * Save the source of a picture or video: the object holds it (it travels with the board, snapshots and share links) as
 * one undo step, and the asset is told once, the first time it gets any. An all-empty record clears the object. An invalid
 * record (a link that is not http(s), text over its limit) changes nothing and returns false.
 */
export function saveProvenance(doc: BoardDoc, id: string, input: Provenance, deps: SaveProvenanceDeps): boolean {
  const obj = doc.get(id);
  if (!obj || (obj.type !== "image" && obj.type !== "video")) return false;
  const clean = validateProvenance(input);
  if (!clean) return false;
  const next = hasProvenance(clean) || clean.capturedAt !== null ? clean : null;
  oneStepOn(doc, () => doc.update(id, { provenance: next }));
  if (next && !deps.assetHasProvenance(obj.assetId)) {
    void deps.patchAsset(obj.assetId, next).catch(() => {
      /* offline or local-only: the object has it, the asset hears about it another time */
    });
  }
  return true;
}
