/*
 * The image pipeline's decisions, free of browser globals so they can be tested: size limits, error wording, which
 * variants to make. The browser calls (createImageBitmap, OffscreenCanvas) are injected as a PipelineEnv; the real
 * one lives in pipeline.worker.ts (and in pipeline.ts when no Worker is available).
 */
import { extractPalette, type RawImage } from "@/lib/engine/color/extract";
import { dhash } from "@/lib/engine/color/phash";
import type { PaletteColor } from "@/lib/engine/model/types";
import { VARIANT_SIZES, variantPlan, type VariantName } from "./variants";

export { VARIANT_SIZES, variantPlan, type VariantName };

export const MAX_IMAGE_BYTES = 50 * 1024 * 1024;
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
  /**
   * RGBA pixels of the bitmap shrunk to at most `maxSide` px on its longest side, for the colour analysis. Optional: an
   * environment without it (or one that throws) just produces no palette and no hash.
   */
  readPixels?(bitmap: DecodedBitmap, maxSide: number): RawImage | Promise<RawImage>;
}

/** The longest side of the pixel sample the colour analysis reads back. */
export const ANALYSIS_SIDE = 64;

export type Analysis = { palette: PaletteColor[]; phash: string };

export type ProcessedImage = {
  /** Pixel size after EXIF orientation. */
  width: number;
  height: number;
  /** MIME type of the original file. */
  mime: string;
  original: Blob;
  /** Only sizes strictly smaller than the longest source side: a variant is never an upscale. */
  variants: Partial<Record<VariantName, Blob>>;
  /** GIF / animated WebP / APNG / AVIF sequence: the original is kept and the variants show the first frame only. */
  animated: boolean;
  /** Filled by the colour analysis. */
  palette?: PaletteColor[];
  phash?: string;
};

const mb = (bytes: number) => `${Math.round(bytes / (1024 * 1024))} MB`;

/** Largest size with the same aspect ratio whose longest side is at most `max`. Never scales up. */
export function fitWithin(w: number, h: number, max: number): { w: number; h: number } {
  const longest = Math.max(w, h);
  if (longest <= max) return { w, h };
  const s = max / longest;
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}

/**
 * Intermediate and final sizes for shrinking `sw x sh` to `dw x dh` without aliasing: halve while the image is more
 * than twice the target on either axis, then one final resize to the target. Empty when there is nothing to do.
 */
export function downscaleSteps(sw: number, sh: number, dw: number, dh: number): { w: number; h: number }[] {
  const steps: { w: number; h: number }[] = [];
  let w = Math.max(1, Math.round(sw));
  let h = Math.max(1, Math.round(sh));
  const tw = Math.max(1, Math.round(dw));
  const th = Math.max(1, Math.round(dh));
  while (w > tw * 2 || h > th * 2) {
    w = Math.max(tw, Math.max(1, Math.round(w / 2)));
    h = Math.max(th, Math.max(1, Math.round(h / 2)));
    steps.push({ w, h });
  }
  if (w !== tw || h !== th) steps.push({ w: tw, h: th });
  return steps;
}

/** Cheap checks that need no decoding. Throws ImageError. */
export function assertAcceptable(file: Blob): void {
  if (file.size === 0) throw new ImageError("empty", "the file is empty");
  if (file.size > MAX_IMAGE_BYTES) {
    throw new ImageError("too-large", `too large (${mb(file.size)}; the limit is ${mb(MAX_IMAGE_BYTES)})`);
  }
}

const ascii = (b: Uint8Array, at: number, s: string): boolean => {
  if (at < 0 || at + s.length > b.length) return false;
  for (let i = 0; i < s.length; i++) if (b[at + i] !== s.charCodeAt(i)) return false;
  return true;
};

/** Number of frames in a GIF (walks the blocks; stops at the first inconsistency). */
function gifFrames(b: Uint8Array): number {
  if (!ascii(b, 0, "GIF8") || b.length < 13) return 0;
  let p = 13;
  if (b[10] & 0x80) p += 3 * (1 << ((b[10] & 7) + 1));
  const skipSubBlocks = () => {
    while (p < b.length) {
      const n = b[p++];
      if (n === 0) return true;
      p += n;
    }
    return false;
  };
  let frames = 0;
  while (p < b.length) {
    const tag = b[p++];
    if (tag === 0x3b) break;
    if (tag === 0x21) {
      p++; // extension label
      if (!skipSubBlocks()) break;
    } else if (tag === 0x2c) {
      if (p + 9 > b.length) break;
      const packed = b[p + 8];
      p += 9;
      if (packed & 0x80) p += 3 * (1 << ((packed & 7) + 1));
      p++; // LZW minimum code size
      if (!skipSubBlocks()) break;
      frames++;
      if (frames > 1) return frames;
    } else {
      break;
    }
  }
  return frames;
}

