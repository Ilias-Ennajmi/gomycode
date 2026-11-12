// Round preview images, rendered in the owner's browser at publish time (Vercel has no headless browser, and this browser
// already holds the fonts and picture bitmaps): each frame at 1280 and 480 px wide as WebP, in presentation order, through the
// same export engine that makes the PNGs and the PDF deck. Then the publish flow that uploads them and creates the round.
import { slidesOf } from "@/lib/engine/present/slides";
import type { BoardDoc } from "@/lib/engine/doc/board-doc";
import type { FrameObj } from "@/lib/engine/model/types";
import type { PreviewFrame, Round } from "@/lib/share/round-types";
import { exportImage, previewSceneSize, type ExportDeps } from "./export-api";
import type { AssetSource } from "./images";
import { ExportCancelled } from "./protocol";
import { boardDocSource, type SceneSource } from "./scene";
import type { TextMeasurer } from "./text-layout";

export type { PreviewFrame };

export const PREVIEW_MAX_FRAMES = 100;
export const PREVIEW_QUALITY = 0.82;
const UPLOAD_CONCURRENCY = 4;
const UPLOAD_RETRIES = 2;

export interface RenderedPreview extends PreviewFrame {
  w1280: Blob;
  w480: Blob;
}

export interface PreviewRender {
  frames: RenderedPreview[];
  /** Frame ids whose render threw (they get no preview; the round is still published). */
  failedFrames: string[];
  /** Frame ids with nothing to draw (no preview, not a failure). */
  emptyFrames: string[];
  warnings: string[];
}

export interface PreviewDeps {
  exporter: ExportDeps["manager"];
  assets: AssetSource;
  signal: AbortSignal;
  onProgress(ratio: number, label: string): void;
  measure?: TextMeasurer;
  fontBase?: string;
}

const NO_CHROME = { background: "board", padding: 0, credits: false, frameChrome: false } as const;

/**
 * One image per slide (top-level frame), in slide order. A frame whose render throws is reported in `failedFrames` and skipped,
 * a frame with nothing in it is skipped silently, more than 100 frames render the first 100. Aborting stops before the next
 * render (and cancels the one running) and rejects with ExportCancelled.
 */
export async function renderFramePreviews(src: SceneSource, deps: PreviewDeps): Promise<PreviewRender> {
  const { signal } = deps;
  const check = () => {
    if (signal.aborted) throw new ExportCancelled();
  };
  const frames = src.all().filter((o): o is FrameObj => o.type === "frame");
  const slides = slidesOf(frames);
  const warnings: string[] = [];
  const picked = slides.slice(0, PREVIEW_MAX_FRAMES);
  if (slides.length > PREVIEW_MAX_FRAMES) warnings.push(`Preview images were made for the first ${PREVIEW_MAX_FRAMES} frames only.`);

  const out: PreviewRender = { frames: [], failedFrames: [], emptyFrames: [], warnings };
  const render = async (id: string, widthPx: number) => {
    const handle = exportImage(src, { kind: "frame", id }, { format: "webp", size: { widthPx }, quality: PREVIEW_QUALITY, ...NO_CHROME }, { manager: deps.exporter, assets: deps.assets, measure: deps.measure, fontBase: deps.fontBase });
    const onAbort = () => handle.cancel();
    signal.addEventListener("abort", onAbort, { once: true });
    try {
      return await handle.promise;
    } finally {
      signal.removeEventListener("abort", onAbort);
    }
  };

  deps.onProgress(0, "Rendering previews");
  for (let i = 0; i < picked.length; i++) {
    check();
    const slide = picked[i];
    deps.onProgress(i / picked.length, `Rendering ${slide.name} (${i + 1} of ${picked.length})`);
    // Nothing to draw: no object in it and no background of its own (a plain colour slide is still a picture).
    const frame = src.get(slide.id) as FrameObj | undefined;
    if (previewSceneSize(src, { kind: "frame", id: slide.id }, NO_CHROME).empty && !frame?.background) {
      out.emptyFrames.push(slide.id);
      continue;
    }
    try {
      const big = await render(slide.id, 1280);
      check();
      const small = await render(slide.id, 480);
      out.frames.push({ frameId: slide.id, name: slide.name, w: big.width ?? 1280, h: big.height ?? 720, w1280: big.blob, w480: small.blob });
    } catch (e) {
      check(); // a cancel is not a failed frame
      out.failedFrames.push(slide.id);
      console.warn(`round preview: frame "${slide.name}" could not be rendered`, e);
    }
  }
  check();
  deps.onProgress(1, "Previews ready");
  return out;
}

// ---- the publish flow ------------------------------------------------------------------------------------------------

export interface RoundsApi {
  prepare(
    boardId: string,
    frames: { frameId: string; bytes1280: number; bytes480: number }[],
  ): Promise<{ previewToken: string; uploads: Record<string, { w480: string; w1280: string }> }>;
  create(boardId: string, body: { label: string; previewToken: string | null; frames: PreviewFrame[] }): Promise<Round>;
}

export type PublishErrorCode = "not-synced" | "cancelled" | "needs-server" | "rate-limited" | "too-large" | "server";

export class PublishError extends Error {
  constructor(
    public readonly code: PublishErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PublishError";
  }
}

