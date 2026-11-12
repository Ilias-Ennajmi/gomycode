// Raster writer: draws a Scene onto a 2D canvas (an OffscreenCanvas in the export worker) and encodes PNG, JPEG or WebP.
import { toDisplayCrop } from "@/lib/engine/model/image-style";
import { LIGHT_TOKENS } from "./colors";
import { canvasFont, loadExportFonts, substitutedFamilies } from "./fonts";
import { abortError, type ExportSummary } from "./protocol";
import type { ClipRect, Scene, SceneNode } from "./scene";

/** Browser canvases stop working above these sizes (Chrome and Firefox 16,384 px a side, Safari 268 megapixels). */
export const MAX_CANVAS_SIDE = 16384;
export const MAX_CANVAS_AREA = 268_000_000;
const PAPER = "#F5F2EC";
const PREFETCH = 4;
const PROGRESS_EVERY = 25;

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

/**
 * The output size of a scene at a scale (or exact width), reduced to fit one canvas when needed. Never throws and never
 * returns a zero size: a hostile request (NaN, 0, negative) reads as 1x.
 */
export function clampScale(
  scene: { width: number; height: number },
  req: { scale: number } | { widthPx: number },
): { scale: number; width: number; height: number; clamped: boolean; reason?: string } {
  const sw = Number.isFinite(scene.width) && scene.width > 0 ? scene.width : 1;
  const sh = Number.isFinite(scene.height) && scene.height > 0 ? scene.height : 1;
  let scale: number;
  if ("widthPx" in req) scale = Number.isFinite(req.widthPx) && req.widthPx >= 1 ? req.widthPx / sw : 1;
  else scale = Number.isFinite(req.scale) && req.scale > 0 ? req.scale : 1;

  const bySide = Math.min(MAX_CANVAS_SIDE / sw, MAX_CANVAS_SIDE / sh);
  const byArea = Math.sqrt(MAX_CANVAS_AREA / (sw * sh));
  const max = Math.min(bySide, byArea);
  let reason: string | undefined;
  let clamped = false;
  if (scale * sw > MAX_CANVAS_SIDE + 1e-6 || scale * sh > MAX_CANVAS_SIDE + 1e-6 || scale * sw * scale * sh > MAX_CANVAS_AREA) {
    clamped = true;
    scale = max;
    if (bySide <= byArea) reason = sw >= sh ? `Reduced to ${fmt(MAX_CANVAS_SIDE)} px wide (browser limit)` : `Reduced to ${fmt(MAX_CANVAS_SIDE)} px tall (browser limit)`;
    else reason = `Reduced to ${fmt(MAX_CANVAS_AREA / 1e6)} megapixels (memory limit)`;
  }
  const floor = clamped ? Math.floor : Math.round;
  return { scale, width: Math.max(1, floor(sw * scale)), height: Math.max(1, floor(sh * scale)), clamped, reason };
}

export type RasterOptions = { scale: number; format: "png" | "jpeg" | "webp"; quality: number; transparent: boolean };

export interface ImageProvider {
  /**
   * (The provider owns the bitmap: callers draw it and never close it.)
   * A bitmap of the asset at least `neededPx` on its longest side when the asset has that much (the best variant for the
   * output scale), or null when it cannot be read. `noOriginal` keeps a video's file from being loaded as a picture.
   */
  load(assetId: string, neededPx: number, opts?: { noOriginal?: boolean }): Promise<ImageBitmap | null>;
}

export interface JobDeps {
  images: ImageProvider;
  signal: AbortSignal;
  onProgress(ratio: number, label: string): void;
  canvasFactory?: (w: number, h: number) => OffscreenCanvas;
}

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type ImageNode = Extract<SceneNode, { kind: "image" }>;
type TextNode = Extract<SceneNode, { kind: "text" }>;

const MIME = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" } as const;

// ---- drawing helpers -------------------------------------------------------------------------------------------------

