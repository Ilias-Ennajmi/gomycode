import type { BoardDoc } from "../doc/board-doc";
import { defaultsFor } from "../model/defaults";
import { normalizeHex } from "../model/color";
import { oneStepOn } from "../model/one-step";
import type { ColorFormat, PaletteObj, PaletteSwatch, SwatchObj } from "../model/types";

export const COLOR_FORMATS: readonly ColorFormat[] = ["hex", "rgb", "hsl", "oklch"];
export const COLOR_FORMAT_LABELS: Record<ColorFormat, string> = { hex: "HEX", rgb: "RGB", hsl: "HSL", oklch: "OKLCH" };

export const nextColorFormat = (f: ColorFormat): ColorFormat => COLOR_FORMATS[(COLOR_FORMATS.indexOf(f) + 1) % COLOR_FORMATS.length] ?? "hex";

type At = { x: number; y: number };

/** A palette object centred on `at` (live unless `init.live` says otherwise); one undo step. Returns its id. */
export function createPalette(doc: BoardDoc, at: At, init: Partial<Pick<PaletteObj, "live" | "swatches" | "maxColors" | "layout">> = {}): string {
  const d = defaultsFor("palette");
  let id = "";
  oneStepOn(doc, () => {
    id = doc.create({ ...d, live: true, ...init, x: at.x - d.w / 2, y: at.y - d.h / 2 });
  });
  return id;
}

/** A colour card centred on `at`; one undo step. Returns its id. */
export function createSwatchCard(doc: BoardDoc, at: At, o: { hex: string; name?: string; format?: ColorFormat }): string {
  const d = defaultsFor("swatch");
  let id = "";
  oneStepOn(doc, () => {
    id = doc.create({ ...d, hex: normalizeHex(o.hex) ?? d.hex, name: o.name ?? "", format: o.format ?? "hex", x: at.x - d.w / 2, y: at.y - d.h / 2 });
  });
  return id;
}

const paletteOf = (doc: BoardDoc, id: string): PaletteObj | null => {
  const o = doc.get(id);
  return o?.type === "palette" ? o : null;
};

/** Change one swatch of a palette (found by `hex`). Renaming or recolouring keeps it for good (locked). One undo step. */
export function patchPaletteSwatch(doc: BoardDoc, paletteId: string, hex: string, patch: Partial<Pick<PaletteSwatch, "name" | "locked" | "hex">>): void {
  const p = paletteOf(doc, paletteId);
  if (!p || p.locked) return;
  const next = normalizeHex(patch.hex ?? "") ?? undefined;
  if (patch.hex !== undefined && !next) return;
  const swatches = p.swatches.map((s) => {
    if (s.hex !== hex) return s;
    const named = patch.name !== undefined ? patch.name.trim().slice(0, 100) : s.name;
    // A name or a hand-picked colour is something the owner chose: it must outlive re-derivation.
    const lock = patch.locked ?? (s.locked || named !== s.name || (next !== undefined && next !== s.hex));
    return { ...s, name: named, hex: next ?? s.hex, locked: lock };
  });
  // Two swatches may not share a colour.
  const seen = new Set<string>();
  const unique = swatches.filter((s) => (seen.has(s.hex) ? false : (seen.add(s.hex), true)));
  oneStepOn(doc, () => doc.update(paletteId, { swatches: unique }));
}

/** Flip the lock of one swatch (read from the document now, not from what a panel last drew). One undo step. */
export function toggleSwatchLock(doc: BoardDoc, paletteId: string, hex: string): void {
  const s = paletteOf(doc, paletteId)?.swatches.find((x) => x.hex === hex);
  if (s) patchPaletteSwatch(doc, paletteId, hex, { locked: !s.locked });
}

/** Add a hand-picked, locked colour to a palette (ignored when it is already there). One undo step. Returns whether it was added. */
export function addLockedSwatch(doc: BoardDoc, paletteId: string, hexInput: string, name = ""): boolean {
  const p = paletteOf(doc, paletteId);
  const hex = normalizeHex(hexInput);
  if (!p || p.locked || !hex || p.swatches.some((s) => s.hex === hex) || p.swatches.length >= 64) return false;
  oneStepOn(doc, () => doc.update(paletteId, { swatches: [...p.swatches, { hex, weight: 0, name: name.trim().slice(0, 100), locked: true }] }));
  return true;
}

/** Drop a swatch from a palette (a derived one comes back at the next recompute unless it was locked). One undo step. */
export function removePaletteSwatch(doc: BoardDoc, paletteId: string, hex: string): void {
  const p = paletteOf(doc, paletteId);
  if (!p || p.locked) return;
  oneStepOn(doc, () => doc.update(paletteId, { swatches: p.swatches.filter((s) => s.hex !== hex) }));
}

/** A colour card copied out of a palette swatch, placed to the right of the palette (or at `at`). Returns its id. */
export function pullOutSwatch(doc: BoardDoc, paletteId: string | null, s: Pick<PaletteSwatch, "hex" | "name">, at: At): string {
  const p = paletteId ? paletteOf(doc, paletteId) : null;
  const d = defaultsFor("swatch");
  const centre = p ? { x: p.x + p.w + 24 + d.w / 2, y: p.y + d.h / 2 } : at;
  return createSwatchCard(doc, centre, { hex: s.hex, name: s.name });
}

export type SwatchPatch = Partial<Pick<SwatchObj, "hex" | "name" | "format">>;
