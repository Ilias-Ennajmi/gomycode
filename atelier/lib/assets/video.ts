/*
 * Video and GIF assets on the client: type and size checks, the poster frame, and the poster's image variants.
 *
 * A video asset's "original" is the video file itself; its w256 / w1024 variants are WebP stills of the poster frame, so
 * grids, the palette and the library can treat it like any image. The poster of a small clip is the frame itself (a
 * re-encode at its own size, never an upscale), so the two variants always exist and nothing ever puts the video file
 * into an <img>. The browser calls (a <video> element, canvas) are injected as a VideoEnv so the logic can be tested.
 */
import { ImageError, fitWithin, type ProcessedImage } from "./pipeline-core";
import type { VariantName } from "./variants";

export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
export const VIDEO_MIMES = ["video/mp4", "video/webm"] as const;
const VIDEO_EXT = /\.(mp4|webm)$/i;
/** Seconds the browser has to read the metadata, seek and draw the poster frame. */
export const VIDEO_READ_TIMEOUT_MS = 10_000;
/** Longest side of a captured frame: a 4K clip is not turned into a 4K poster. */
const MAX_FRAME_SIDE = 4096;
const WEBP_QUALITY = 0.82;

const mb = (bytes: number) => `${Math.round(bytes / (1024 * 1024))} MB`;

/** mp4 / webm by MIME type, or by extension when the browser gives no type. */
export function isVideoFile(file: Blob & { name?: string }): boolean {
  if (file.type) return (VIDEO_MIMES as readonly string[]).includes(file.type);
  return VIDEO_EXT.test(file.name ?? "");
}

/** The MIME type to store the file under (the extension decides when the browser gave none). */
export function videoMime(file: Blob & { name?: string }): string {
  if ((VIDEO_MIMES as readonly string[]).includes(file.type)) return file.type;
  return /\.webm$/i.test(file.name ?? "") ? "video/webm" : "video/mp4";
}

/** Cheap checks that need no decoding. Throws ImageError (the message reads as the end of "Couldn't add {name}: ..."). */
export function assertVideoAcceptable(file: Blob): void {
  if (file.size === 0) throw new ImageError("empty", "the file is empty");
  if (file.size > MAX_VIDEO_BYTES) {
    throw new ImageError("too-large", `too large (${mb(file.size)}; the limit for videos is ${mb(MAX_VIDEO_BYTES)})`);
  }
}

/** Where the poster frame is taken by default: 10% into the clip, but at most 1 s. 0 when the length is unknown. */
export function posterTimeFor(duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return Math.min(1, duration * 0.1);
}

/**
 * w256 and w1024 for a poster. The pipeline makes only sizes below the source's longest side, which leaves a small frame
 * with none; the frame itself (already a WebP no bigger than 1024 px in that case) stands in for the missing ones. Adds
 * nothing when the frame is not a WebP.
 */
export function ensurePosterVariants(variants: Partial<Record<VariantName, Blob>>, frame: Blob): Partial<Record<VariantName, Blob>> {
  const out = { ...variants };
  if (frame.type !== "image/webp") return out;
  if (!out.w256) out.w256 = frame;
  if (!out.w1024) out.w1024 = frame;
  return out;
}

// ---- the browser side -------------------------------------------------------------------------------------------

/** The part of HTMLVideoElement the poster capture uses. */
export interface VideoLike {
  muted: boolean;
  playsInline: boolean;
  preload: string;
  src: string;
  readonly videoWidth: number;
  readonly videoHeight: number;
  readonly duration: number;
  currentTime: number;
  addEventListener(type: string, listener: () => void, options?: { once?: boolean }): void;
  removeEventListener(type: string, listener: () => void): void;
  load(): void;
  removeAttribute(name: string): void;
}

export interface VideoEnv {
  createVideo(): VideoLike;
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
  /** Draw the current frame at w x h and encode it (WebP where the browser can). */
  frameToBlob(video: VideoLike, w: number, h: number): Promise<Blob>;
}

export function browserVideoEnv(): VideoEnv {
  return {
    createVideo: () => document.createElement("video") as unknown as VideoLike,
    createObjectURL: (b) => URL.createObjectURL(b),
    revokeObjectURL: (u) => URL.revokeObjectURL(u),
    frameToBlob: (video, w, h) => drawFrame(video as unknown as CanvasImageSource, w, h),
  };
}

async function drawFrame(source: CanvasImageSource, w: number, h: number): Promise<Blob> {
  if (typeof OffscreenCanvas !== "undefined") {
    const c = new OffscreenCanvas(w, h);
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("Couldn't read video");
    ctx.drawImage(source, 0, 0, w, h);
    return c.convertToBlob({ type: "image/webp", quality: WEBP_QUALITY });
  }
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Couldn't read video");
  ctx.drawImage(source, 0, 0, w, h);
  return new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't read video"))), "image/webp", WEBP_QUALITY));
}

