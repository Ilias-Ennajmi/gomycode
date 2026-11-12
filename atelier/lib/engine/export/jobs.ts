// What the export worker runs, written as plain async functions so they can be tested without a worker.
import { docFromState } from "@/lib/engine/doc/from-state";
import { createImageSource, createOriginalFetcher, svgImages, type AssetTable, type ExportImageSource } from "./images";
import { bundledFont, loadExportFonts, substitutedFamilies, woffToTtf } from "./fonts";
import { emptySummary, type ExportSummary } from "./protocol";
import { writeBackup, type BackupPlan } from "./backup";
import { toJsonCanvas } from "./json-canvas";
import type { PdfPlan } from "./pdf-plan";
import { renderRaster, type RasterOptions } from "./raster";
import { boardDocSource, type Scene } from "./scene";
import { ZipWriter } from "./zip-writer";
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

export type PdfPayload = { plan: PdfPlan; assets: AssetTable; fontBase: string };

/** TrueType bytes of the bundled fonts, unwrapped from the WOFF files they are shipped as (fetched once each). */
function fontSource(base: string, fetchFn: typeof fetch) {
  const cache = new Map<string, Promise<ArrayBuffer | null>>();
  return {
    ttf(font: { family: string; weight: number; italic: boolean }): Promise<ArrayBuffer | null> {
      const b = bundledFont(font);
      if (!b) return Promise.resolve(null);
      let p = cache.get(b.file);
      if (!p) {
        p = (async () => {
          try {
            const res = await fetchFn(`${base}${b.file}`);
            if (!res.ok) return null;
            const bytes = woffToTtf(new Uint8Array(await res.arrayBuffer()));
            return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
          } catch {
            return null;
          }
        })();
        cache.set(b.file, p);
      }
      return p;
    },
  };
}

export async function runPdfJob(p: PdfPayload, c: JobCtx, env: JobEnv = {}): Promise<{ blob: Blob; summary: ExportSummary }> {
  const { renderPdf } = await import("./pdf");
  const fetchFn = env.fetchFn ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a));
  const source = sourceFor(p.assets, env);
  try {
    const r = await renderPdf(p.plan, { images: source, signal: c.signal, onProgress: c.onProgress, canvasFactory: env.canvasFactory, fonts: fontSource(p.fontBase, fetchFn) });
    return { blob: r.blob, summary: finish(r.summary, source) };
  } finally {
    source.dispose();
  }
}

export type BackupPayload = { plan: BackupPlan; assets: AssetTable };

/** A `.atelier` backup: the board's state, a manifest and every original that can be fetched. */
export async function runBackupJob(p: BackupPayload, c: JobCtx, env: JobEnv = {}): Promise<{ blob: Blob; summary: ExportSummary }> {
  const r = await writeBackup(p.plan, { images: { load: async () => null }, signal: c.signal, onProgress: c.onProgress, fetchOriginal: createOriginalFetcher(p.assets, env.fetchFn) });
  return { blob: r.blob as Blob, summary: r.summary };
}

export type JsonCanvasPayload = { state: Uint8Array; assets: AssetTable; title: string };

/**
 * A JSON Canvas export. With pictures it is a ZIP of `{title}.canvas` and `attachments/` (unpack it into a vault and the
 * file nodes resolve); without, the plain `.canvas` file.
 */
export async function runJsonCanvasJob(p: JsonCanvasPayload, c: JobCtx, env: JobEnv = {}): Promise<{ blob: Blob; summary: ExportSummary }> {
  const doc = docFromState(p.state);
  try {
    const src = boardDocSource(doc);
    const fetchOriginal = createOriginalFetcher(p.assets, env.fetchFn);
    const summary = emptySummary();
    const files = new Map<string, { blob: Blob; path: string }>();
    const ids = Object.keys(p.assets);
    const used = new Set<string>();
    for (const o of src.all()) {
      if (o.type === "image") used.add(o.assetId);
      else if (o.type === "video") used.add(o.assetId);
    }
    let i = 0;
    for (const id of ids) {
      if (c.signal.aborted) throw new DOMException("Aborted", "AbortError");
      if (!used.has(id)) continue;
      c.onProgress((i++ / Math.max(used.size, 1)) * 0.8, `File ${i} of ${used.size}`);
      const got = await fetchOriginal(id);
      if (!got) {
        summary.failedAssets.push(id);
        continue;
      }
      files.set(id, { blob: got.blob, path: `attachments/${id.replace(/[^A-Za-z0-9_-]/g, "_")}.${got.ext}` });
    }
    const { canvas, warnings } = toJsonCanvas(src, { assetPath: (id) => files.get(id)?.path ?? null });
    summary.warnings.push(...warnings);
    const json = JSON.stringify(canvas, null, 2);
    if (files.size === 0) {
      summary.extension = "canvas";
      c.onProgress(1, "Done");
      return { blob: new Blob([json], { type: "application/json" }), summary };
    }
    const zip = new ZipWriter();
    try {
      const base = (p.title || "board").replace(/[^\p{L}\p{N} _-]/gu, "").trim().slice(0, 60) || "board";
      await zip.addBytes(`${base}.canvas`, json, { signal: c.signal });
      for (const f of files.values()) await zip.addBlob(f.path, f.blob, { store: true, signal: c.signal });
      const blob = (await zip.finish()) as Blob;
      summary.extension = "zip";
      c.onProgress(1, "Done");
      return { blob, summary };
    } catch (e) {
      await zip.abort();
      throw e;
    }
  } finally {
    doc.destroy();
  }
}
