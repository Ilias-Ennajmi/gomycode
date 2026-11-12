// The export Scene: a flat, renderer-agnostic list of drawing nodes built from a board (or a visitor's copy of one).
// Raster, SVG and PDF writers draw the same nodes, so a file looks the same whichever format it is. Pure and
// deterministic: no DOM, colours are concrete #rrggbb, text is already broken into positioned lines, and every
// coordinate is in scene space (the canvas shifted so the scene's top-left is 0,0).
import { arrowPath } from "@/lib/engine/geometry/arrow-path";
import { headShape } from "@/lib/engine/geometry/arrow-heads";
import { boundsOf, intersects, unionRects } from "@/lib/engine/geometry/rect";
import { rotateAround } from "@/lib/engine/geometry/transform";
import { outlinePath, strokeOutlinePoints } from "@/lib/engine/geometry/stroke-outline";
import { hostnameOf } from "@/lib/engine/links/url";
import { compareByIndex } from "@/lib/engine/model/index-order";
import { STICKY_COLORS, STICKY_FONT_PX, STICKY_LINE_HEIGHT, STICKY_PADDING_PX } from "@/lib/engine/model/defaults";
import { maskRadii } from "@/lib/engine/model/image-style";
import { formatColor } from "@/lib/engine/model/color";
import type { ArrowObj, CanvasObject, ImageObj, LinkObj, PaletteObj, Point, Provenance, Rect, ShapeObj, StickyObj, StrokeObj, SwatchObj, TextObj, TypeSpecimenObj, VideoObj, EmbedObj, FrameObj, StrokeStyle } from "@/lib/engine/model/types";
import { creditLine } from "@/lib/engine/provenance/validate";
import { contrastInk, LIGHT_TOKENS, resolveColor } from "./colors";
import {
  fragmentToBlocks,
  layoutBlocks,
  type PositionedLine,
  type RichBlock,
  type TextMeasurer,
} from "./text-layout";
import type * as Y from "yjs";

export type { PositionedLine, PositionedRun, RichBlock, RichRun, RichMark, TextMeasurer } from "./text-layout";
export { blocksToMarkdown, blocksToPlainText, fragmentToBlocks, layoutBlocks } from "./text-layout";

/** What a scene is built from: the owner's BoardDoc, or a visitor's read-only copy of a board. */
export interface SceneSource {
  all(): CanvasObject[];
  get(id: string): CanvasObject | undefined;
  childrenOf(parentId: string | null): CanvasObject[];
  blocks(id: string): RichBlock[];
  meta: { title: string; background: string | null };
}

export function boardDocSource(doc: {
  all(): CanvasObject[];
  get(id: string): CanvasObject | undefined;
  childrenOf(parentId: string | null): CanvasObject[];
  content(id: string): Y.XmlFragment | undefined;
  meta: { title: string };
}): SceneSource {
  return {
    all: () => doc.all(),
    get: (id) => doc.get(id),
    childrenOf: (p) => doc.childrenOf(p),
    blocks: (id) => {
      const f = doc.content(id);
      return f ? fragmentToBlocks(f) : [];
    },
    get meta() {
      return { title: doc.meta.title, background: null };
    },
  };
}

export type ExportTarget = { kind: "board" } | { kind: "frame"; id: string } | { kind: "selection"; ids: string[] };

export type Paint = {
  fill: string | null;
  stroke: string | null;
  strokeWidth: number;
  dash: number[] | null;
  opacity: number;
  /** Line cap and join: "round" for dotted lines and arrow heads. Default "butt" caps, round joins. */
  cap?: "round";
};

/** A clip: a rectangle (rotated about its own centre when `rotation` is set), inside another one when `outer` is set. */
export type ClipRect = Rect & { rotation?: number; outer?: ClipRect };
type NodeCommon = { sourceId: string; clip: ClipRect | null };

export type SceneNode =
  | ({ kind: "rect"; x: number; y: number; w: number; h: number; rotation: number; radius: number } & Paint & NodeCommon)
  | ({ kind: "ellipse"; x: number; y: number; w: number; h: number; rotation: number } & Paint & NodeCommon)
  | ({ kind: "path"; d: string; closed: boolean; /** Translation applied to `d` (the scene shift). */ dx: number; dy: number } & Paint & NodeCommon)
  | ({
      kind: "image";
      assetId: string;
      x: number;
      y: number;
      w: number;
      h: number;
      rotation: number;
      crop: Rect | null;
      rx: number;
      ry: number;
      flipX: boolean;
      flipY: boolean;
      grayscale: boolean;
      opacity: number;
      /** The asset is a video: only its still variants are pictures, never its original. */
      noOriginal?: boolean;
      /** Scale the picture to cover the box, cropping the overflow (link card pictures). */
      fit?: "cover";
    } & NodeCommon)
  | ({
      kind: "text";
      /** Top-left of the text box. Line positions are relative to it. */
      x: number;
      y: number;
      w: number;
      h: number;
      rotation: number;
      /** Rotation pivot (the owning object's centre). */
      cx: number;
      cy: number;
      lines: PositionedLine[];
      color: string;
      opacity: number;
    } & NodeCommon);

export interface FontRef {
  family: string;
  weight: number;
  italic: boolean;
}
export interface Scene {
  width: number;
  height: number;
  /** Canvas coordinates of the scene's top-left corner. */
  origin: Point;
  background: string | null;
  nodes: SceneNode[];
  assetIds: string[];
  fonts: FontRef[];
  warnings: string[];
}

export type SceneOptions = {
  background: "transparent" | "board" | string;
  padding: number;
  measure: TextMeasurer;
  /** Draw frame names above frames. */
  frameChrome: boolean;
  /** Caption each credited image with its credit line. */
  credits: boolean;
};

