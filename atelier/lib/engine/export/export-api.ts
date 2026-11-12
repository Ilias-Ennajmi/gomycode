// Main-thread entry points of image and SVG export: build the Scene (text laid out with a canvas measurer once the export
// fonts are loaded), work out the output size, then hand the scene and a plain-data asset table to the export worker.
// Used by the Export dialog, and by anything else that exports (round previews, the visitor download).
import { sanitizeFileName } from "@/lib/download";
import type { BoardDoc } from "@/lib/engine/doc/board-doc";
import * as Y from "yjs";
import { planBackup, type AssetInfo } from "./backup";
import { buildAssetTable, type AssetSource } from "./images";
import { canvasFont, EXPORT_FONT_FILES, loadExportFonts } from "./fonts";
import type { ExportManager } from "./manager";
import { ExportCancelled, type ExportSummary } from "./protocol";
import { planPdf, type PdfExtras, type PdfOptions } from "./pdf-plan";
import { clampScale, type RasterOptions } from "./raster";
import { boardDocSource, buildScene, type ExportTarget, type Scene, type SceneOptions, type SceneSource } from "./scene";
import type { TextMeasurer } from "./text-layout";

export interface ExportHandle<R = ExportResult> {
  promise: Promise<R>;
  cancel(): void;
}

export interface ExportResult {
  blob: Blob;
  filename: string;
  summary: ExportSummary;
  width?: number;
  height?: number;
}

export interface ExportDeps {
  manager: Pick<ExportManager, "run">;
  assets: AssetSource;
  onProgress?(ratio: number, label: string): void;
  /** Where the bundled fonts are served from (default /fonts/export/ on this origin). */
  fontBase?: string;
  /** Text measurer (default: a canvas measurer using the export fonts). */
  measure?: TextMeasurer;
}

export type ImageSize = { scale: number } | { widthPx: number };

export interface ImageExportOptions {
  format: "png" | "jpeg" | "webp";
  size: ImageSize;
  quality?: number;
  transparent?: boolean;
  /** "board" paints the board's paper (or the frame's own background); a colour paints that. Default "board". */
  background?: "board" | string;
  padding?: number;
  credits?: boolean;
  frameChrome?: boolean;
}

export interface SvgExportOptions {
  imageMode: "embed" | "link";
  transparent?: boolean;
  background?: "board" | string;
  padding?: number;
  credits?: boolean;
  frameChrome?: boolean;
}

export const DEFAULT_PADDING = 48;

// ---- measuring and fonts ---------------------------------------------------------------------------------------------

export function defaultFontBase(): string {
  return typeof location === "undefined" ? "/fonts/export/" : new URL("/fonts/export/", location.href).href;
}

/** A TextMeasurer over a canvas 2D context: the same fonts the worker draws with, so layout and drawing agree. */
export function canvasMeasurer(): TextMeasurer {
  let ctx: { font: string; measureText(t: string): { width: number } } | null = null;
  const cache = new Map<string, number>();
  return (text, font) => {
    if (!ctx) {
      const c = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(1, 1) : document.createElement("canvas");
      ctx = c.getContext("2d") as unknown as typeof ctx;
    }
    const f = canvasFont(font);
    const key = `${f}\u0000${text}`;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    ctx!.font = f;
    const w = ctx!.measureText(text).width;
    if (cache.size > 50_000) cache.clear();
    cache.set(key, w);
    return w;
  };
}

/** A cheap measurer for size previews (about Inter's average glyph width). Not used for output. */
export const estimateMeasurer: TextMeasurer = (text, font) => text.length * font.size * 0.55;

/** Load every bundled face into this page so the canvas measurer sees the fonts the worker will draw with. */
export async function ensureMainFonts(base: string = defaultFontBase()): Promise<void> {
  if (typeof document === "undefined" || typeof FontFace === "undefined") return;
  await loadExportFonts(document.fonts, base, EXPORT_FONT_FILES.map((f) => ({ family: f.family, weight: f.weight, italic: f.italic })));
}

// ---- scene and names ------------------------------------------------------------------------------------------------

