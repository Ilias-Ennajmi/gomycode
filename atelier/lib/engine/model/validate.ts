import { z } from "zod";
import { isAllowedEmbedUrl } from "../links/embed";
import { normalizeHex } from "./color";
import type { CanvasObject } from "./types";

const finite = z.number().finite();
const clamp01 = finite.transform((v) => Math.min(1, Math.max(0, v)));
/** Normalise to (-PI, PI]. */
const angle = finite.transform((v) => {
  const tau = Math.PI * 2;
  let r = ((v % tau) + tau) % tau; // [0, 2PI)
  if (r > Math.PI) r -= tau;
  return r;
});
const positive = finite.refine((v) => v > 0, "must be > 0");
const str = z.string();
const id = z.string().min(1);

const rect = z.object({ x: finite, y: finite, w: finite, h: finite });
const strokeStyle = z.enum(["solid", "dashed", "dotted"]);
const head = z.enum(["none", "arrow", "triangle", "dot", "bar"]);

const terminal = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("point"), x: finite, y: finite }),
  z.object({ kind: z.literal("bound"), id, anchor: z.object({ x: clamp01, y: clamp01 }) }),
]);

/** A string truncated to `max` characters (hostile or oversized page text is kept, but bounded). */
const capped = (max: number) => z.string().transform((v) => (v.length > max ? v.slice(0, max) : v));

function isWebUrl(v: string, protocols: readonly string[]): boolean {
  if (v.length === 0 || v.length > 2048) return false;
  try {
    return protocols.includes(new URL(v).protocol);
  } catch {
    return false;
  }
}
/** http(s) only: `javascript:`, `data:`, `file:` and friends never get into the document. */
const httpUrl = z.string().refine((v) => isWebUrl(v, ["http:", "https:"]), "must be an http(s) URL");
const httpsUrl = z.string().refine((v) => isWebUrl(v, ["https:"]), "must be an https URL");
const hexColor = z
  .string()
  .refine((v) => normalizeHex(v) !== null, "must be #rgb or #rrggbb")
  .transform((v) => normalizeHex(v) as string);
const isoDate = z.string().refine((v) => v.length > 0 && v.length <= 40 && !Number.isNaN(Date.parse(v)), "must be an ISO date");

/** Normalised (0..1) crop window inside the source image; anything else (e.g. a Phase 1 pixel crop) reads as null. */
const normalisedCrop = rect
  .refine(
    (r) => r.x >= 0 && r.y >= 0 && r.w > 0 && r.h > 0 && r.x + r.w <= 1 + 1e-6 && r.y + r.h <= 1 + 1e-6,
    "must lie inside the unit square",
  )
  .nullable()
  .catch(null);

/** A picture's source link: http(s), at most 2048 characters, no username or password. */
const sourceUrl = httpUrl
  .refine((v) => v.length <= 2048, "must be at most 2048 characters")
  .refine((v) => {
    try {
      const u = new URL(v);
      return u.username === "" && u.password === "";
    } catch {
      return false;
    }
  }, "must not carry credentials");

const provenance = z
  .object({
    sourceUrl: sourceUrl.nullable().catch(null),
    credit: capped(500).catch(""),
    licence: capped(300).catch(""),
    capturedAt: isoDate.nullable().catch(null),
  })
  .nullable()
  .catch(null);

const maskDefault = { kind: "rect" as const, radius: 0 };
const mask = z
  .object({
    kind: z.enum(["rect", "rounded", "circle"]).catch("rect"),
    radius: finite.refine((v) => v >= 0, "must be >= 0").catch(0),
  })
  .catch(maskDefault);

const clampTo = (lo: number, hi: number) => (v: number) => Math.min(hi, Math.max(lo, v));

const paletteSwatch = z.object({
  hex: hexColor,
  weight: finite.transform(clampTo(0, 1)).catch(0),
  name: capped(100).catch(""),
  locked: z.boolean().catch(false),
});

const baseShape = {
  id,
  x: finite,
  y: finite,
  w: positive,
  h: positive,
  rotation: angle,
  parentId: id.nullable(),
  index: id,
  locked: z.boolean(),
  opacity: clamp01,
  createdAt: finite,
  updatedAt: finite,
};