// ---- constants shared with the on-screen views --------------------------------------------------------------------

const TOKEN = LIGHT_TOKENS;
const INK = TOKEN["--color-ink"];
const MUTED = TOKEN["--color-muted"];
const SURFACE = TOKEN["--color-surface"];
const BORDER = TOKEN["--color-border"];
const ACCENT = TOKEN["--color-accent"];
const BG = TOKEN["--color-bg"];
const TEXT_XS = 12; // 0.75rem
const TEXT_SM = 13; // 0.8125rem
const TEXT_MD = 15; // 0.9375rem
const RADIUS_SM = 6;
const FRAME_LABEL_PX = 14;
const MAX_DEPTH = 32;
const BODY_LINE_HEIGHT = 1.5;
const FAMILY = "Inter";

const clean = (n: number, fallback = 0): number => (Number.isFinite(n) ? n : fallback);
const px = (n: number): number => Math.round(n * 1000) / 1000;

function dashOf(style: StrokeStyle, width: number): number[] | null {
  const w = Math.max(width, 1);
  if (style === "dashed") return [w * 3, w * 2];
  if (style === "dotted") return [w * 0.1, w * 2];
  return null;
}

const NO_PAINT: Paint = { fill: null, stroke: null, strokeWidth: 0, dash: null, opacity: 1 };

// ---- builder -------------------------------------------------------------------------------------------------------

type Entry = { node: SceneNode; bounds: Rect };

function clipBounds(c: ClipRect): Rect {
  return boundsOf({ x: c.x, y: c.y, w: c.w, h: c.h, rotation: c.rotation ?? 0 });
}

function intersection(a: Rect, b: Rect): Rect | null {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w);
  const y1 = Math.min(a.y + a.h, b.y + b.h);
  return x1 >= x0 && y1 >= y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

class Builder {
  readonly entries: Entry[] = [];
  readonly warnings: string[] = [];
  private readonly fonts = new Map<string, FontRef>();
  private readonly assets = new Set<string>();
  private warned = new Set<string>();

  constructor(
    readonly src: SceneSource,
    readonly o: SceneOptions,
  ) {}

  warn(msg: string): void {
    if (this.warned.has(msg)) return;
    this.warned.add(msg);
    this.warnings.push(msg);
  }

  font(family: string, weight: number, italic: boolean): void {
    const key = `${family}|${weight}|${italic ? 1 : 0}`;
    if (!this.fonts.has(key)) this.fonts.set(key, { family, weight, italic });
  }

  push(node: SceneNode, bounds: Rect): void {
    if (!(bounds.w >= 0 && bounds.h >= 0) || ![bounds.x, bounds.y, bounds.w, bounds.h].every(Number.isFinite)) return;
    let b = bounds;
    if (node.clip) {
      const hit = intersection(b, clipBounds(node.clip));
      if (!hit) return; // entirely outside its frame: invisible
      b = hit;
    }
    if (node.kind === "image") this.assets.add(node.assetId);
    if (node.kind === "text") for (const l of node.lines) for (const r of l.runs) this.font(r.font.family, r.font.weight, r.font.italic);
    this.entries.push({ node, bounds: b });
  }

  fontList(): FontRef[] {
    return [...this.fonts.values()].sort((a, b) => (a.family < b.family ? -1 : a.family > b.family ? 1 : a.weight - b.weight || Number(a.italic) - Number(b.italic)));
  }

  assetList(): string[] {
    return [...this.assets].sort();
  }

  // ---- text ----

  text(
    sourceId: string,
    clip: ClipRect | null,
    box: { x: number; y: number; w: number; h?: number },
    blocks: RichBlock[],
    style: { fontSize: number; lineHeight: number; align: "left" | "center" | "right"; color: string; family?: string; weight?: number; wrap: boolean; opacity?: number; pivot?: Point; rotation?: number; vAlign?: "top" | "middle"; minHeight?: number },
  ): { height: number; node: SceneNode | null } {
    const { lines, height } = layoutBlocks(blocks, {
      width: style.wrap ? Math.max(box.w, 1) : null,
      fontSize: style.fontSize,
      lineHeight: style.lineHeight,
      align: style.align,
      family: style.family ?? FAMILY,
      weight: style.weight,
      measure: this.o.measure,
    });
    if (lines.length === 0 || lines.every((l) => l.runs.length === 0)) return { height, node: null };
    for (const l of lines)
      for (const r of l.runs) {
        if (r.href) {
          r.color = ACCENT;
          if (!r.marks.includes("underline")) r.marks = [...r.marks, "underline"];
        }
      }
    const h = Math.max(box.h ?? 0, height);
    let y = box.y;
    if (style.vAlign === "middle" && box.h !== undefined) y = box.y + (box.h - height) / 2;
    const w = style.wrap ? box.w : Math.max(box.w, ...lines.map((l) => l.x + l.width));
    const pivot = style.pivot ?? { x: box.x + w / 2, y: y + h / 2 };
    const node: SceneNode = {
      kind: "text",
      sourceId,
      clip,
      x: px(box.x),
      y: px(y),
      w: px(w),
      h: px(h),
      rotation: style.rotation ?? 0,
      cx: px(pivot.x),
      cy: px(pivot.y),
      lines,
      color: style.color,
      opacity: style.opacity ?? 1,
    };
    return { height, node };
  }