function sceneOptions(o: { transparent?: boolean; background?: string; padding?: number; credits?: boolean; frameChrome?: boolean }, target: ExportTarget, measure: TextMeasurer): SceneOptions {
  return {
    background: o.transparent ? "transparent" : (o.background ?? "board"),
    padding: o.padding ?? (target.kind === "frame" ? 0 : DEFAULT_PADDING),
    measure,
    frameChrome: o.frameChrome ?? target.kind === "board",
    credits: o.credits ?? false,
  };
}

/** Quick output-size preview for the dialog: builds the scene with an estimating measurer. */
export function previewSceneSize(src: SceneSource, target: ExportTarget, o: Parameters<typeof sceneOptions>[0] = {}): { width: number; height: number; empty: boolean } {
  const s = buildScene(src, target, sceneOptions(o, target, estimateMeasurer));
  return { width: s.width, height: s.height, empty: s.nodes.length === 0 };
}

function targetName(src: SceneSource, target: ExportTarget): string {
  if (target.kind === "frame") {
    const f = src.get(target.id);
    return f && f.type === "frame" ? f.name : "frame";
  }
  return target.kind === "selection" ? "selection" : "";
}

/** `Board title - Frame name@2x.png`, sanitised. */
export function exportFileName(src: SceneSource, target: ExportTarget, ext: string, suffix = ""): string {
  const title = sanitizeFileName(src.meta.title, "board");
  const part = targetName(src, target);
  const base = part ? `${title} - ${sanitizeFileName(part, "export")}` : title;
  return `${base}${suffix}.${ext}`;
}

export { framesInOrder } from "./scene";

// ---- jobs ---------------------------------------------------------------------------------------------------------

/** Run `body` with an abort signal that `cancel()` trips; a job started inside is cancelled with it. */
function managed<R>(body: (signal: AbortSignal, adopt: (job: { cancel(): void }) => void) => Promise<R>): ExportHandle<R> {
  const ac = new AbortController();
  let job: { cancel(): void } | null = null;
  const promise = body(ac.signal, (j) => {
    job = j;
    if (ac.signal.aborted) j.cancel();
  });
  return {
    promise,
    cancel() {
      ac.abort();
      job?.cancel();
    },
  };
}

async function prepare(src: SceneSource, target: ExportTarget, so: SceneOptions, deps: ExportDeps, signal: AbortSignal): Promise<Scene> {
  deps.onProgress?.(0, "Preparing");
  await ensureMainFonts(deps.fontBase);
  if (signal.aborted) throw new ExportCancelled();
  return buildScene(src, target, so);
}

export function exportImage(src: SceneSource, target: ExportTarget, o: ImageExportOptions, deps: ExportDeps): ExportHandle {
  return managed(async (signal, adopt) => {
    const measure = deps.measure ?? canvasMeasurer();
    const scene = await prepare(src, target, sceneOptions(o, target, measure), deps, signal);
    const dims = clampScale(scene, o.size);
    const options: RasterOptions = { scale: dims.scale, format: o.format, quality: o.quality ?? 0.92, transparent: !!o.transparent && o.format !== "jpeg" };
    const assets = buildAssetTable(scene.assetIds, deps.assets);
    const job = deps.manager.run("raster", { scene, options, assets, fontBase: deps.fontBase ?? defaultFontBase() }, (r, l) => deps.onProgress?.(r, l));
    adopt(job);
    const out = await job.promise;
    if (dims.reason) out.summary.clampedReason = dims.reason;
    const ext = o.format === "jpeg" ? "jpg" : o.format;
    const scaleSuffix = "scale" in o.size && o.size.scale !== 1 ? `@${o.size.scale}x` : "";
    return { blob: out.blob, summary: out.summary, filename: exportFileName(src, target, ext, scaleSuffix), width: dims.width, height: dims.height };
  });
}