function rectPath(ctx: Ctx, x: number, y: number, w: number, h: number, rx: number, ry: number): void {
  ctx.beginPath();
  if (rx <= 0 || ry <= 0) {
    ctx.rect(x, y, w, h);
    return;
  }
  if (rx * 2 >= w - 1e-6 && ry * 2 >= h - 1e-6) {
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    return;
  }
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, w, h, [{ x: rx, y: ry }]);
    return;
  }
  const r = Math.min(rx, ry, w / 2, h / 2);
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function clipPath(ctx: Ctx, c: ClipRect): void {
  if (c.outer) clipPath(ctx, c.outer);
  ctx.beginPath();
  if (c.rotation) {
    ctx.save();
    ctx.translate(c.x + c.w / 2, c.y + c.h / 2);
    ctx.rotate(c.rotation);
    ctx.rect(-c.w / 2, -c.h / 2, c.w, c.h);
    ctx.restore();
  } else ctx.rect(c.x, c.y, c.w, c.h);
  ctx.clip();
}

function strokeStyleOf(ctx: Ctx, p: { stroke: string | null; strokeWidth: number; dash: number[] | null; cap?: "round" }): boolean {
  if (!p.stroke || !(p.strokeWidth > 0)) return false;
  ctx.strokeStyle = p.stroke;
  ctx.lineWidth = p.strokeWidth;
  ctx.setLineDash(p.dash ?? []);
  ctx.lineCap = p.cap === "round" ? "round" : "butt";
  ctx.lineJoin = "round";
  return true;
}

function placeholder(ctx: Ctx, x: number, y: number, w: number, h: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.fillStyle = LIGHT_TOKENS["--color-border"];
  ctx.fill();
  ctx.clip();
  ctx.strokeStyle = LIGHT_TOKENS["--color-muted"];
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 1;
  ctx.beginPath();
  const step = 12;
  for (let k = -h; k < w; k += step) {
    ctx.moveTo(x + k, y + h);
    ctx.lineTo(x + k + h, y);
  }
  ctx.stroke();
  ctx.restore();
}

/** Source window (in bitmap pixels) of an image node, honouring its crop, its flip and cover fitting. */
function sourceWindow(n: ImageNode, bw: number, bh: number): { sx: number; sy: number; sw: number; sh: number } {
  if (n.fit === "cover") {
    const boxRatio = n.w / Math.max(n.h, 1e-6);
    const imgRatio = bw / Math.max(bh, 1e-6);
    if (imgRatio > boxRatio) {
      const sw = bh * boxRatio;
      return { sx: (bw - sw) / 2, sy: 0, sw, sh: bh };
    }
    const sh = bw / boxRatio;
    return { sx: 0, sy: (bh - sh) / 2, sw: bw, sh };
  }
  if (!n.crop) return { sx: 0, sy: 0, sw: bw, sh: bh };
  const c = toDisplayCrop(n.crop, n.flipX, n.flipY);
  return { sx: c.x * bw, sy: c.y * bh, sw: c.w * bw, sh: c.h * bh };
}

function supportsFilter(ctx: Ctx): boolean {
  return typeof (ctx as { filter?: unknown }).filter === "string";
}

/**
 * Draw one image node with its bitmap: rotation about the centre, mask clip, flip, crop window, grayscale and opacity.
 * `scale` is output pixels per scene unit (used for the grayscale fallback). Shared by the PDF writer.
 */
