// PDF deck planning (main thread, no jsPDF): which pages the deck has, how big each is, and the Scene of each frame. The
// writer (pdf.ts, in the export worker) draws a plan; keeping the two apart keeps jsPDF out of every route's JavaScript.
import { FRAME_PRESETS } from "@/lib/engine/model/defaults";
import type { FrameObj, PaletteColor } from "@/lib/engine/model/types";
import type { CreditsRow } from "@/lib/engine/provenance/credits";
import { deltaE, hexToOklab, normalizeHex } from "@/lib/engine/model/color";
import { buildScene, framesInOrder, type FontRef, type Scene, type SceneSource } from "./scene";
import type { TextMeasurer } from "./text-layout";

export interface PdfOptions {
  /** Screen 150 dpi or Print 300 dpi: the resolution pictures are downsampled to. */
  quality: "screen" | "print";
  cover: { title: string; client: string; date: string } | null;
  palettePage: boolean;
  creditsPage: boolean;
  /** Frames to include, in presentation order; null = every frame. */
  frameIds: string[] | null;
  /** Compress streams. Off only in tests, so the page content can be read. */
  compress: boolean;
}

export type PdfSwatch = { hex: string; name: string; weight: number };

/** Things the deck needs from outside the board. */
export interface PdfExtras {
  /** Rows of the credits page (`creditsRows(doc)`); injected so this module does not depend on provenance code. */
  credits?: CreditsRow[];
  /** The palette to show; null/undefined = the board's palette object, else a mix of `assetPalettes`. */
  palette?: PdfSwatch[] | null;
  /** Colour palettes of the board's pictures, each with the area it covers (to weight the mix). */
  assetPalettes?: { palette: PaletteColor[]; area: number }[];
}

export type FramePage = { kind: "frame"; name: string; wPt: number; hPt: number; scene: Scene };
export type CoverPage = { kind: "cover"; wPt: number; hPt: number; title: string; client: string; date: string; swatches: PdfSwatch[] };
export type PalettePage = { kind: "palette"; wPt: number; hPt: number; swatches: PdfSwatch[] };
export type CreditsPage = { kind: "credits"; wPt: number; hPt: number; rows: CreditsRow[]; index: number; count: number };
export type PdfPage = FramePage | CoverPage | PalettePage | CreditsPage;

export interface PdfPlan {
  title: string;
  quality: PdfOptions["quality"];
  compress: boolean;
  pages: PdfPage[];
  fonts: FontRef[];
  warnings: string[];
}

export const PT_PER_PX = 0.75;
/** PDF viewers refuse pages above 200 inches (14,400 pt). */
export const MAX_PAGE_PT = 14_400;
export const CREDITS_ROWS_PER_PAGE = 40;
export const DEFAULT_PAGE = { wPt: 1440, hPt: 810 } as const;
export const DPI = { screen: 150, print: 300 } as const;

/** The page size of a frame in points: its real size for mm and inch presets, 0.75 pt per pixel otherwise. */
export function framePageSize(frame: Pick<FrameObj, "preset" | "w" | "h">): { wPt: number; hPt: number } {
  const preset = FRAME_PRESETS[frame.preset];
  if (preset && preset.unit !== "px") {
    const k = preset.unit === "mm" ? 72 / 25.4 : 72;
    const aspect = preset.w / preset.h;
    // A frame that was resized away from its paper shape is a custom size.
    if (Math.abs(frame.w / frame.h - aspect) <= 0.01 * aspect) return { wPt: preset.w * k, hPt: preset.h * k };
  }
  return { wPt: frame.w * PT_PER_PX, hPt: frame.h * PT_PER_PX };
}

/** Pixels a picture placed `placedWidthPt` wide needs at `dpi`, never more than the original has. */
export function imageTargetPx(placedWidthPt: number, dpi: number, originalWidthPx: number): number {
  const want = Math.round((placedWidthPt / 72) * dpi);
  return Math.max(1, Math.min(want, originalWidthPx));
}

