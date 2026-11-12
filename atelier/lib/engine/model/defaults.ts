import type { CanvasObject, FramePresetId, ObjectType, StickyColor, StickySize } from "./types";

/** Sticky colour name -> CSS custom property in styles/tokens.css. */
export const STICKY_COLORS: Record<StickyColor, string> = {
  yellow: "--sticky-yellow",
  peach: "--sticky-peach",
  pink: "--sticky-pink",
  lilac: "--sticky-lilac",
  blue: "--sticky-blue",
  mint: "--sticky-mint",
  sand: "--sticky-sand",
  grey: "--sticky-grey",
};

/** Padding inside a sticky (equals --space-4); text is laid out in what is left. */
export const STICKY_PADDING_PX = 16;
/** Line height (a multiple of the font size) of sticky text. */
export const STICKY_LINE_HEIGHT = 1.3;

export const STICKY_FONT_PX: Record<StickySize, number> = { S: 16, M: 22, L: 30, XL: 42 };

export type FramePreset = { label: string; w: number; h: number; unit: "px" | "mm" | "in" };

export const FRAME_PRESETS: Record<FramePresetId, FramePreset> = {
  "slide-16-9": { label: "Slide 16:9", w: 1920, h: 1080, unit: "px" },
  "slide-4-3": { label: "Slide 4:3", w: 1600, h: 1200, unit: "px" },
  "ig-post-4-5": { label: "Instagram post 4:5", w: 1080, h: 1350, unit: "px" },
  square: { label: "Square", w: 1080, h: 1080, unit: "px" },
  "story-9-16": { label: "Story 9:16", w: 1080, h: 1920, unit: "px" },
  a4: { label: "A4", w: 210, h: 297, unit: "mm" },
  a3: { label: "A3", w: 297, h: 420, unit: "mm" },
  letter: { label: "Letter", w: 8.5, h: 11, unit: "in" },
  custom: { label: "Custom", w: 1920, h: 1080, unit: "px" },
};

export function mmToPx(mm: number, dpi: number): number {
  return Math.round((mm / 25.4) * dpi);
}

/** Canvas size of a preset in canvas px (physical units at 96 dpi, the CSS reference pixel). */
export function framePresetPx(id: FramePresetId, dpi = 96): { w: number; h: number } {
  const p = FRAME_PRESETS[id];
  if (p.unit === "px") return { w: p.w, h: p.h };
  if (p.unit === "mm") return { w: mmToPx(p.w, dpi), h: mmToPx(p.h, dpi) };
  return { w: Math.round(p.w * dpi), h: Math.round(p.h * dpi) };
}

type Meta = "id" | "index" | "createdAt" | "updatedAt";
type DefaultsOf<T> = T extends CanvasObject ? Omit<T, Meta> : never;
type Defaults<K extends ObjectType> = DefaultsOf<Extract<CanvasObject, { type: K }>>;

const INK = "var(--color-ink)";

function base(w: number, h: number) {
  return { x: 0, y: 0, w, h, rotation: 0, parentId: null, locked: false, opacity: 1 };
}

/** Fresh default props for a type (a new object each call). */
export function defaultsFor<K extends ObjectType>(type: K): Defaults<K>;
export function defaultsFor(type: ObjectType): DefaultsOf<CanvasObject> {
  switch (type) {
    case "image":
      return { type, ...base(320, 240), assetId: "", crop: null, flipX: false, flipY: false };
    case "text":
      return { type, ...base(200, 32), fontSize: 24, align: "left", lineHeight: 1.3, color: INK, autoWidth: true };
    case "sticky":
      return { type, ...base(200, 200), fill: "yellow", size: "M" };
    case "shape":
      return {
        type,
        ...base(160, 120),
        kind: "rect",
        fill: null,
        stroke: INK,
        strokeWidth: 2,
        strokeStyle: "solid",
        cornerRadius: 0,
      };
    case "arrow":
      return {
        type,
        ...base(160, 1),
        start: { kind: "point", x: 0, y: 0 },
        end: { kind: "point", x: 160, y: 0 },
        route: "straight",
        startHead: "none",
        endHead: "arrow",
        stroke: INK,
        strokeWidth: 2,
        strokeStyle: "solid",
        label: "",
      };
    case "frame":
      return {
        type,
        ...base(1920, 1080),
        name: "Frame",
        preset: "slide-16-9",
        background: null,
        clip: true,
        order: "a0",
        notes: "",
      };
    case "stroke":
      return { type, ...base(1, 1), tool: "pen", color: INK, size: 4, points: [] };
    case "group":
      return { type, ...base(1, 1) };
  }
}