export function drawImageNode(ctx: Ctx, n: ImageNode, bmp: ImageBitmap, scale: number, factory?: (w: number, h: number) => OffscreenCanvas): void {
  ctx.save();
  ctx.globalAlpha *= n.opacity;
  ctx.translate(n.x + n.w / 2, n.y + n.h / 2);
  if (n.rotation) ctx.rotate(n.rotation);
  if (n.rx > 0 || n.ry > 0) {
    rectPath(ctx, -n.w / 2, -n.h / 2, n.w, n.h, n.rx, n.ry);
    ctx.clip();
  }
  ctx.scale(n.flipX ? -1 : 1, n.flipY ? -1 : 1);
  const { sx, sy, sw, sh } = sourceWindow(n, bmp.width, bmp.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  if (n.grayscale && !supportsFilter(ctx) && factory) {
    const tw = Math.max(1, Math.round(n.w * scale));
    const th = Math.max(1, Math.round(n.h * scale));
    const tmp = factory(tw, th);
    const tctx = tmp.getContext("2d") as OffscreenCanvasRenderingContext2D;
    tctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, tw, th);
    const data = tctx.getImageData(0, 0, tw, th);
    const px = data.data;
    for (let i = 0; i < px.length; i += 4) {
      const g = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
      px[i] = px[i + 1] = px[i + 2] = g;
    }
    tctx.putImageData(data, 0, 0);
    ctx.drawImage(tmp as unknown as CanvasImageSource, -n.w / 2, -n.h / 2, n.w, n.h);
  } else {
    if (n.grayscale && supportsFilter(ctx)) (ctx as { filter: string }).filter = "grayscale(1)";
    ctx.drawImage(bmp, sx, sy, sw, sh, -n.w / 2, -n.h / 2, n.w, n.h);
  }
  ctx.restore();
}

function drawText(ctx: Ctx, n: TextNode): void {
  ctx.save();
  ctx.globalAlpha *= n.opacity;
  if (n.rotation) {
    ctx.translate(n.cx, n.cy);
    ctx.rotate(n.rotation);
    ctx.translate(-n.cx, -n.cy);
  }
  ctx.textBaseline = "alphabetic";
  for (const line of n.lines) {
    const y = n.y + line.y;
    for (const run of line.runs) {
      if (run.text === "") continue;
      const x = n.x + run.x;
      ctx.font = canvasFont(run.font);
      const color = run.color ?? n.color;
      ctx.fillStyle = color;
      ctx.fillText(run.text, x, y);
      const size = run.font.size;
      if (run.marks.includes("underline") || run.marks.includes("strike")) {
        ctx.fillStyle = color;
        const t = Math.max(1, size / 14);
        if (run.marks.includes("underline")) ctx.fillRect(x, y + size * 0.12, run.width, t);
        if (run.marks.includes("strike")) ctx.fillRect(x, y - size * 0.3, run.width, t);
      }
    }
  }
  ctx.restore();
}

function drawShape(ctx: Ctx, n: Exclude<SceneNode, ImageNode | TextNode>): void {
  ctx.save();
  if (n.kind === "rect" || n.kind === "ellipse") {
    ctx.globalAlpha *= n.opacity;
    if (n.rotation) {
      ctx.translate(n.x + n.w / 2, n.y + n.h / 2);
      ctx.rotate(n.rotation);
      ctx.translate(-(n.x + n.w / 2), -(n.y + n.h / 2));
    }
    if (n.kind === "rect") rectPath(ctx, n.x, n.y, n.w, n.h, n.radius, n.radius);
    else {
      ctx.beginPath();
      ctx.ellipse(n.x + n.w / 2, n.y + n.h / 2, n.w / 2, n.h / 2, 0, 0, Math.PI * 2);
    }
    if (n.fill) {
      ctx.fillStyle = n.fill;
      ctx.fill();
    }
    if (strokeStyleOf(ctx, n)) ctx.stroke();
  } else {
    ctx.globalAlpha *= n.opacity;
    if (n.dx || n.dy) ctx.translate(n.dx, n.dy);
    const path = typeof Path2D !== "undefined" ? new Path2D(n.d) : null;
    if (n.fill) {
      ctx.fillStyle = n.fill;
      if (path) ctx.fill(path);
      else (ctx as unknown as { fill(d: string): void }).fill(n.d);
    }
    if (strokeStyleOf(ctx, n)) {
      if (path) ctx.stroke(path);
      else (ctx as unknown as { stroke(d: string): void }).stroke(n.d);
    }
  }
  ctx.restore();
}

/** Longest side, in source pixels, that an image node needs from its asset at `scale`. */
export function neededPixels(n: ImageNode, scale: number): number {
  const frac = n.crop ? Math.max(n.crop.w, n.crop.h) : n.fit === "cover" ? 1 : 1;
  return (Math.max(n.w, n.h) * scale) / Math.max(frac, 0.01);
}

// ---- the writer ------------------------------------------------------------------------------------------------------