  /** A one-style string as a single text node (card text, labels). Null when nothing is left after clamping. */
  label(
    sourceId: string,
    clip: ClipRect | null,
    box: { x: number; y: number; w: number },
    text: string,
    style: { size: number; color: string; weight?: number; lineHeight?: number; align?: "left" | "center" | "right"; maxLines?: number; opacity?: number; family?: string; italic?: boolean },
  ): { node: Extract<SceneNode, { kind: "text" }> | null; height: number } {
    if (text === "") return { node: null, height: 0 };
    const run = { text, marks: style.italic ? (["italic"] as const).slice() : [] };
    const r = this.text(sourceId, clip, { ...box }, [{ kind: "p", runs: [run] }], {
      fontSize: style.size,
      lineHeight: style.lineHeight ?? 1.3,
      align: style.align ?? "left",
      color: style.color,
      weight: style.weight,
      family: style.family,
      wrap: true,
      opacity: style.opacity,
    });
    const node = r.node as Extract<SceneNode, { kind: "text" }> | null;
    if (!node) return { node: null, height: 0 };
    const max = style.maxLines;
    if (max && node.lines.length > max) {
      node.lines = node.lines.slice(0, max);
      const last = node.lines[node.lines.length - 1];
      const lastRun = last.runs[last.runs.length - 1];
      if (lastRun) lastRun.text = lastRun.text.replace(/\s+$/, "") + "…";
      const h = max * style.size * (style.lineHeight ?? 1.3);
      node.h = px(h);
      return { node, height: h };
    }
    return { node, height: r.height };
  }
}

// ---- per-type emitters ---------------------------------------------------------------------------------------------

const rectPaint = (fill: string | null, stroke: string | null, strokeWidth: number, opacity: number, dash: number[] | null = null): Paint => ({
  fill,
  stroke,
  strokeWidth: stroke ? strokeWidth : 0,
  dash: stroke ? dash : null,
  opacity,
});

function rectNode(sourceId: string, clip: ClipRect | null, r: Rect, rotation: number, radius: number, paint: Paint): SceneNode {
  return { kind: "rect", sourceId, clip, x: px(r.x), y: px(r.y), w: px(r.w), h: px(r.h), rotation, radius, ...paint };
}

function strokeInset(p: Paint): number {
  return p.stroke ? p.strokeWidth / 2 : 0;
}

function polygonPoints(kind: ShapeObj["kind"], w: number, h: number): Point[] | null {
  const hw = w / 2;
  const hh = h / 2;
  switch (kind) {
    case "triangle":
      return [
        { x: hw, y: 0 },
        { x: w, y: h },
        { x: 0, y: h },
      ];
    case "diamond":
      return [
        { x: hw, y: 0 },
        { x: w, y: hh },
        { x: hw, y: h },
        { x: 0, y: hh },
      ];
    case "star": {
      const pts: Point[] = [];
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? 1 : 0.382;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        pts.push({ x: hw + Math.cos(a) * hw * r, y: hh + Math.sin(a) * hh * r });
      }
      return pts;
    }
    default:
      return null;
  }
}

function emitShape(b: Builder, obj: ShapeObj, clip: ClipRect | null): void {
  const fill = obj.fill ? resolveColor(obj.fill, null) : null;
  const stroke = obj.stroke && obj.strokeWidth > 0 ? resolveColor(obj.stroke, INK) : null;
  const paint: Paint = { ...rectPaint(fill, stroke, obj.strokeWidth, obj.opacity, dashOf(obj.strokeStyle, obj.strokeWidth)), ...(obj.strokeStyle === "dotted" ? { cap: "round" as const } : {}) };
  const box: Rect = { x: obj.x, y: obj.y, w: obj.w, h: obj.h };
  const centre = { x: obj.x + obj.w / 2, y: obj.y + obj.h / 2 };
  const pad = strokeInset(paint);
  const bounds = boundsOf({ x: obj.x - pad, y: obj.y - pad, w: obj.w + 2 * pad, h: obj.h + 2 * pad, rotation: obj.rotation });
  const poly = polygonPoints(obj.kind, obj.w, obj.h);
  if (obj.kind === "ellipse") {
    b.push({ kind: "ellipse", sourceId: obj.id, clip, x: px(box.x), y: px(box.y), w: px(box.w), h: px(box.h), rotation: obj.rotation, ...paint }, bounds);
  } else if (poly) {
    const pts = poly.map((p) => rotateAround({ x: obj.x + p.x, y: obj.y + p.y }, centre, obj.rotation));
    const d = `M ${pts.map((p) => `${px(p.x)} ${px(p.y)}`).join(" L ")} Z`;
    b.push({ kind: "path", sourceId: obj.id, clip, d, closed: true, dx: 0, dy: 0, ...paint }, bounds);
  } else {
    const radius = obj.kind === "roundRect" ? (obj.cornerRadius > 0 ? obj.cornerRadius : Math.min(obj.w, obj.h) * 0.12) : obj.cornerRadius;
    b.push(rectNode(obj.id, clip, box, obj.rotation, Math.min(Math.max(radius, 0), obj.w / 2, obj.h / 2), paint), bounds);
  }
  // text inside the shape, centred
  const blocks = b.src.blocks(obj.id);
  if (blocks.length) {
    const t = b.text(obj.id, clip, { x: obj.x + 8, y: obj.y, w: Math.max(obj.w - 16, 1), h: obj.h }, blocks, {
      fontSize: TEXT_MD,
      lineHeight: BODY_LINE_HEIGHT,
      align: "center",
      color: INK,
      wrap: true,
      opacity: obj.opacity,
      vAlign: "middle",
      pivot: centre,
      rotation: obj.rotation,
    });
    if (t.node) b.push(t.node, boundsOf({ x: obj.x, y: obj.y, w: obj.w, h: obj.h, rotation: obj.rotation }));
  }
}