/** True when the file is an animated image (GIF with several frames, animated WebP, APNG, AVIF sequence). Never throws. */
export async function detectAnimated(file: Blob): Promise<boolean> {
  try {
    if (file.size === 0) return false;
    const type = file.type;
    if (type === "image/gif") return gifFrames(new Uint8Array(await file.arrayBuffer())) > 1;
    const head = new Uint8Array(await file.slice(0, 64 * 1024).arrayBuffer());
    if (ascii(head, 0, "GIF8")) return gifFrames(new Uint8Array(await file.arrayBuffer())) > 1;
    if (ascii(head, 0, "RIFF") && ascii(head, 8, "WEBP")) {
      // The first chunk of an extended WebP is VP8X; bit 1 (0x02) of its flags byte is "animation".
      return ascii(head, 12, "VP8X") && head.length > 20 && (head[20] & 0x02) !== 0;
    }
    if (head.length > 8 && head[0] === 0x89 && ascii(head, 1, "PNG")) {
      // Chunks: length(4) type(4) data crc(4). acTL must come before the first IDAT.
      let p = 8;
      while (p + 8 <= head.length) {
        const len = (head[p] << 24) | (head[p + 1] << 16) | (head[p + 2] << 8) | head[p + 3];
        if (ascii(head, p + 4, "acTL")) return true;
        if (ascii(head, p + 4, "IDAT") || len < 0) return false;
        p += 12 + len;
      }
      return false;
    }
    if (ascii(head, 4, "ftyp")) return ascii(head, 8, "avis");
    return false;
  } catch {
    return false;
  }
}

/**
 * Palette (k-means in OKLab) and perceptual hash (dHash) of a decoded bitmap, or null when the environment cannot read
 * pixels or fails: colour analysis is an extra and must never stop an image from being added.
 */
async function analyseBitmap(bitmap: DecodedBitmap, env: PipelineEnv): Promise<Analysis | null> {
  if (!env.readPixels) return null;
  try {
    const raw = await env.readPixels(bitmap, ANALYSIS_SIDE);
    return { palette: extractPalette(raw), phash: dhash(raw) };
  } catch {
    return null;
  }
}

/**
 * Decode a file and run only the colour analysis (no variants): for images added before Phase 2. Throws ImageError when
 * the file is empty, too large, unreadable or the environment cannot read pixels.
 */
export async function runAnalysis(file: Blob, env: PipelineEnv): Promise<Analysis> {
  assertAcceptable(file);
  const mime = file.type || "application/octet-stream";
  let bitmap: DecodedBitmap;
  try {
    bitmap = await env.createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new ImageError("unsupported", `unsupported format (${mime}); this browser can't read it`);
  }
  try {
    if (!(bitmap.width > 0 && bitmap.height > 0) || bitmap.width > MAX_IMAGE_SIDE || bitmap.height > MAX_IMAGE_SIDE) {
      throw new ImageError("unsupported", `unsupported image size (${bitmap.width} x ${bitmap.height})`);
    }
    const out = await analyseBitmap(bitmap, env);
    if (!out) throw new ImageError("unsupported", "could not read the image's colours");
    return out;
  } finally {
    bitmap.close?.();
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
    const animated = await detectAnimated(file);
    const variants: Partial<Record<VariantName, Blob>> = {};
    for (const name of variantPlan(width, height)) {
      const v = fitWithin(width, height, VARIANT_SIZES[name]);
      variants[name] = await env.encodeWebp(bitmap, v.w, v.h, WEBP_QUALITY);
    }
    const analysis = await analyseBitmap(bitmap, env);
    return { width, height, mime, original: file, variants, animated, ...(analysis ?? {}) };
  } finally {
    bitmap.close?.();
  }
}

/** The real environment, for a Worker or the main thread. */
export function browserEnv(): PipelineEnv {
  return {
    createImageBitmap: (file, options) => createImageBitmap(file, options),
    async encodeWebp(bitmap, width, height, quality) {
      // Shrink in halving steps (each from the previous result) so no pixel is skipped, then encode.
      let source: ImageBitmap | OffscreenCanvas = bitmap as ImageBitmap;
      const steps = downscaleSteps(bitmap.width, bitmap.height, width, height);
      let canvas = new OffscreenCanvas(width, height);
      for (const step of steps.length ? steps : [{ w: width, h: height }]) {
        canvas = new OffscreenCanvas(step.w, step.h);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("no 2d context");
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(source, 0, 0, step.w, step.h);
        source = canvas;
      }
      return canvas.convertToBlob({ type: "image/webp", quality });
    },
    readPixels(bitmap, maxSide) {
      const size = fitWithin(bitmap.width, bitmap.height, maxSide);
      let source: ImageBitmap | OffscreenCanvas = bitmap as ImageBitmap;
      let canvas = new OffscreenCanvas(size.w, size.h);
      for (const step of downscaleSteps(bitmap.width, bitmap.height, size.w, size.h)) {
        canvas = new OffscreenCanvas(step.w, step.h);
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) throw new Error("no 2d context");
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(source, 0, 0, step.w, step.h);
        source = canvas;
      }
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("no 2d context");
      // No steps means the image already fits: draw it as it is.
      if (source === (bitmap as unknown)) ctx.drawImage(source, 0, 0);
      const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      return { data, width, height };
    },
  };
}
