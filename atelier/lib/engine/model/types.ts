// Object model for a board. Pure types: no runtime code, no DOM.

export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };

/** Every object type, in a stable order (the renderer's view registry and the validators are keyed by it). */
export const OBJECT_TYPES = [
  "image",
  "text",
  "sticky",
  "shape",
  "arrow",
  "frame",
  "stroke",
  "group",
  "video",
  "link",
  "embed",
  "swatch",
  "palette",
  "typeSpecimen",
] as const;

export type ObjectType = (typeof OBJECT_TYPES)[number];

export interface Base {
  id: string;
  type: ObjectType;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Radians, normalised to (-PI, PI]. */
  rotation: number;
  parentId: string | null;
  /** Fractional index string: z-order among siblings. */
  index: string;
  locked: boolean;
  /** 0..1 */
  opacity: number;
  createdAt: number;
  updatedAt: number;
}

export type MaskKind = "rect" | "rounded" | "circle";

/** Where a picture came from. `capturedAt` is an ISO date (or date-time) string. */
export interface Provenance {
  sourceUrl: string | null;
  credit: string;
  licence: string;
  capturedAt: string | null;
}

export interface ImageObj extends Base {
  type: "image";
  assetId: string;
  /** Normalised 0..1 of the source image (x, y, w, h); null = whole image. */
  crop: Rect | null;
  /** Non-destructive mask. `radius` is canvas px and only used by "rounded". */
  mask: { kind: MaskKind; radius: number };
  flipX: boolean;
  flipY: boolean;
  grayscale: boolean;
  title: string;
  provenance: Provenance | null;
}

export interface TextObj extends Base {
  type: "text";
  fontSize: number;
  align: "left" | "center" | "right";
  lineHeight: number;
  color: string;
  autoWidth: boolean;
}

export type StickyColor = "yellow" | "peach" | "pink" | "lilac" | "blue" | "mint" | "sand" | "grey";
/** Font px 16 / 22 / 30 / 42. */
export type StickySize = "S" | "M" | "L" | "XL";

export interface StickyObj extends Base {
  type: "sticky";
  fill: StickyColor;
  size: StickySize;
}

export type ShapeKind = "rect" | "roundRect" | "ellipse" | "triangle" | "diamond" | "star";
export type StrokeStyle = "solid" | "dashed" | "dotted";

export interface ShapeObj extends Base {
  type: "shape";
  kind: ShapeKind;
  fill: string | null;
  stroke: string | null;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  cornerRadius: number;
}

export type Terminal =
  | { kind: "point"; x: number; y: number }
  /** `anchor` is the normalised (0..1) position within the bound target. */
  | { kind: "bound"; id: string; anchor: Point };

export type Head = "none" | "arrow" | "triangle" | "dot" | "bar";

export interface ArrowObj extends Base {
  type: "arrow";
  start: Terminal;
  end: Terminal;
  route: "straight" | "elbow" | "curved";
  startHead: Head;
  endHead: Head;
  stroke: string;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  label: string;
}

export type FramePresetId =
  | "slide-16-9"
  | "slide-4-3"
  | "ig-post-4-5"
  | "square"
  | "story-9-16"
  | "a4"
  | "a3"
  | "letter"
  | "custom";

export interface FrameObj extends Base {
  type: "frame";
  name: string;
  preset: FramePresetId;
  background: string | null;
  clip: boolean;
  /** Presentation order (fractional index string), independent of z-order. */
  order: string;
  notes: string;
}

export interface StrokeObj extends Base {
  type: "stroke";
  tool: "pen" | "highlighter";
  color: string;
  size: number;
  /** x,y,pressure triples relative to (x, y). */
  points: number[];
}

/** Invisible container; bounds = union of children, recomputed by BoardDoc when children change. */
export interface GroupObj extends Base {
  type: "group";
}

export interface VideoObj extends Base {
  type: "video";
  assetId: string;
  kind: "video" | "gif";
  /** Seconds into the clip used for the poster frame. */
  posterTime: number;
  loop: boolean;
  muted: boolean;
  /** User-chosen poster frame; null = the asset's own poster variant. */
  posterAssetId: string | null;
  provenance: Provenance | null;
}

export type LinkStatus = "loading" | "ready" | "failed";

export interface LinkObj extends Base {
  type: "link";
  /** http(s) only. */
  url: string;
  title: string;
  description: string;
  siteName: string;
  imageAssetId: string | null;
  status: LinkStatus;
}

export type EmbedProvider = "youtube" | "vimeo" | "figma";

export interface EmbedObj extends Base {
  type: "embed";
  provider: EmbedProvider;
  /** The URL the owner pasted (http or https). */
  url: string;
  /** The iframe source produced by `toEmbed()`; https only. */
  embedUrl: string;
  title: string;
}

export type ColorFormat = "hex" | "rgb" | "hsl" | "oklch";

export interface SwatchObj extends Base {
  type: "swatch";
  /** Lower-case `#rrggbb`. */
  hex: string;
  name: string;
  format: ColorFormat;
}

export interface PaletteSwatch {
  hex: string;
  /** 0..1 */
  weight: number;
  name: string;
  locked: boolean;
}

export interface PaletteObj extends Base {
  type: "palette";
  swatches: PaletteSwatch[];
  /** 3..12 */
  maxColors: number;
  layout: "strip" | "grid";
  showWeights: boolean;
  /** A live palette is recomputed from the images on the board. */
  live: boolean;
}

export interface TypeSpecimenObj extends Base {
  type: "typeSpecimen";
  family: string;
  weight: number;
  italic: boolean;
  sample: string;
  size: number;
  licenceNote: string;
  sourceUrl: string;
}

/** One extracted colour of an image; `weight` is 0..1 and sums to 1 across an image's palette. */
export type PaletteColor = { hex: string; weight: number };

export type CanvasObject =
  | ImageObj
  | TextObj
  | StickyObj
  | ShapeObj
  | ArrowObj
  | FrameObj
  | StrokeObj
  | GroupObj
  | VideoObj
  | LinkObj
  | EmbedObj
  | SwatchObj
  | PaletteObj
  | TypeSpecimenObj;

export type NewObject<T extends CanvasObject = CanvasObject> = T extends CanvasObject
  ? Omit<T, "id" | "index" | "createdAt" | "updatedAt"> & Partial<Pick<T, "id" | "index">>
  : never;