function emitSticky(b: Builder, obj: StickyObj, clip: ClipRect | null): void {
  const size = STICKY_FONT_PX[obj.size] ?? STICKY_FONT_PX.M;
  const blocks = b.src.blocks(obj.id);
  const inner = Math.max(obj.w - 2 * STICKY_PADDING_PX, 1);
  const t = b.text(obj.id, clip, { x: obj.x + STICKY_PADDING_PX, y: obj.y + STICKY_PADDING_PX, w: inner }, blocks, {
    fontSize: size,
    lineHeight: STICKY_LINE_HEIGHT,
    align: "left",
    color: INK,
    wrap: true,
    opacity: obj.opacity,
    rotation: obj.rotation,
  });
  const h = Math.max(obj.h, t.height + 2 * STICKY_PADDING_PX);
  const fill = resolveColor(`var(${STICKY_COLORS[obj.fill] ?? "--sticky-yellow"})`, "#f6e58d");
  const rect: Rect = { x: obj.x, y: obj.y, w: obj.w, h };
  const centre = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
  const bounds = boundsOf({ ...rect, rotation: obj.rotation });
  b.push(rectNode(obj.id, clip, rect, obj.rotation, RADIUS_SM, rectPaint(fill, null, 0, obj.opacity)), bounds);
  if (t.node && t.node.kind === "text") {
    t.node.cx = px(centre.x);
    t.node.cy = px(centre.y);
    b.push(t.node, bounds);
  }
}

function emitText(b: Builder, obj: TextObj, clip: ClipRect | null): void {
  const blocks = b.src.blocks(obj.id);
  const t = b.text(obj.id, clip, { x: obj.x, y: obj.y, w: obj.w, h: obj.h }, blocks, {
    fontSize: obj.fontSize,
    lineHeight: obj.lineHeight,
    align: obj.align,
    color: resolveColor(obj.color, INK) ?? INK,
    wrap: !obj.autoWidth,
    opacity: obj.opacity,
    rotation: obj.rotation,
  });
  if (t.node && t.node.kind === "text") {
    b.push(t.node, boundsOf({ x: t.node.x, y: t.node.y, w: t.node.w, h: t.node.h, rotation: obj.rotation }));
  }
}

function emitImage(b: Builder, obj: ImageObj, clip: ClipRect | null): void {
  const { rx, ry } = maskRadii(obj);
  const bounds = boundsOf(obj);
  b.push(
    { kind: "image", sourceId: obj.id, clip, assetId: obj.assetId, x: px(obj.x), y: px(obj.y), w: px(obj.w), h: px(obj.h), rotation: obj.rotation, crop: obj.crop, rx: px(rx), ry: px(ry), flipX: obj.flipX, flipY: obj.flipY, grayscale: obj.grayscale, opacity: obj.opacity },
    bounds,
  );
  if (b.o.credits) emitCaption(b, obj, obj.provenance, clip);
}

function emitVideo(b: Builder, obj: VideoObj, clip: ClipRect | null): void {
  const own = !obj.posterAssetId;
  b.push(
    {
      kind: "image",
      sourceId: obj.id,
      clip,
      assetId: obj.posterAssetId ?? obj.assetId,
      x: px(obj.x),
      y: px(obj.y),
      w: px(obj.w),
      h: px(obj.h),
      rotation: obj.rotation,
      crop: null,
      rx: 0,
      ry: 0,
      flipX: false,
      flipY: false,
      grayscale: false,
      opacity: obj.opacity,
      ...(own && obj.kind === "video" ? { noOriginal: true } : {}),
    },
    boundsOf(obj),
  );
  if (b.o.credits) emitCaption(b, obj, obj.provenance, clip);
}

/** The credits strip across the bottom of a picture, as the canvas draws it (ink at 70 %, paper-coloured text). */
function emitCaption(b: Builder, obj: ImageObj | VideoObj, provenance: Provenance | null, clip: ClipRect | null): void {
  const line = creditLine(provenance);
  if (!line) return;
  const size = Math.min(24, Math.max(11, obj.w * 0.035));
  const barH = size * 1.6;
  const bar: Rect = { x: obj.x, y: obj.y + obj.h - barH, w: obj.w, h: Math.min(barH, obj.h) };
  const nodes: Entry[] = [];
  nodes.push({ node: rectNode(obj.id, clip, bar, 0, 0, rectPaint(INK, null, 0, 0.7 * obj.opacity)), bounds: bar });
  const t = b.label(obj.id, clip, { x: bar.x + size * 0.5, y: bar.y + (bar.h - size * 1.3) / 2, w: Math.max(obj.w - size, 1) }, line, { size, color: BG, maxLines: 1, lineHeight: 1.3, opacity: obj.opacity });
  if (t.node) nodes.push({ node: t.node, bounds: bar });
  placeComposite(b, nodes, obj);
}

/** Rotate nodes laid out unrotated about the owning object's centre, then add them to the scene. */
function placeComposite(b: Builder, nodes: Entry[], obj: Pick<CanvasObject, "x" | "y" | "w" | "h" | "rotation">, clip?: ClipRect | null): void {
  const c = { x: obj.x + obj.w / 2, y: obj.y + obj.h / 2 };
  const theta = obj.rotation;
  for (const { node } of nodes) {
    if (clip !== undefined && clip !== node.clip) node.clip = clip;
    if (theta === 0) continue;
    if (node.kind === "text") {
      node.cx = px(c.x);
      node.cy = px(c.y);
      node.rotation = theta;
    } else if (node.kind === "rect" || node.kind === "ellipse" || node.kind === "image") {
      const mid = rotateAround({ x: node.x + node.w / 2, y: node.y + node.h / 2 }, c, theta);
      node.x = px(mid.x - node.w / 2);
      node.y = px(mid.y - node.h / 2);
      node.rotation += theta;
    }
  }
  for (const e of nodes) {
    const r = e.node.kind === "path" ? e.bounds : e.node.kind === "text" ? boundsOf({ x: e.node.x, y: e.node.y, w: e.node.w, h: e.node.h, rotation: 0 }) : boundsOf(e.node);
    b.push(e.node, theta !== 0 && e.node.kind === "text" ? boundsOf({ x: obj.x, y: obj.y, w: obj.w, h: obj.h, rotation: theta }) : r);
  }
}

