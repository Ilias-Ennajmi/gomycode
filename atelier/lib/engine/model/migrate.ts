// Board schema migrations. A board's Yjs `meta.schemaVersion` says which shape its objects have; boards written before
// versions existed (Phase 1) carry none and read as version 1. Migrations only ever add fields or reset values that
// cannot be interpreted, and are idempotent: running one on an up-to-date board writes nothing.
import * as Y from "yjs";
import { DERIVED_ORIGIN, type BoardDoc } from "../doc/board-doc";

export const SCHEMA_VERSION = 2;

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** A crop window that lies inside the unit square (normalised to the source image). */
function isNormalisedCrop(v: unknown): boolean {
  if (typeof v !== "object" || v === null) return false;
  const { x, y, w, h } = v as Record<string, unknown>;
  if (!num(x) || !num(y) || !num(w) || !num(h)) return false;
  return x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= 1 + 1e-6 && y + h <= 1 + 1e-6;
}

/** v1 -> v2: images gain `mask`, `grayscale`, `title`, `provenance`; a pixel-valued `crop` becomes null. */
function v1ToV2(doc: BoardDoc): void {
  const objects = doc.ydoc.getMap("objects");
  let resetCrops = 0;
  objects.forEach((m) => {
    if (!(m instanceof Y.Map) || m.get("type") !== "image") return;
    if (!m.has("mask")) m.set("mask", { kind: "rect", radius: 0 });
    if (!m.has("grayscale")) m.set("grayscale", false);
    if (!m.has("title")) m.set("title", "");
    if (!m.has("provenance")) m.set("provenance", null);
    const crop = m.get("crop");
    if (crop !== null && crop !== undefined && !isNormalisedCrop(crop)) {
      // Phase 1 left the unit open. A value above 1 is pixels of a source size this migration cannot know.
      m.set("crop", null);
      resetCrops++;
    }
  });
  if (resetCrops > 0) {
    console.warn(`Atelier migration: reset ${resetCrops} image crop(s) that were not normalised (the source size is unknown).`);
  }
}

/**
 * Bring a board up to SCHEMA_VERSION. Idempotent (a second run writes nothing), not an undo step, and a no-op for a
 * board whose version is already current or newer: a newer board is read as it is, never rewritten by an older client.
 */
export function migrateBoard(doc: BoardDoc): void {
  const raw = doc.ydoc.getMap("meta").get("schemaVersion");
  const version = num(raw) ? raw : 1;
  if (version >= SCHEMA_VERSION) return;
  doc.transactAs(DERIVED_ORIGIN, () => {
    if (version < 2) v1ToV2(doc);
    doc.meta.schemaVersion = SCHEMA_VERSION;
  });
}
