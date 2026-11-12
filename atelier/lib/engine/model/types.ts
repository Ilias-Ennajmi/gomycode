// Object model for a board. Pure types: no runtime code, no DOM.

export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };

export type ObjectType = "image" | "text" | "sticky" | "shape" | "arrow" | "frame" | "stroke" | "group";

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

export interface ImageObj extends Base {
  type: "image";
  assetId: string;
  crop: Rect | null;
  flipX: boolean;
  flipY: boolean;
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

export type CanvasObject = ImageObj | TextObj | StickyObj | ShapeObj | ArrowObj | FrameObj | StrokeObj | GroupObj;

export type NewObject<T extends CanvasObject = CanvasObject> = T extends CanvasObject
  ? Omit<T, "id" | "index" | "createdAt" | "updatedAt"> & Partial<Pick<T, "id" | "index">>
  : never;