const card = (obj: CanvasObject, clip: ClipRect | null, opacity: number): Entry => ({
  node: rectNode(obj.id, clip, { x: obj.x, y: obj.y, w: obj.w, h: obj.h }, 0, RADIUS_SM, rectPaint(SURFACE, BORDER, 1, opacity)),
  bounds: { x: obj.x, y: obj.y, w: obj.w, h: obj.h },
});

function emitLink(b: Builder, obj: LinkObj, clip: ClipRect | null): void {
  const host = hostnameOf(obj.url);
  const title = (obj.title || host || obj.url).slice(0, 300);
  const site = (obj.siteName || host).slice(0, 100);
  const description = obj.description.slice(0, 400);
  const entries: Entry[] = [card(obj, clip, obj.opacity)];
  const frame: ClipRect = { x: obj.x, y: obj.y, w: obj.w, h: obj.h };
  const hasPicture = obj.h >= 200;
  let y = obj.y;
  if (hasPicture) {
    const ph = obj.h * 0.52;
    if (obj.imageAssetId) {
      entries.push({
        node: { kind: "image", sourceId: obj.id, clip: frame, assetId: obj.imageAssetId, x: px(obj.x), y: px(obj.y), w: px(obj.w), h: px(ph), rotation: 0, crop: null, rx: 0, ry: 0, flipX: false, flipY: false, grayscale: false, opacity: obj.opacity, fit: "cover" },
        bounds: { x: obj.x, y: obj.y, w: obj.w, h: ph },
      });
    } else {
      entries.push({ node: rectNode(obj.id, frame, { x: obj.x, y: obj.y, w: obj.w, h: ph }, 0, 0, rectPaint(BORDER, null, 0, obj.opacity)), bounds: { x: obj.x, y: obj.y, w: obj.w, h: ph } });
    }
    y += ph;
  }
  const x = obj.x + 16;
  const w = Math.max(obj.w - 32, 1);
  y += 12;
  const bottom = obj.y + obj.h - 8;
  const place = (text: string, o: Parameters<Builder["label"]>[4], gap = 4) => {
    if (y >= bottom) return;
    const r = b.label(obj.id, frame, { x, y, w }, text, o);
    if (!r.node) return;
    // keep only the lines that fit in the card
    const lineH = o.size * (o.lineHeight ?? 1.3);
    const room = Math.max(0, Math.floor((bottom - y + 1e-6) / lineH));
    if (room === 0) return;
    if (r.node.lines.length > room) {
      r.node.lines = r.node.lines.slice(0, room);
      const last = r.node.lines[r.node.lines.length - 1];
      const run = last.runs[last.runs.length - 1];
      if (run) run.text = run.text.replace(/\s+$/, "") + "…";
    }
    entries.push({ node: r.node, bounds: { x, y, w, h: r.node.lines.length * lineH } });
    y += r.node.lines.length * lineH + gap;
  };
  if (site && site !== title) place(site, { size: TEXT_XS, color: MUTED, maxLines: 1, opacity: obj.opacity, lineHeight: 1.3 });
  place(title, { size: TEXT_MD, color: INK, weight: 600, lineHeight: 1.3, maxLines: 2, opacity: obj.opacity });
  if (description) place(description, { size: TEXT_SM, color: MUTED, lineHeight: 1.35, maxLines: hasPicture ? 2 : 3, opacity: obj.opacity });
  if (obj.status !== "ready" && y < bottom) place("Preview unavailable", { size: TEXT_XS, color: MUTED, maxLines: 1, opacity: obj.opacity, lineHeight: 1.3 });
  placeComposite(b, entries, obj, clip);
  fixCardClip(entries, obj);
}

function emitEmbed(b: Builder, obj: EmbedObj, clip: ClipRect | null): void {
  const label = obj.provider === "vimeo" ? "Vimeo" : obj.provider === "figma" ? "Figma" : "YouTube";
  const entries: Entry[] = [card(obj, clip, obj.opacity)];
  const frame: ClipRect = { x: obj.x, y: obj.y, w: obj.w, h: obj.h };
  const w = Math.max(obj.w - 32, 1);
  const x = obj.x + 16;
  const title = obj.title ? obj.title.slice(0, 200) : hostnameOf(obj.url);
  const head = b.label(obj.id, frame, { x, y: 0, w }, label, { size: TEXT_SM, color: MUTED, align: "center", maxLines: 1, opacity: obj.opacity, lineHeight: 1.3 });
  const body = title ? b.label(obj.id, frame, { x, y: 0, w }, title, { size: obj.title ? TEXT_MD : TEXT_XS, color: obj.title ? INK : MUTED, weight: obj.title ? 600 : 400, align: "center", maxLines: obj.title ? 2 : 1, opacity: obj.opacity, lineHeight: 1.3 }) : { node: null, height: 0 };
  const gap = 12;
  const total = (head.node ? head.node.h : 0) + (head.node && body.node ? gap : 0) + (body.node ? body.node.h : 0);
  let y = obj.y + Math.max(8, (obj.h - total) / 2);
  for (const part of [head, body]) {
    if (!part.node) continue;
    part.node.y = px(y);
    entries.push({ node: part.node, bounds: { x, y, w, h: part.node.h } });
    y += part.node.h + gap;
  }
  placeComposite(b, entries, obj, clip);
  fixCardClip(entries, obj);
}

