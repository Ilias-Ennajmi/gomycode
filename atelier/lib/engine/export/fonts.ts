// Fonts for export. A worker cannot see the page's fonts, and a PDF has to embed the font program, so image, SVG and PDF
// export all use the small static Latin subsets in public/fonts/export (SIL Open Font License, see public/fonts/LICENSES.md):
// Inter and Playfair Display. Any other family (a type specimen in "Space Grotesk") is drawn in Inter and reported, so the
// person knows. Latin-1 and common punctuation are covered; other scripts fall back to whatever the system provides in
// image export and to a placeholder glyph in PDF (see the PDF writer).
import { unzlibSync } from "fflate";
import type { FontRef } from "./scene";

export type BundledFont = { family: "Inter" | "Playfair Display"; weight: number; italic: boolean; file: string };

export const EXPORT_FONT_FILES: readonly BundledFont[] = [
  { family: "Inter", weight: 400, italic: false, file: "inter-latin-400-normal.woff" },
  { family: "Inter", weight: 500, italic: false, file: "inter-latin-500-normal.woff" },
  { family: "Inter", weight: 600, italic: false, file: "inter-latin-600-normal.woff" },
  { family: "Inter", weight: 700, italic: false, file: "inter-latin-700-normal.woff" },
  { family: "Inter", weight: 400, italic: true, file: "inter-latin-400-italic.woff" },
  { family: "Inter", weight: 700, italic: true, file: "inter-latin-700-italic.woff" },
  { family: "Playfair Display", weight: 400, italic: false, file: "playfair-display-latin-400-normal.woff" },
  { family: "Playfair Display", weight: 700, italic: false, file: "playfair-display-latin-700-normal.woff" },
  { family: "Playfair Display", weight: 400, italic: true, file: "playfair-display-latin-400-italic.woff" },
];

/** The CSS family a bundled font is registered under, so it never clashes with a page font of the same name. */
export const exportFamily = (family: string): string => `AtelierExport ${family}`;

const norm = (f: string): string => f.trim().toLowerCase();

/** The bundled file closest to `font` (same style when one exists, nearest weight), or null for a family we do not bundle. */
export function bundledFont(font: FontRef): BundledFont | null {
  const family = EXPORT_FONT_FILES.find((f) => norm(f.family) === norm(font.family))?.family;
  if (!family) return null;
  const ofFamily = EXPORT_FONT_FILES.filter((f) => f.family === family);
  const sameStyle = ofFamily.filter((f) => f.italic === font.italic);
  const pool = sameStyle.length ? sameStyle : ofFamily;
  return pool.reduce((best, f) => (Math.abs(f.weight - font.weight) < Math.abs(best.weight - font.weight) ? f : best));
}

/** The family a font is drawn in: itself when bundled, otherwise Inter (and `substituted` says so). */
export function drawnFont(font: FontRef): { family: "Inter" | "Playfair Display"; substituted: boolean } {
  const b = bundledFont(font);
  return b ? { family: b.family, substituted: false } : { family: "Inter", substituted: true };
}

/** Canvas `font` shorthand for a scene font. */
export function canvasFont(font: { family: string; weight: number; italic: boolean; size: number }): string {
  const { family } = drawnFont(font);
  return `${font.italic ? "italic " : ""}${font.weight} ${font.size}px "${exportFamily(family)}", sans-serif`;
}

/** Families in `fonts` that are not bundled (they are drawn in Inter). */
export function substitutedFamilies(fonts: readonly FontRef[]): string[] {
  return [...new Set(fonts.filter((f) => !bundledFont(f)).map((f) => f.family))].sort();
}

type FaceSetLike = { add(face: FontFace): unknown };
const loaded = new WeakMap<object, Set<string>>();

/**
 * Register and load the bundled faces that `fonts` need into a FontFaceSet (`document.fonts` or a worker's `self.fonts`).
 * Resolves with the families that had to be substituted. A face that fails to load is skipped (the canvas then falls
 * back to a system sans-serif) rather than failing the export.
 */
export async function loadExportFonts(set: FaceSetLike, base: string, fonts: readonly FontRef[]): Promise<string[]> {
  let have = loaded.get(set);
  if (!have) loaded.set(set, (have = new Set()));
  const wanted = new Map<string, BundledFont>();
  // Always include Inter regular: labels and fallbacks use it.
  for (const f of [...fonts, { family: "Inter", weight: 400, italic: false }]) {
    const b = bundledFont(f);
    if (b) wanted.set(b.file, b);
  }
  await Promise.all(
    [...wanted.values()].map(async (b) => {
      if (have!.has(b.file)) return;
      try {
        const face = new FontFace(exportFamily(b.family), `url(${base}${b.file})`, { weight: String(b.weight), style: b.italic ? "italic" : "normal" });
        await face.load();
        set.add(face);
        have!.add(b.file);
      } catch {
        /* falls back to the system sans-serif */
      }
    }),
  );
  return substitutedFamilies(fonts);
}