export function exportSvg(src: SceneSource, target: ExportTarget, o: SvgExportOptions, deps: ExportDeps): ExportHandle {
  return managed(async (signal, adopt) => {
    const measure = deps.measure ?? canvasMeasurer();
    const scene = await prepare(src, target, sceneOptions(o, target, measure), deps, signal);
    const assets = buildAssetTable(scene.assetIds, deps.assets);
    const job = deps.manager.run("svg", { scene, imageMode: o.imageMode, assets }, (r, l) => deps.onProgress?.(r, l));
    adopt(job);
    const out = await job.promise;
    return { blob: out.blob, summary: out.summary, filename: exportFileName(src, target, "svg"), width: Math.round(scene.width), height: Math.round(scene.height) };
  });
}

export interface PdfExportOptions extends Omit<PdfOptions, "compress"> {
  /** Credits rows for the credits page (`creditsRows(doc)`): the caller supplies them. */
  credits?: PdfExtras["credits"];
  palette?: PdfExtras["palette"];
  assetPalettes?: PdfExtras["assetPalettes"];
}

/** A PDF deck: one page per frame in presentation order, plus the optional cover, palette and credits pages. */
export function exportPdf(src: SceneSource, o: PdfExportOptions, deps: ExportDeps): ExportHandle<ExportResult & { pageCount: number }> {
  return managed(async (signal, adopt) => {
    const measure = deps.measure ?? canvasMeasurer();
    deps.onProgress?.(0, "Preparing");
    await ensureMainFonts(deps.fontBase);
    if (signal.aborted) throw new ExportCancelled();
    const { credits, palette, assetPalettes, ...options } = o;
    const plan = planPdf(src, { ...options, compress: true }, measure, { credits, palette, assetPalettes });
    const ids = new Set<string>();
    for (const page of plan.pages) if (page.kind === "frame") for (const id of page.scene.assetIds) ids.add(id);
    const assets = buildAssetTable([...ids], deps.assets);
    const job = deps.manager.run("pdf", { plan, assets, fontBase: deps.fontBase ?? defaultFontBase() }, (r, l) => deps.onProgress?.(r, l));
    adopt(job);
    const out = await job.promise;
    return { blob: out.blob, summary: out.summary, filename: exportFileName(src, { kind: "board" }, "pdf"), pageCount: plan.pages.length };
  });
}

export interface BackupDeps extends ExportDeps {
  /** What is known about each asset (the asset metadata store). */
  meta: { get(id: string): AssetInfo | undefined };
}

/** A `.atelier` backup of the board: its state and the original of every picture and video it uses. */
export function exportBackup(doc: BoardDoc, deps: BackupDeps): ExportHandle {
  return managed(async (signal, adopt) => {
    deps.onProgress?.(0, "Preparing");
    const plan = planBackup(doc, deps.meta);
    if (signal.aborted) throw new ExportCancelled();
    const assets = buildAssetTable(plan.assets.map((a) => a.id), deps.assets);
    const job = deps.manager.run("backup", { plan, assets }, (r, l) => deps.onProgress?.(r, l));
    adopt(job);
    const out = await job.promise;
    return { blob: out.blob, summary: out.summary, filename: exportFileName(boardDocSource(doc), { kind: "board" }, "atelier") };
  });
}

/** A JSON Canvas export (jsoncanvas.org): a `.canvas` file, or a ZIP with its pictures. */
export function exportJsonCanvas(doc: BoardDoc, deps: ExportDeps): ExportHandle {
  return managed(async (signal, adopt) => {
    deps.onProgress?.(0, "Preparing");
    const src = boardDocSource(doc);
    const ids = new Set<string>();
    for (const o of doc.all()) if (o.type === "image" || o.type === "video") ids.add(o.assetId);
    if (signal.aborted) throw new ExportCancelled();
    const assets = buildAssetTable([...ids], deps.assets);
    const job = deps.manager.run("jsoncanvas", { state: Y.encodeStateAsUpdate(doc.ydoc), assets, title: doc.meta.title }, (r, l) => deps.onProgress?.(r, l));
    adopt(job);
    const out = await job.promise;
    return { blob: out.blob, summary: out.summary, filename: exportFileName(src, { kind: "board" }, out.summary.extension ?? "canvas") };
  });
}