/** A rotated card's inner clip rotates with it. */
function fixCardClip(entries: Entry[], obj: Pick<CanvasObject, "rotation">): void {
  if (obj.rotation === 0) return;
  for (const { node } of entries.slice(1)) if (node.clip && node.clip.outer === undefined && node.clip.rotation === undefined) node.clip = { ...node.clip, rotation: obj.rotation };
}

function emitSwatch(b: Builder, obj: SwatchObj, clip: ClipRect | null): void {
  const hex = resolveColor(obj.hex, "#808080") ?? "#808080";
  const ink = contrastInk(hex);
  const entries: Entry[] = [
    { node: rectNode(obj.id, clip, { x: obj.x, y: obj.y, w: obj.w, h: obj.h }, 0, RADIUS_SM, rectPaint(hex, BORDER, 1, obj.opacity)), bounds: { x: obj.x, y: obj.y, w: obj.w, h: obj.h } },
  ];
  const w = Math.max(obj.w - 16, 1);
  const value = formatColor(hex, obj.format);
  const name = obj.name.slice(0, 100);
  const lines: { text: string; size: number; weight: number }[] = [];
  if (name) lines.push({ text: name, size: TEXT_SM, weight: 600 });
  lines.push({ text: value, size: TEXT_XS, weight: 400 });
  const heights = lines.map((l) => l.size * 1.3);
  let y = obj.y + obj.h - 8 - heights.reduce((s, h) => s + h, 0);
  lines.forEach((l, i) => {
    const r = b.label(obj.id, clip, { x: obj.x + 8, y, w }, l.text, { size: l.size, color: ink, weight: l.weight, maxLines: 1, opacity: obj.opacity, lineHeight: 1.3 });
    if (r.node) entries.push({ node: r.node, bounds: { x: obj.x, y, w: obj.w, h: heights[i] } });
    y += heights[i];
  });
  placeComposite(b, entries, obj, clip);
}

function emitPalette(b: Builder, obj: PaletteObj, clip: ClipRect | null): void {
  const sw = obj.swatches;
  if (sw.length === 0) {
    b.push(rectNode(obj.id, clip, { x: obj.x, y: obj.y, w: obj.w, h: obj.h }, obj.rotation, RADIUS_SM, rectPaint(SURFACE, BORDER, 1, obj.opacity)), boundsOf(obj));
    return;
  }
  const n = sw.length;
  const cols = obj.layout === "grid" ? Math.max(1, Math.min(n, Math.round(Math.sqrt((n * obj.w) / Math.max(obj.h, 1))))) : n;
  const rows = Math.ceil(n / cols);
  const cw = obj.w / cols;
  const ch = obj.h / rows;
  const entries: Entry[] = [];
  sw.forEach((s, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const r: Rect = { x: obj.x + col * cw, y: obj.y + row * ch, w: cw, h: ch };
    const hex = resolveColor(s.hex, "#808080") ?? "#808080";
    entries.push({ node: rectNode(obj.id, clip, r, 0, 0, rectPaint(hex, null, 0, obj.opacity)), bounds: r });
    const ink = contrastInk(hex);
    const parts = [s.name ? s.name.slice(0, 40) : "", hex];
    if (obj.showWeights) parts.push(`${Math.round(clean(s.weight) * 100)}%`);
    const size = Math.max(9, Math.min(TEXT_SM, cw / 7, ch / 4));
    const label = parts.filter(Boolean);
    const lh = size * 1.3;
    let y = r.y + r.h - 6 - label.length * lh;
    for (const text of label) {
      const t = b.label(obj.id, clip, { x: r.x + 6, y, w: Math.max(cw - 12, 1) }, text, { size, color: ink, maxLines: 1, opacity: obj.opacity, lineHeight: 1.3 });
      if (t.node) entries.push({ node: t.node, bounds: r });
      y += lh;
    }
  });
  placeComposite(b, entries, obj, clip);
}

const SPECIMEN_FOOTER = 32;
function emitSpecimen(b: Builder, obj: TypeSpecimenObj, clip: ClipRect | null): void {
  const family = obj.family.trim() || FAMILY;
  const entries: Entry[] = [card(obj, clip, obj.opacity)];
  const frame: ClipRect = { x: obj.x, y: obj.y, w: obj.w, h: obj.h };
  const sample = b.text(obj.id, frame, { x: obj.x + 16, y: obj.y + 16, w: Math.max(obj.w - 32, 1) }, [{ kind: "p", runs: [{ text: obj.sample, marks: obj.italic ? ["italic"] : [] }] }], {
    fontSize: obj.size,
    lineHeight: 1.15,
    align: "left",
    color: INK,
    family,
    weight: obj.weight,
    wrap: true,
    opacity: obj.opacity,
  });
  if (sample.node) entries.push({ node: sample.node, bounds: { x: obj.x, y: obj.y, w: obj.w, h: obj.h } });
  const fy = obj.y + obj.h - SPECIMEN_FOOTER;
  entries.push({ node: rectNode(obj.id, clip, { x: obj.x, y: fy, w: obj.w, h: 1 }, 0, 0, rectPaint(BORDER, null, 0, obj.opacity)), bounds: { x: obj.x, y: fy, w: obj.w, h: 1 } });
  const caption = `${family} · ${obj.weight}${obj.italic ? " italic" : ""}${obj.licenceNote ? `   ${obj.licenceNote}` : ""}`;
  const cap = b.label(obj.id, frame, { x: obj.x + 16, y: fy + (SPECIMEN_FOOTER - TEXT_XS * 1.4) / 2, w: Math.max(obj.w - 32, 1) }, caption, { size: TEXT_XS, color: MUTED, maxLines: 1, opacity: obj.opacity, lineHeight: 1.4 });
  if (cap.node) entries.push({ node: cap.node, bounds: { x: obj.x, y: fy, w: obj.w, h: SPECIMEN_FOOTER } });
  placeComposite(b, entries, obj, clip);
}