// ---- WOFF (1.0) -> TrueType, for the PDF writer ---------------------------------------------------------------------

const u32 = (v: DataView, o: number): number => v.getUint32(o, false);

/** Unwrap a WOFF 1.0 file into the plain TrueType (sfnt) bytes jsPDF can embed. Throws for anything else. */
export function woffToTtf(woff: ArrayBuffer | Uint8Array): Uint8Array {
  const bytes = woff instanceof Uint8Array ? woff : new Uint8Array(woff);
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 44 || u32(v, 0) !== 0x774f4646) throw new Error("Not a WOFF font");
  const flavor = u32(v, 4);
  const n = v.getUint16(12, false);
  const tables: { tag: number; data: Uint8Array; sum: number }[] = [];
  for (let i = 0; i < n; i++) {
    const e = 44 + i * 20;
    const offset = u32(v, e + 4);
    const comp = u32(v, e + 8);
    const orig = u32(v, e + 12);
    if (offset + comp > bytes.length) throw new Error("Truncated WOFF font");
    const raw = bytes.subarray(offset, offset + comp);
    const data = comp < orig ? unzlibSync(raw, { out: new Uint8Array(orig) }) : raw;
    tables.push({ tag: u32(v, e), data, sum: u32(v, e + 16) });
  }
  tables.sort((a, b) => a.tag - b.tag);
  const headerLen = 12 + 16 * n;
  let total = headerLen;
  for (const t of tables) total += (t.data.length + 3) & ~3;
  const out = new Uint8Array(total);
  const ov = new DataView(out.buffer);
  ov.setUint32(0, flavor, false);
  ov.setUint16(4, n, false);
  let pow = 1;
  let log = 0;
  while (pow * 2 <= n) {
    pow *= 2;
    log++;
  }
  ov.setUint16(6, pow * 16, false);
  ov.setUint16(8, log, false);
  ov.setUint16(10, n * 16 - pow * 16, false);
  let at = headerLen;
  tables.forEach((t, i) => {
    const r = 12 + i * 16;
    ov.setUint32(r, t.tag, false);
    ov.setUint32(r + 4, t.sum, false);
    ov.setUint32(r + 8, at, false);
    ov.setUint32(r + 12, t.data.length, false);
    out.set(t.data, at);
    at += (t.data.length + 3) & ~3;
  });
  return out;
}

/** Whether a TrueType font has a glyph for a code point (cmap formats 4 and 12). Unreadable fonts cover nothing. */
export function ttfCoverage(ttf: Uint8Array): (codePoint: number) => boolean {
  try {
    const v = new DataView(ttf.buffer, ttf.byteOffset, ttf.byteLength);
    const n = v.getUint16(4, false);
    let cmap = -1;
    for (let i = 0; i < n; i++) {
      const r = 12 + i * 16;
      if (u32(v, r) === 0x636d6170) cmap = u32(v, r + 8);
    }
    if (cmap < 0) return () => false;
    const count = v.getUint16(cmap + 2, false);
    let sub = -1;
    let best = -1;
    for (let i = 0; i < count; i++) {
      const r = cmap + 4 + i * 8;
      const platform = v.getUint16(r, false);
      const enc = v.getUint16(r + 2, false);
      const rank = platform === 3 && enc === 10 ? 3 : platform === 3 && enc === 1 ? 2 : platform === 0 ? 1 : 0;
      if (rank > best && rank > 0) {
        best = rank;
        sub = cmap + u32(v, r + 4);
      }
    }
    if (sub < 0) return () => false;
    const format = v.getUint16(sub, false);
    if (format === 4) {
      const segX2 = v.getUint16(sub + 6, false);
      const seg = segX2 / 2;
      const endCodes = sub + 14;
      const startCodes = endCodes + segX2 + 2;
      const deltas = startCodes + segX2;
      const rangeOffsets = deltas + segX2;
      return (cp) => {
        if (cp > 0xffff) return false;
        for (let i = 0; i < seg; i++) {
          if (cp > v.getUint16(endCodes + i * 2, false)) continue;
          if (cp < v.getUint16(startCodes + i * 2, false)) return false;
          const ro = v.getUint16(rangeOffsets + i * 2, false);
          if (ro === 0) return ((cp + v.getInt16(deltas + i * 2, false)) & 0xffff) !== 0;
          const g = v.getUint16(rangeOffsets + i * 2 + ro + (cp - v.getUint16(startCodes + i * 2, false)) * 2, false);
          return g !== 0;
        }
        return false;
      };
    }
    if (format === 12) {
      const groups = u32(v, sub + 12);
      return (cp) => {
        for (let i = 0; i < groups; i++) {
          const g = sub + 16 + i * 12;
          if (cp >= u32(v, g) && cp <= u32(v, g + 4)) return true;
        }
        return false;
      };
    }
    return () => false;
  } catch {
    return () => false;
  }
}
