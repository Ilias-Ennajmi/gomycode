import { z } from "zod";
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
    crop: rect.nullable(),
    flipX: z.boolean(),
    flipY: z.boolean(),
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