function emitStroke(b: Builder, obj: StrokeObj, clip: ClipRect | null): void {
  const outline = strokeOutlinePoints(obj, false);
  if (outline.length < 3) return;
  const centre = { x: obj.x + obj.w / 2, y: obj.y + obj.h / 2 };
  const pts = outline.map(([x, y]) => rotateAround({ x: obj.x + x, y: obj.y + y }, centre, obj.rotation));
  const d = outlinePath(pts.map((p) => [p.x, p.y]));
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const bounds = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  const highlighter = obj.tool === "highlighter";
  b.push({ kind: "path", sourceId: obj.id, clip, d, closed: true, dx: 0, dy: 0, ...NO_PAINT, fill: resolveColor(obj.color, INK), opacity: (highlighter ? 0.4 : 1) * obj.opacity }, bounds);
}

function emitArrow(b: Builder, obj: ArrowObj, clip: ClipRect | null): void {
  const geom = arrowPath(obj, (id) => b.src.get(id));
  const color = resolveColor(obj.stroke, INK) ?? INK;
  const width = Math.max(obj.strokeWidth, 0);
  const headSize = Math.max(10, width * 4);
  const dash = obj.strokeStyle === "solid" ? (geom.dangling ? [Math.max(width, 1) * 3, Math.max(width, 1) * 2] : null) : dashOf(obj.strokeStyle, width);
  const opacity = (geom.dangling ? 0.5 : 1) * obj.opacity;
  const cap = obj.strokeStyle === "dotted" ? ("round" as const) : undefined;
  const pad = width / 2 + (obj.startHead !== "none" || obj.endHead !== "none" ? headSize * 0.5 : 0);
  const bounds = unionRects(geom.points.map((p) => ({ x: p.x, y: p.y, w: 0, h: 0 })));
  const area = bounds ? { x: bounds.x - pad, y: bounds.y - pad, w: bounds.w + 2 * pad, h: bounds.h + 2 * pad } : { x: obj.x, y: obj.y, w: obj.w, h: obj.h };
  if (width > 0) {
    b.push({ kind: "path", sourceId: obj.id, clip, d: geom.d, closed: false, dx: 0, dy: 0, fill: null, stroke: color, strokeWidth: width, dash, opacity, ...(cap ? { cap } : {}) }, area);
    for (const head of [headShape(obj.startHead, geom.start, geom.startDir, headSize), headShape(obj.endHead, geom.end, geom.endDir, headSize)]) {
      if (!head) continue;
      b.push({ kind: "path", sourceId: obj.id, clip, d: head.d, closed: false, dx: 0, dy: 0, fill: head.filled ? color : null, stroke: color, strokeWidth: width, dash: null, opacity, cap: "round" }, area);
    }
  }
  if (obj.label) {
    const font = { family: FAMILY, weight: 400, italic: false, size: TEXT_SM };
    const tw = b.o.measure(obj.label, font);
    const padX = 8;
    const h = TEXT_SM * 1.4 + 4;
    const pill: Rect = { x: geom.labelAt.x - tw / 2 - padX, y: geom.labelAt.y - h / 2, w: tw + 2 * padX, h };
    b.push(rectNode(obj.id, clip, pill, 0, RADIUS_SM, rectPaint(SURFACE, BORDER, 1, obj.opacity)), pill);
    const t = b.label(obj.id, clip, { x: pill.x + padX, y: pill.y + 2, w: tw + 2 }, obj.label, { size: TEXT_SM, color: INK, maxLines: 1, lineHeight: 1.4, opacity: obj.opacity });
    if (t.node) {
      t.node.w = px(tw + 2);
      b.push(t.node, pill);
    }
  }
}

function emitFrame(b: Builder, obj: FrameObj, clip: ClipRect | null, drawBody: boolean): void {
  const bounds = boundsOf(obj);
  if (drawBody) {
    const bg = resolveColor(obj.background, SURFACE);
    b.push(rectNode(obj.id, clip, { x: obj.x, y: obj.y, w: obj.w, h: obj.h }, obj.rotation, 0, rectPaint(bg, b.o.frameChrome ? BORDER : null, 1, obj.opacity)), bounds);
  }
  if (b.o.frameChrome && obj.name) {
    const size = FRAME_LABEL_PX;
    const t = b.label(obj.id, clip, { x: obj.x, y: obj.y - size * 1.2 - 4, w: Math.max(obj.w, 80) }, obj.name.slice(0, 120), { size, color: MUTED, maxLines: 1, lineHeight: 1.2 });
    if (t.node) {
      const r = boundsOf({ x: t.node.x, y: t.node.y, w: t.node.w, h: t.node.h, rotation: 0 });
      if (obj.rotation !== 0) {
        const c = { x: obj.x + obj.w / 2, y: obj.y + obj.h / 2 };
        t.node.cx = px(c.x);
        t.node.cy = px(c.y);
        t.node.rotation = obj.rotation;
      }
      b.push(t.node, r);
    }
  }
}

// ---- the build -----------------------------------------------------------------------------------------------------

function shiftClip(c: ClipRect, dx: number, dy: number, done: Set<ClipRect>): void {
  if (done.has(c)) return;
  done.add(c);
  c.x = px(c.x + dx);
  c.y = px(c.y + dy);
  if (c.outer) shiftClip(c.outer, dx, dy, done);
}