/** A mix of picture palettes: colours merged when close in OKLab, weighted by the area each picture covers. */
export function mixPalettes(inputs: { palette: PaletteColor[]; area: number }[], max = 8): PdfSwatch[] {
  const buckets: { hex: string; lab: [number, number, number]; weight: number }[] = [];
  for (const { palette, area } of inputs) {
    for (const c of palette) {
      const hex = normalizeHex(c.hex);
      if (!hex || !(c.weight > 0) || !(area > 0)) continue;
      const lab = hexToOklab(hex);
      const w = c.weight * area;
      const hit = buckets.find((b) => deltaE(b.lab, lab) < 0.06);
      if (hit) {
        const t = hit.weight + w;
        hit.lab = [(hit.lab[0] * hit.weight + lab[0] * w) / t, (hit.lab[1] * hit.weight + lab[1] * w) / t, (hit.lab[2] * hit.weight + lab[2] * w) / t];
        if (w > hit.weight) hit.hex = hex;
        hit.weight = t;
      } else buckets.push({ hex, lab, weight: w });
    }
  }
  buckets.sort((a, b) => b.weight - a.weight || (a.hex < b.hex ? -1 : 1));
  const top = buckets.slice(0, max);
  const total = top.reduce((s, b) => s + b.weight, 0) || 1;
  return top.map((b) => ({ hex: b.hex, name: "", weight: b.weight / total }));
}

function boardPalette(src: SceneSource): PdfSwatch[] | null {
  for (const o of src.all()) {
    if (o.type === "palette" && o.swatches.length > 0) return o.swatches.map((s) => ({ hex: s.hex, name: s.name, weight: s.weight }));
  }
  return null;
}

/**
 * The pages of the deck: an optional cover, one page per frame in presentation order (the frame's size, its content
 * clipped to it), an optional palette page and the credits page(s). Pure: the same board gives the same plan.
 */
export function planPdf(src: SceneSource, o: PdfOptions, measure: TextMeasurer, extras: PdfExtras = {}): PdfPlan {
  const warnings: string[] = [];
  const wanted = o.frameIds ? new Set(o.frameIds) : null;
  const frames = framesInOrder(src).filter((f) => !wanted || wanted.has(f.id));
  const pages: PdfPage[] = [];
  const fontKeys = new Map<string, FontRef>();
  const addFont = (f: FontRef) => fontKeys.set(`${f.family}|${f.weight}|${f.italic}`, f);
  for (const f of [{ family: "Inter", weight: 400, italic: false }, { family: "Inter", weight: 500, italic: false }, { family: "Inter", weight: 700, italic: false }]) addFont(f);

  const framePages: FramePage[] = frames.map((f) => {
    const scene = buildScene(src, { kind: "frame", id: f.id }, { background: "board", padding: 0, measure, frameChrome: false, credits: false });
    let { wPt, hPt } = f.rotation === 0 ? framePageSize(f) : { wPt: scene.width * PT_PER_PX, hPt: scene.height * PT_PER_PX };
    const big = Math.max(wPt, hPt);
    if (big > MAX_PAGE_PT) {
      const k = MAX_PAGE_PT / big;
      wPt *= k;
      hPt *= k;
      warnings.push(`The frame "${f.name}" is larger than a PDF page can be and was scaled down to fit.`);
    }
    for (const font of scene.fonts) addFont(font);
    warnings.push(...scene.warnings);
    return { kind: "frame", name: f.name, wPt, hPt, scene };
  });
  if (frames.length === 0) warnings.push("The board has no frames, so the deck has no slide pages.");

  const size = framePages[0] ? { wPt: framePages[0].wPt, hPt: framePages[0].hPt } : DEFAULT_PAGE;
  const swatches = extras.palette ?? boardPalette(src) ?? (extras.assetPalettes?.length ? mixPalettes(extras.assetPalettes) : []);

  if (o.cover) {
    addFont({ family: "Playfair Display", weight: 700, italic: false });
    pages.push({ kind: "cover", ...size, title: o.cover.title, client: o.cover.client, date: o.cover.date, swatches });
  }
  pages.push(...framePages);
  if (o.palettePage) {
    if (swatches.length) pages.push({ kind: "palette", ...size, swatches });
    else warnings.push("No palette to show: the board has no palette and no coloured pictures.");
  }
  if (o.creditsPage) {
    const rows = extras.credits ?? [];
    if (rows.length) {
      const count = Math.ceil(rows.length / CREDITS_ROWS_PER_PAGE);
      for (let i = 0; i < count; i++) pages.push({ kind: "credits", ...size, rows: rows.slice(i * CREDITS_ROWS_PER_PAGE, (i + 1) * CREDITS_ROWS_PER_PAGE), index: i, count });
    } else warnings.push("No picture on the board has a credit, so the credits page was left out.");
  }
  return { title: src.meta.title, quality: o.quality, compress: o.compress, pages, fonts: [...fontKeys.values()], warnings };
}
