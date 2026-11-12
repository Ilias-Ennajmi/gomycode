import { createLimiter } from "./limiter";
import {
  assertAcceptable,
  browserEnv,
  ImageError,
  runPipeline,
  type ImageErrorReason,
  type PipelineEnv,
  type ProcessedImage,
} from "./pipeline-core";

export { ImageError, MAX_IMAGE_BYTES, VARIANT_SIZES, variantPlan, type ProcessedImage, type VariantName } from "./pipeline-core";

/** At most this many images are decoded and resized at once (a bulk drop of hundreds must not freeze the tab). */
export const MAX_CONCURRENT_PROCESSING = 3;
const limit = createLimiter(MAX_CONCURRENT_PROCESSING);

type Reply =
  | { id: number; ok: true; result: ProcessedImage }
  | { id: number; ok: false; reason: ImageErrorReason; message: string };

let worker: Worker | null = null;
let nextId = 1;
const waiting = new Map<number, { resolve: (r: ProcessedImage) => void; reject: (e: unknown) => void }>();

function getWorker(): Worker | null {
  if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") return null;
  if (worker) return worker;
  try {
    const w = new Worker(new URL("./pipeline.worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (e: MessageEvent<Reply>) => {
      const p = waiting.get(e.data.id);
      if (!p) return;
      waiting.delete(e.data.id);
      if (e.data.ok) p.resolve(e.data.result);
      else p.reject(new ImageError(e.data.reason, e.data.message));
    };
    w.onerror = () => {
      // The worker died: fail what is waiting and start a fresh one next time.
      for (const p of waiting.values()) p.reject(new ImageError("unsupported", "could not process the image"));
      waiting.clear();
      worker = null;
    };
    worker = w;
    return w;
  } catch {
    return null;
  }
}

/**
 * Decode, orient (EXIF) and make the 256 / 1024 / 2048 px WebP variants that are smaller than the source, in a Worker
 * when the browser has one. At most MAX_CONCURRENT_PROCESSING run at once. Throws ImageError (too large, empty,
 * unsupported such as HEIC on Chrome); the message is what a toast should say after the file name.
 * `opts.env` runs the pipeline on the calling thread with that environment (tests).
 */
export function processImage(file: Blob, opts: { env?: PipelineEnv } = {}): Promise<ProcessedImage> {
  return limit(() => processNow(file, opts.env));
}

async function processNow(file: Blob, env?: PipelineEnv): Promise<ProcessedImage> {
  assertAcceptable(file);
  if (env) return runPipeline(file, env);
  const w = getWorker();
  if (!w) {
    if (typeof createImageBitmap === "undefined" || typeof OffscreenCanvas === "undefined") {
      throw new ImageError("unsupported", "this browser can't process images");
    }
    return runPipeline(file, browserEnv());
  }
  return new Promise<ProcessedImage>((resolve, reject) => {
    const id = nextId++;
    waiting.set(id, { resolve, reject });
    w.postMessage({ id, file });
  });
}