export const NO_PREVIEW_WARNING = "Published without preview images — clients will see a slightly slower first load";

export interface PublishDeps {
  boardId: string;
  doc: BoardDoc;
  /** Pushes the board's edits to the server. `status` (when given) is read afterwards: offline or error means the server is behind. */
  sync: { flush(): Promise<void>; readonly status?: string };
  api: RoundsApi;
  exporter: ExportDeps["manager"];
  assets: AssetSource;
  /** PUTs the blob to a presigned URL (image/webp). Rejects on failure. */
  upload(url: string, blob: Blob): Promise<void>;
  measure?: TextMeasurer;
  fontBase?: string;
  /** Wait before an upload retry (ms, times the attempt). Default 400. */
  retryDelayMs?: number;
}

export type PublishedRound = Round & { warnings: string[] };

async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/**
 * Flush sync (the server freezes ITS copy of the board, so it must have the latest edits) -> render previews -> ask for upload
 * URLs -> upload (4 at a time, 2 retries) -> create the round. Previews are best effort: any trouble with them still publishes the
 * round (with those frames missing) and returns a warning; only a cancel, a server that is behind, or a failed `create` stop it.
 */
export async function publishRoundFlow(deps: PublishDeps, label: string, signal: AbortSignal, onProgress: (ratio: number, label: string) => void): Promise<PublishedRound> {
  const cancelled = () => new PublishError("cancelled", "Publishing was cancelled.");
  const check = () => {
    if (signal.aborted) throw cancelled();
  };
  const warnings: string[] = [];

  onProgress(0, "Saving your latest edits");
  await deps.sync.flush();
  if (deps.sync.status === "offline" || deps.sync.status === "error") {
    throw new PublishError("not-synced", "The server doesn't have your latest edits yet. Reconnect and try again, so the round matches what you see.");
  }
  check();

  // 1. previews, in the browser
  let rendered: PreviewRender | null = null;
  try {
    rendered = await renderFramePreviews(boardDocSource(deps.doc), {
      exporter: deps.exporter,
      assets: deps.assets,
      signal,
      measure: deps.measure,
      fontBase: deps.fontBase,
      onProgress: (r, l) => onProgress(0.05 + r * 0.55, l),
    });
  } catch (e) {
    if (e instanceof ExportCancelled || signal.aborted) throw cancelled();
    console.warn("round previews failed", e);
    warnings.push(NO_PREVIEW_WARNING);
  }
  check();

  // 2. upload them
  let previewToken: string | null = null;
  const kept: PreviewFrame[] = [];
  if (rendered) {
    warnings.push(...rendered.warnings);
    const wanted = rendered.frames;
    const nameOf = (id: string) => (deps.doc.get(id) as FrameObj | undefined)?.name || id;
    for (const id of rendered.failedFrames) warnings.push(`No preview image for “${nameOf(id)}”: it could not be rendered.`);

    if (wanted.length === 0 && rendered.failedFrames.length > 0) {
      warnings.push(NO_PREVIEW_WARNING);
    } else if (wanted.length > 0) {
      onProgress(0.6, "Uploading previews");
      try {
        const prep = await deps.api.prepare(
          deps.boardId,
          wanted.map((f) => ({ frameId: f.frameId, bytes1280: f.w1280.size, bytes480: f.w480.size })),
        );
        check();
        let done = 0;
        const total = wanted.length * 2;
        const failed = new Set<string>();
        const jobs = wanted.flatMap((f) => [
          { frame: f, url: prep.uploads[f.frameId]?.w1280, blob: f.w1280 },
          { frame: f, url: prep.uploads[f.frameId]?.w480, blob: f.w480 },
        ]);
        await pool(jobs, UPLOAD_CONCURRENCY, async (job) => {
          if (signal.aborted) return;
          let ok = false;
          for (let attempt = 0; attempt <= UPLOAD_RETRIES && job.url && !signal.aborted; attempt++) {
            try {
              await deps.upload(job.url, job.blob);
              ok = true;
              break;
            } catch {
              if (attempt < UPLOAD_RETRIES) await new Promise((r) => setTimeout(r, (deps.retryDelayMs ?? 400) * (attempt + 1)));
            }
          }
          if (!ok) failed.add(job.frame.frameId);
          onProgress(0.6 + (++done / total) * 0.3, "Uploading previews");
        });
        check();
        for (const f of wanted) {
          if (failed.has(f.frameId)) warnings.push(`No preview image for “${f.name}”: the upload failed.`);
          else kept.push({ frameId: f.frameId, name: f.name, w: f.w, h: f.h });
        }
        previewToken = kept.length > 0 ? prep.previewToken : null;
        if (kept.length === 0) warnings.push(NO_PREVIEW_WARNING);
      } catch (e) {
        if (e instanceof PublishError && e.code === "cancelled") throw e;
        check();
        console.warn("round preview upload failed", e);
        kept.length = 0;
        previewToken = null;
        warnings.push(NO_PREVIEW_WARNING);
      }
    }
  }
  check(); // the last point where cancelling creates nothing

  // 3. the round
  onProgress(0.92, "Publishing");
  const round = await deps.api.create(deps.boardId, { label, previewToken, frames: kept });
  onProgress(1, "Published");
  return { ...round, warnings };
}
