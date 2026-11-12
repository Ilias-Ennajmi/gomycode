import { assertAcceptable, browserEnv, ImageError, runPipeline, type ImageErrorReason, type ProcessedImage } from "./pipeline-core";

export { ImageError, MAX_IMAGE_BYTES, type ProcessedImage } from "./pipeline-core";

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
 * Decode, orient (EXIF) and make the 1024 px WebP variant, in a Worker when the browser has one. Throws ImageError
 * (too large, empty, unsupported such as HEIC on Chrome); the message is what a toast should say after the file name.
 */
export async function processImage(file: Blob): Promise<ProcessedImage> {
  assertAcceptable(file);
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