function shift(nodes: SceneNode[], dx: number, dy: number): void {
  const done = new Set<ClipRect>();
  for (const n of nodes) {
    if (n.kind === "path") {
      n.dx = px(n.dx + dx);
      n.dy = px(n.dy + dy);
    } else {
      n.x = px(n.x + dx);
      n.y = px(n.y + dy);
      if (n.kind === "text") {
        n.cx = px(n.cx + dx);
        n.cy = px(n.cy + dy);
      }
    }
    if (n.clip) shiftClip(n.clip, dx, dy, done);
  }
}

/**
 * Build the scene of `target` from `src`. Everything is drawn in z-order (siblings by index, a frame's children right
 * after the frame, a group's children where the group sits), colours are resolved, text is laid out with `o.measure`.
 */
export function buildScene(src: SceneSource, target: ExportTarget, o: SceneOptions): Scene {
  const b = new Builder(src, o);
  const objs = src.all();
  const byId = new Map<string, CanvasObject>();
  for (const obj of objs) byId.set(obj.id, obj);

  const kids = new Map<string | null, CanvasObject[]>();
  for (const obj of objs) {
    const pid = obj.parentId && obj.parentId !== obj.id && byId.has(obj.parentId) ? obj.parentId : null;
    const list = kids.get(pid);
    if (list) list.push(obj);
    else kids.set(pid, [obj]);
  }
  for (const list of kids.values()) list.sort(compareByIndex);

  const descendants = (id: string, into: Set<string>): void => {
    const stack = [id];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const c of kids.get(cur) ?? []) {
        if (into.has(c.id)) continue;
        into.add(c.id);
        stack.push(c.id);
      }
    }
  };

  // What is drawn. null = everything.
  let include: Set<string> | null = null;
  let frameTarget: FrameObj | null = null;
  const t: ExportTarget = target;
  if (t.kind === "frame") {
    const f = byId.get(t.id);
    if (f && f.type === "frame" && f.rotation === 0) {
      frameTarget = f;
      include = new Set();
      descendants(f.id, include);
    } else if (f && f.type === "frame") {
      // A rotated frame cannot be an upright page: export it (and its content) as it lies on the board.
      include = new Set([f.id]);
      descendants(f.id, include);
    } else {
      include = new Set();
      b.warn("The frame to export no longer exists.");
    }
  } else if (t.kind === "selection") {
    include = new Set();
    for (const id of t.ids) {
      if (!byId.has(id)) continue;
      include.add(id);
      descendants(id, include);
    }
  }

  const visited = new Set<string>();
  const visit = (obj: CanvasObject, clip: ClipRect | null, depth: number): void => {
    if (depth > MAX_DEPTH || visited.has(obj.id)) return;
    visited.add(obj.id);
    const drawn = include === null || include.has(obj.id);
    const visible = obj.opacity > 0 && [obj.x, obj.y, obj.w, obj.h].every(Number.isFinite);
    switch (obj.type) {
      case "group":
        for (const c of kids.get(obj.id) ?? []) visit(c, clip, depth + 1);
        return;
      case "frame": {
        if (drawn && visible) emitFrame(b, obj, clip, true);
        else if (drawn === false && frameTarget && obj.id === frameTarget.id) {
          /* the target frame is the page itself: no body, no label */
        }
        const childClip: ClipRect | null = obj.clip ? { x: obj.x, y: obj.y, w: obj.w, h: obj.h, ...(obj.rotation !== 0 ? { rotation: obj.rotation } : {}), ...(clip ? { outer: clip } : {}) } : clip;
        for (const c of kids.get(obj.id) ?? []) visit(c, childClip, depth + 1);
        return;
      }
      default:
        break;
    }
    if (!drawn || !visible) return;
    switch (obj.type) {
      case "shape":
        return emitShape(b, obj, clip);
      case "sticky":
        return emitSticky(b, obj, clip);
      case "text":
        return emitText(b, obj, clip);
      case "image":
        return emitImage(b, obj, clip);
      case "video":
        return emitVideo(b, obj, clip);
      case "link":
        return emitLink(b, obj, clip);
      case "embed":
        return emitEmbed(b, obj, clip);
      case "swatch":
        return emitSwatch(b, obj, clip);
      case "palette":
        return emitPalette(b, obj, clip);
      case "typeSpecimen":
        return emitSpecimen(b, obj, clip);
      case "stroke":
        return emitStroke(b, obj, clip);
      case "arrow":
        return emitArrow(b, obj, clip);
      default:
        b.warn(`Skipped an object of unknown type "${String((obj as { type: unknown }).type)}".`);
    }
  };
  for (const root of kids.get(null) ?? []) visit(root, null, 0);

  // scene rectangle
  let origin: Point;
  let width: number;
  let height: number;
  if (frameTarget) {
    origin = { x: frameTarget.x, y: frameTarget.y };
    width = frameTarget.w;
    height = frameTarget.h;
  } else {
    const union = unionRects(b.entries.map((e) => e.bounds));
    const pad = Math.max(0, clean(o.padding));
    const base = union ?? { x: 0, y: 0, w: 1, h: 1 };
    origin = { x: base.x - pad, y: base.y - pad };
    width = Math.max(1, base.w) + 2 * pad;
    height = Math.max(1, base.h) + 2 * pad;
  }
  origin = { x: px(origin.x), y: px(origin.y) };
  width = px(width);
  height = px(height);

  const nodes = b.entries.map((e) => e.node);
  shift(nodes, -origin.x, -origin.y);

  let background: string | null;
  if (o.background === "transparent") background = null;
  else if (o.background === "board") background = frameTarget ? resolveColor(frameTarget.background, SURFACE) : resolveColor(src.meta.background, BG);
  else background = resolveColor(o.background, BG);

  return { width, height, origin, background, nodes, assetIds: b.assetList(), fonts: b.fontList(), warnings: b.warnings };
}

// re-exported for writers that only need a rect test
export { intersects };
