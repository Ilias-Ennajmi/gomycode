// Main-thread entry point of the ZIP export: reads what the board holds (pictures and videos, palette, frames), then runs
// `buildZip`. The heavy work is elsewhere: each original is a plain fetch, each frame image is a raster job in the export
// worker, and the archive is written in 1 MB slices that yield between them, so the page stays responsive.
import type { AssetMeta } from "@/lib/assets/meta-store";
import { aggregatePalette } from "@/lib/engine/color/aggregate";
import type { BoardDoc } from "@/lib/engine/doc/board-doc";
import { creditsRows } from "@/lib/engine/provenance/credits";
import { exportFileName, exportImage, type ExportDeps, type ExportHandle, type ExportResult } from "./export-api";
import { buildAssetTable, createOriginalFetcher } from "./images";
import type { NamedColor } from "./palette-formats";
import { ExportCancelled } from "./protocol";
import { boardDocSource, framesInOrder } from "./scene";
import { buildZip, estimateZipBytes, type ZipAssetInput } from "./zip";

export interface ZipPlan {
  assets: ZipAssetInput[];
  palette: NamedColor[];
  frames: { frameId: string; name: string }[];
  estimatedBytes: number;
  /** Where the palette came from: the board's palette object, a mix of the pictures' colours, or nowhere. */
  paletteSource: "board" | "pictures" | "none";
}

type MetaLike = { get(id: string): Pick<AssetMeta, "title" | "bytes" | "palette"> | undefined };

/** What a ZIP of this board would hold: each asset once (z-order), the palette and the frames, with a size estimate. */
export function planZipExport(doc: BoardDoc, meta: MetaLike): ZipPlan {
  const assets: ZipAssetInput[] = [];
  const seen = new Set<string>();
  let paletteObj: ReturnType<BoardDoc["all"]>[number] | null = null;
  const pictures: { palette: { hex: string; weight: number }[]; area: number }[] = [];
  for (const o of doc.all()) {
    if (o.type === "palette" && !paletteObj) paletteObj = o;
    if (o.type !== "image" && o.type !== "video") continue;
    const m = meta.get(o.assetId);
    if (o.type === "image" && m?.palette) pictures.push({ palette: m.palette, area: o.w * o.h });
    if (seen.has(o.assetId)) continue;
    seen.add(o.assetId);
    const own = o.type === "image" ? o.title.trim() : "";
    assets.push({ assetId: o.assetId, title: own || m?.title.trim() || (o.type === "image" ? "image" : "video"), bytes: m?.bytes ?? 0 });
  }

  let palette: NamedColor[] = [];
  let paletteSource: ZipPlan["paletteSource"] = "none";
  if (paletteObj && paletteObj.type === "palette" && paletteObj.swatches.length > 0) {
    palette = paletteObj.swatches.map((s) => ({ hex: s.hex, name: s.name, weight: s.weight }));
    paletteSource = "board";
  } else if (pictures.length > 0) {
    palette = aggregatePalette(pictures, { maxColors: 8, locked: [] }).map((s) => ({ hex: s.hex, name: s.name, weight: s.weight }));
    if (palette.length > 0) paletteSource = "pictures";
  }

  const frames = framesInOrder(boardDocSource(doc)).map((f) => ({ frameId: f.id, name: f.name }));
  return { assets, palette, frames, estimatedBytes: estimateZipBytes(assets), paletteSource };
}

export interface ZipExportOptions {
  includeCredits: boolean;
  includePalette: boolean;
  /** One PNG per frame, in presentation order. */
  includeFrames: boolean;
  /** A file chosen with the File System Access API: the ZIP is streamed into it and no Blob is made. */
  sink?: WritableStream<Uint8Array>;
}

export interface ZipExportDeps extends ExportDeps {
  meta: MetaLike;
  fetchFn?: typeof fetch;
}

export interface ZipExportResult extends Omit<ExportResult, "blob"> {
  /** Null when the ZIP was streamed into a sink. */
  blob: Blob | null;
  fileCount: number;
}

/**
 * The ZIP export: originals, `credits.csv`, palette files and frame images. Cancel stops the download and the writing at once,
 * leaves no file (the Blob is never made; a sink is aborted) and rejects with ExportCancelled.
 */
export function exportZip(doc: BoardDoc, o: ZipExportOptions, deps: ZipExportDeps): ExportHandle<ZipExportResult> {
  const ac = new AbortController();
  const src = boardDocSource(doc);
  const promise = (async (): Promise<ZipExportResult> => {
    const plan = planZipExport(doc, deps.meta);
    const table = buildAssetTable(plan.assets.map((a) => a.assetId), deps.assets);
    const fetchOriginal = createOriginalFetcher(table, deps.fetchFn);
    const title = doc.meta.title.trim() || "board";

    const renderFrame = async (frameId: string, signal: AbortSignal): Promise<Blob | null> => {
      const h = exportImage(src, { kind: "frame", id: frameId }, { format: "png", size: { scale: 1 } }, { ...deps, onProgress: undefined });
      const stop = () => h.cancel();
      signal.addEventListener("abort", stop, { once: true });
      try {
        return (await h.promise).blob;
      } finally {
        signal.removeEventListener("abort", stop);
      }
    };

    try {
      const r = await buildZip(
        {
          boardTitle: title,
          assets: plan.assets,
          palette: plan.palette,
          includePalette: o.includePalette,
          credits: o.includeCredits ? (fileOf) => creditsRows(doc, { fileFor: (obj) => fileOf(obj.assetId) }) : null,
          frames: o.includeFrames && plan.frames.length > 0 ? plan.frames : null,
        },
        { signal: ac.signal, onProgress: (ratio, label) => deps.onProgress?.(ratio, label), fetchOriginal, renderFrame, sink: o.sink },
      );
      return { blob: r.blob, summary: r.summary, fileCount: r.fileCount, filename: exportFileName(src, { kind: "board" }, "zip") };
    } catch (e) {
      if (ac.signal.aborted || (e instanceof DOMException && e.name === "AbortError")) throw new ExportCancelled();
      throw e;
    }
  })();
  return { promise, cancel: () => ac.abort() };
}