/**
 * The frame a <video> element shows right now, as a WebP (or whatever the browser encodes). Throws "Couldn't read this
 * frame" when the element has no picture yet or the video's host does not allow reading its pixels (cross-origin without
 * CORS).
 */
export async function captureVideoFrame(video: HTMLVideoElement): Promise<Blob> {
  const { videoWidth: vw, videoHeight: vh } = video;
  if (!(vw > 0 && vh > 0) || video.readyState < 2) throw new Error("Couldn't read this frame");
  const { w, h } = fitWithin(vw, vh, MAX_FRAME_SIDE);
  try {
    return await drawFrame(video, w, h);
  } catch {
    throw new Error("Couldn't read this frame");
  }
}

/** The first frame of an animated image (GIF) as a WebP, or null when the browser cannot decode or draw it. Never throws. */
export async function firstFrameOf(file: Blob): Promise<Blob | null> {
  try {
    if (typeof createImageBitmap !== "function") return null;
    const bitmap = await createImageBitmap(file);
    try {
      const { w, h } = fitWithin(bitmap.width, bitmap.height, MAX_FRAME_SIDE);
      return await drawFrame(bitmap, w, h);
    } finally {
      bitmap.close?.();
    }
  } catch {
    return null;
  }
}

export type ProcessedVideo = {
  width: number;
  height: number;
  /** Seconds; 0 when the browser does not know it. */
  duration: number;
  /** Where the poster frame was taken. */
  posterTime: number;
  mime: string;
  /** The video file itself. */
  original: Blob;
  /** The poster frame through the image pipeline; its variants always include w256 and w1024. */
  poster: ProcessedImage;
};

export type ProcessVideoOptions = {
  /** Seconds into the clip; default posterTimeFor(duration). */
  posterAt?: number;
  env?: VideoEnv;
  /** The image pipeline (default: processImage). */
  process?: (frame: Blob) => Promise<ProcessedImage>;
  timeoutMs?: number;
};

const fail = () => new Error("Couldn't read video");

function once(target: VideoLike, ok: string, bad = "error"): { done: Promise<void>; stop(): void } {
  let stop = () => {};
  const done = new Promise<void>((resolve, reject) => {
    const onOk = () => {
      stop();
      resolve();
    };
    const onBad = () => {
      stop();
      reject(fail());
    };
    stop = () => {
      target.removeEventListener(ok, onOk);
      target.removeEventListener(bad, onBad);
    };
    target.addEventListener(ok, onOk, { once: true });
    target.addEventListener(bad, onBad, { once: true });
  });
  return { done, stop };
}

/**
 * Read a video's size and length and capture its poster frame (muted, never played). The poster goes through the image
 * pipeline, so it gets the same WebP variants as a picture. Rejects with Error("Couldn't read video") when the browser
 * cannot decode the file or does not get a frame within 10 s.
 */
export async function processVideo(file: Blob, opts: ProcessVideoOptions = {}): Promise<ProcessedVideo> {
  assertVideoAcceptable(file);
  const env = opts.env ?? browserVideoEnv();
  const process = opts.process ?? ((frame: Blob) => import("./pipeline").then((m) => m.processImage(frame)));
  const video = env.createVideo();
  const url = env.createObjectURL(file);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const waits: { stop(): void }[] = [];

  const read = async () => {
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    const meta = once(video, "loadedmetadata");
    waits.push(meta);
    video.src = url;
    video.load();
    await meta.done;
    const { videoWidth: width, videoHeight: height } = video;
    if (!(width > 0 && height > 0)) throw fail();
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    const wanted = opts.posterAt ?? posterTimeFor(duration);
    const last = duration > 0 ? Math.max(0, duration - 0.05) : Infinity;
    // Always seek (never stay at 0): seeking is what makes the browser load the frame it will draw.
    const at = Math.max(0.001, Math.min(Number.isFinite(wanted) && wanted > 0 ? wanted : 0, last));
    const seek = once(video, "seeked");
    waits.push(seek);
    video.currentTime = at;
    await seek.done;
    const size = fitWithin(width, height, MAX_FRAME_SIDE);
    const frame = await env.frameToBlob(video, size.w, size.h);
    const poster = await process(frame);
    poster.variants = ensurePosterVariants(poster.variants, frame);
    const mime = videoMime(file as Blob & { name?: string });
    const original = file.type === mime ? file : new Blob([file], { type: mime });
    return { width, height, duration, posterTime: at, mime, original, poster };
  };

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(fail()), opts.timeoutMs ?? VIDEO_READ_TIMEOUT_MS);
  });
  const work = read();
  work.catch(() => undefined); // a failure after the timeout already won is not an unhandled rejection
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
    for (const w of waits) w.stop();
    video.removeAttribute("src");
    try {
      video.load();
    } catch {
      /* nothing to release */
    }
    env.revokeObjectURL(url);
  }
}
