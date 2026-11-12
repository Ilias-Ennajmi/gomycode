/*
 * The image pipeline's decisions, free of browser globals so they can be tested: size limits, error wording, the
 * 1024 px variant size. The browser calls (createImageBitmap, OffscreenCanvas) are injected as a PipelineEnv; the real
 * one lives in pipeline.worker.ts (and in pipeline.ts when no Worker is available).
 */

export const MAX_IMAGE_BYTES = 50 * 1024 * 1024;
export const VARIANT_MAX_SIDE = 1024;
export const WEBP_QUALITY = 0.82;
/** Decoded images beyond this many pixels per side are refused (a decompression bomb would freeze the tab). */
export const MAX_IMAGE_SIDE = 32_768;

export type ImageErrorReason = "too-large" | "unsupported" | "empty";

/** Thrown for a file we will not add. `message` reads as the end of "Couldn't add {name}: ...". */
export class ImageError extends Error {
  readonly reason: ImageErrorReason;
  constructor(reason: ImageErrorReason, message: string) {
    super(message);
    this.name = "ImageError";
    this.reason = reason;
  }
}

export interface DecodedBitmap {
  width: number;
  height: number;
  close?(): void;
}

export interface PipelineEnv {
  createImageBitmap(file: Blob, options: { imageOrientation: "from-image" }): Promise<DecodedBitmap>;
  encodeWebp(bitmap: DecodedBitmap, width: number, height: number, quality: number): Promise<Blob>;
}

export type ProcessedImage = {
  width: number;
  height: number;
  /** MIME type of the original file. */
  mime: string;
  variants: { w1024: Blob };
  original: Blob;
};

const mb = (bytes: number) => `${Math.round(bytes / (1024 * 1024))} MB`;

/** Largest size with the same aspect ratio whose longest side is at most `max`. Never scales up. */
export function fitWithin(w: number, h: number, max: number): { w: number; h: number } {
  const longest = Math.max(w, h);
  if (longest <= max) return { w, h };
  const s = max / longest;
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}

/** Cheap checks that need no decoding. Throws ImageError. */
export function assertAcceptable(file: Blob): void {
  if (file.size === 0) throw new ImageError("empty", "the file is empty");
  if (file.size > MAX_IMAGE_BYTES) {
    throw new ImageError("too-large", `too large (${mb(file.size)}; the limit is ${mb(MAX_IMAGE_BYTES)})`);
  }
}

export async function runPipeline(file: Blob, env: PipelineEnv): Promise<ProcessedImage> {
  assertAcceptable(file);
  const mime = file.type || "application/octet-stream";

  let bitmap: DecodedBitmap;
  try {
    bitmap = await env.createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new ImageError("unsupported", `unsupported format (${mime}); this browser can't read it`);
  }
  try {
    const { width, height } = bitmap;
    if (!(width > 0 && height > 0) || width > MAX_IMAGE_SIDE || height > MAX_IMAGE_SIDE) {
      throw new ImageError("unsupported", `unsupported image size (${width} x ${height})`);
    }
    const v = fitWithin(width, height, VARIANT_MAX_SIDE);
    const w1024 = await env.encodeWebp(bitmap, v.w, v.h, WEBP_QUALITY);
    return { width, height, mime, variants: { w1024 }, original: file };
  } finally {
    bitmap.close?.();
  }
}

/** The real environment, for a Worker or the main thread. */
export function browserEnv(): PipelineEnv {
  return {
    createImageBitmap: (file, options) => createImageBitmap(file, options),
    async encodeWebp(bitmap, width, height, quality) {
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no 2d context");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bitmap as ImageBitmap, 0, 0, width, height);
      return canvas.convertToBlob({ type: "image/webp", quality });
    },
  };
}