function defaultFactory(w: number, h: number): OffscreenCanvas {
  if (typeof OffscreenCanvas === "undefined") throw new Error("This browser can't draw exports off the main thread (OffscreenCanvas is missing). Update your browser.");
  return new OffscreenCanvas(w, h);
}

/**
 * Draw `scene` and encode it. Nodes are drawn in order; a picture that cannot be read leaves a hatched placeholder and its
 * id in `failedAssets`; the signal is checked at every node. Pictures load a few nodes ahead of the one being drawn.
 */
export async function renderRaster(
  scene: Scene,
  o: RasterOptions,
  d: JobDeps,
): Promise<{ blob: Blob; width: number; height: number; failedAssets: string[]; summary: ExportSummary }> {
  const check = () => {
    if (d.signal.aborted) throw abortError();
  };
  check();
  const dims = clampScale(scene, { scale: o.scale });
  const factory = d.canvasFactory ?? defaultFactory;
  const canvas = factory(dims.width, dims.height);
  const ctx = canvas.getContext("2d") as Ctx | null;
  if (!ctx) throw new Error("Couldn't create a drawing surface for the export.");
  const sx = dims.width / (scene.width > 0 ? scene.width : 1);
  const sy = dims.height / (scene.height > 0 ? scene.height : 1);
  const scale = Math.max(sx, sy);

  const opaque = !o.transparent || o.format === "jpeg";
  if (opaque) {
    ctx.fillStyle = scene.background ?? PAPER;
    ctx.fillRect(0, 0, dims.width, dims.height);
  }
  ctx.setTransform(sx, 0, 0, sy, 0, 0);

  const failed = new Set<string>();
  const nodes = scene.nodes;
  const imageIdx: number[] = [];
  nodes.forEach((n, i) => {
    if (n.kind === "image") imageIdx.push(i);
  });
  const pending = new Map<number, Promise<ImageBitmap | null>>();
  let nextImage = 0;
  const start = (k: number) => {
    const i = imageIdx[k];
    const n = nodes[i] as ImageNode;
    pending.set(
      i,
      d.images.load(n.assetId, neededPixels(n, scale), { noOriginal: n.noOriginal }).catch(() => null),
    );
  };
  const topUp = () => {
    while (nextImage < imageIdx.length && pending.size < PREFETCH) start(nextImage++);
  };
  topUp();

  d.onProgress(0, "Drawing");
  for (let i = 0; i < nodes.length; i++) {
    check();
    const n = nodes[i];
    ctx.save();
    if (n.clip) clipPath(ctx, n.clip);
    if (n.kind === "image") {
      const bmp = await pending.get(i)!;
      pending.delete(i);
      topUp();
      check();
      if (bmp) {
        drawImageNode(ctx, n, bmp, scale, factory);
      } else {
        failed.add(n.assetId);
        ctx.save();
        ctx.translate(n.x + n.w / 2, n.y + n.h / 2);
        if (n.rotation) ctx.rotate(n.rotation);
        placeholder(ctx, -n.w / 2, -n.h / 2, n.w, n.h);
        ctx.restore();
      }
    } else if (n.kind === "text") drawText(ctx, n);
    else drawShape(ctx, n);
    ctx.restore();
    if ((i + 1) % PROGRESS_EVERY === 0) d.onProgress(((i + 1) / nodes.length) * 0.9, `Drawing ${i + 1} of ${nodes.length}`);
  }
  d.onProgress(0.92, "Encoding");
  check();
  const blob = await (canvas as OffscreenCanvas).convertToBlob({ type: MIME[o.format], quality: Math.min(1, Math.max(0.05, o.quality)) });
  check();
  d.onProgress(1, "Done");
  const summary: ExportSummary = { failedAssets: [...failed], substitutedFonts: substitutedFamilies(scene.fonts), warnings: [...scene.warnings], width: dims.width, height: dims.height };
  if (dims.reason) summary.clampedReason = dims.reason;
  return { blob, width: dims.width, height: dims.height, failedAssets: [...failed], summary };
}

export { loadExportFonts };