// z.object strips unknown keys by default.
const schemas = {
  image: z.object({
    ...baseShape,
    type: z.literal("image"),
    assetId: str,
    crop: normalisedCrop,
    mask,
    flipX: z.boolean(),
    flipY: z.boolean(),
    grayscale: z.boolean().catch(false),
    title: capped(300).catch(""),
    provenance,
  }),
  text: z.object({
    ...baseShape,
    type: z.literal("text"),
    fontSize: positive,
    align: z.enum(["left", "center", "right"]),
    lineHeight: positive,
    color: str,
    autoWidth: z.boolean(),
  }),
  sticky: z.object({
    ...baseShape,
    type: z.literal("sticky"),
    fill: z.enum(["yellow", "peach", "pink", "lilac", "blue", "mint", "sand", "grey"]),
    size: z.enum(["S", "M", "L", "XL"]),
  }),
  shape: z.object({
    ...baseShape,
    type: z.literal("shape"),
    kind: z.enum(["rect", "roundRect", "ellipse", "triangle", "diamond", "star"]),
    fill: str.nullable(),
    stroke: str.nullable(),
    strokeWidth: finite.refine((v) => v >= 0, "must be >= 0"),
    strokeStyle,
    cornerRadius: finite.refine((v) => v >= 0, "must be >= 0"),
  }),
  arrow: z.object({
    ...baseShape,
    type: z.literal("arrow"),
    start: terminal,
    end: terminal,
    route: z.enum(["straight", "elbow", "curved"]),
    startHead: head,
    endHead: head,
    stroke: str,
    strokeWidth: finite.refine((v) => v >= 0, "must be >= 0"),
    strokeStyle,
    label: str,
  }),
  frame: z.object({
    ...baseShape,
    type: z.literal("frame"),
    name: str,
    preset: z.enum([
      "slide-16-9",
      "slide-4-3",
      "ig-post-4-5",
      "square",
      "story-9-16",
      "a4",
      "a3",
      "letter",
      "custom",
    ]),
    background: str.nullable(),
    clip: z.boolean(),
    order: str,
    notes: str,
  }),
  stroke: z.object({
    ...baseShape,
    type: z.literal("stroke"),
    tool: z.enum(["pen", "highlighter"]),
    color: str,
    size: positive,
    points: z.array(finite).refine((a) => a.length % 3 === 0, "points are x,y,pressure triples"),
  }),
  group: z.object({ ...baseShape, type: z.literal("group") }),
  video: z.object({
    ...baseShape,
    type: z.literal("video"),
    assetId: str,
    kind: z.enum(["video", "gif"]).catch("video"),
    posterTime: finite.refine((v) => v >= 0, "must be >= 0").catch(0),
    loop: z.boolean().catch(true),
    muted: z.boolean().catch(true),
    posterAssetId: str.nullable().catch(null),
    provenance,
  }),
  link: z.object({
    ...baseShape,
    type: z.literal("link"),
    url: httpUrl,
    title: capped(300).catch(""),
    description: capped(2000).catch(""),
    siteName: capped(200).catch(""),
    imageAssetId: str.nullable().catch(null),
    status: z.enum(["loading", "ready", "failed"]).catch("loading"),
  }),
  embed: z.object({
    ...baseShape,
    type: z.literal("embed"),
    provider: z.enum(["youtube", "vimeo", "figma"]),
    url: httpUrl,
    embedUrl: httpsUrl.refine(isAllowedEmbedUrl, "must be an allow-listed embed URL"),
    title: capped(300).catch(""),
  }),
  swatch: z.object({
    ...baseShape,
    type: z.literal("swatch"),
    hex: hexColor,
    name: capped(100).catch(""),
    format: z.enum(["hex", "rgb", "hsl", "oklch"]).catch("hex"),
  }),
  palette: z.object({
    ...baseShape,
    type: z.literal("palette"),
    swatches: z
      .array(z.unknown())
      .catch([])
      .transform((items) => {
        const out: z.infer<typeof paletteSwatch>[] = [];
        for (const item of items.slice(0, 64)) {
          const r = paletteSwatch.safeParse(item);
          if (r.success) out.push(r.data);
        }
        return out;
      }),
    maxColors: finite.transform((v) => Math.round(clampTo(3, 12)(v))).catch(8),
    layout: z.enum(["strip", "grid"]).catch("strip"),
    showWeights: z.boolean().catch(true),
    live: z.boolean().catch(false),
  }),
  typeSpecimen: z.object({
    ...baseShape,
    type: z.literal("typeSpecimen"),
    family: capped(100).catch(""),
    weight: finite.transform((v) => Math.round(clampTo(100, 900)(v))).catch(400),
    italic: z.boolean().catch(false),
    sample: capped(500).catch(""),
    size: finite.transform(clampTo(8, 400)).catch(48),
    licenceNote: capped(500).catch(""),
    sourceUrl: z
      .string()
      .transform((v) => (isWebUrl(v, ["http:", "https:"]) ? v : ""))
      .catch(""),
  }),
} as const;


/**
 * Parse an untrusted value into a typed object, or null if it is invalid.
 * Never throws. Unknown fields are stripped; opacity is clamped; rotation is normalised.
 */
export function validateObject(raw: unknown): CanvasObject | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const type = (raw as { type?: unknown }).type;
  if (typeof type !== "string" || !Object.prototype.hasOwnProperty.call(schemas, type)) return null;
  try {
    const res = schemas[type as keyof typeof schemas].safeParse(raw);
    return res.success ? (res.data as CanvasObject) : null;
  } catch {
    return null;
  }
}
