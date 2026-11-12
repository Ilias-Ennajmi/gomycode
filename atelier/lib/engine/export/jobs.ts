// What the export worker runs, written as plain async functions so they can be tested without a worker.
import { createImageSource, svgImages, type AssetTable, type ExportImageSource } from "./images";
import { loadExportFonts, substitutedFamilies } from "./fonts";
import { emptySummary, type ExportSummary } from "./protocol";
import { renderRaster, type RasterOptions } from "./raster";
import type { Scene } from "./scene";
import { sceneToSvg } from "./svg";

export interface JobCtx {
  signal: AbortSignal;
  onProgress(ratio: number, label: string): void;
}

export interface JobEnv {
  fontSet?: { add(face: FontFace): unknown };
  fetchFn?: typeof fetch;
  canvasFactory?: (w: number, h: number) => OffscreenCanvas;
  decode?: (blob: Blob) => Promise<ImageBitmap>;
}

export type RasterPayload = { scene: Scene; options: RasterOptions; assets: AssetTable; fontBase: string };
export type SvgPayload = { scene: Scene; imageMode: "embed" | "link"; assets: AssetTable; fontBase?: string };

export const CORS_HINT =
  "Some pictures could not be read from storage. If this keeps happening, the storage bucket's CORS rules must allow GET requests from this site.";

function finish(summary: ExportSummary, source: ExportImageSource | null): ExportSummary {
  if (source?.corsSuspected()) summary.warnings.push(CORS_HINT);
  return summary;
}

/** Make the picture source for a job: decoded bitmaps are owned by it and freed by `dispose()`. */
export function sourceFor(assets: AssetTable, env: JobEnv): ExportImageSource {
  return createImageSource(assets, { fetchFn: env.fetchFn, decode: env.decode });
}

export async function runRasterJob(p: RasterPayload, c: JobCtx, env: JobEnv = {}): Promise<{ blob: Blob; summary: ExportSummary }> {
  const set = env.fontSet ?? (globalThis as unknown as { fonts?: { add(f: FontFace): unknown } }).fonts;
  if (set && typeof FontFace !== "undefined") await loadExportFonts(set, p.fontBase, p.scene.fonts);
  const source = sourceFor(p.assets, env);
  try {
    const r = await renderRaster(p.scene, p.options, { images: source, signal: c.signal, onProgress: c.onProgress, canvasFactory: env.canvasFactory });
    return { blob: r.blob, summary: finish(r.summary, source) };
  } finally {
    source.dispose();
  }
}

export async function runSvgJob(p: SvgPayload, c: JobCtx, env: JobEnv = {}): Promise<{ blob: Blob; summary: ExportSummary }> {
  const source = sourceFor(p.assets, env);
  try {
    const images = svgImages(source, p.assets);
    const r = await sceneToSvg(p.scene, { imageMode: p.imageMode, images }, { signal: c.signal, onProgress: c.onProgress });
    const summary = emptySummary();
    summary.failedAssets = r.failedAssets;
    summary.substitutedFonts = substitutedFamilies(p.scene.fonts);
    summary.warnings.push(...p.scene.warnings);
    if (substitutedFamilies(p.scene.fonts).length || p.scene.fonts.length) summary.warnings.push("Fonts are referenced by name and not embedded in the SVG; open it where Inter is installed for exact text.");
    if (images.overCap() > 0) summary.warnings.push(`${images.overCap()} picture(s) were too large to embed. Use "link images" instead.`);
    summary.width = Math.round(p.scene.width);
    summary.height = Math.round(p.scene.height);
    return { blob: new Blob([r.svg], { type: "image/svg+xml" }), summary: finish(summary, source) };
  } finally {
    source.dispose();
  }
}
