import type { BoardDoc } from "@/lib/engine/doc/board-doc";
import { objectText } from "@/lib/engine/model/search";
import type { CanvasObject, ShapeKind } from "@/lib/engine/model/types";

export type LayerRow = {
  id: string;
  obj: CanvasObject;
  /** 0 for top-level layers. */
  depth: number;
  /** Frames and groups with at least one child. */
  expandable: boolean;
  expanded: boolean;
  /** Position among its siblings (1-based) and how many there are: for aria-posinset / aria-setsize. */
  pos: number;
  setSize: number;
};

const SHAPE_NAMES: Record<ShapeKind, string> = {
  rect: "Rectangle",
  roundRect: "Rounded rectangle",
  ellipse: "Ellipse",
  triangle: "Triangle",
  diamond: "Diamond",
  star: "Star",
};

const MAX_NAME = 48;

function firstLine(s: string): string {
  const line = s.split("\n").find((l) => l.trim() !== "") ?? "";
  const t = line.trim();
  return t.length > MAX_NAME ? `${t.slice(0, MAX_NAME - 1)}…` : t;
}

/** What a kind of object is called when it has no text of its own. */
export function typeLabel(o: CanvasObject): string {
  switch (o.type) {
    case "image":
      return "Image";
    case "text":
      return "Text";
    case "sticky":
      return "Sticky note";
    case "shape":
      return SHAPE_NAMES[o.kind] ?? "Shape";
    case "arrow":
      return o.startHead === "none" && o.endHead === "none" ? "Line" : "Arrow";
    case "frame":
      return "Frame";
    case "stroke":
      return o.tool === "highlighter" ? "Highlight" : "Drawing";
    case "group":
      return "Group";
    case "video":
      return o.kind === "gif" ? "GIF" : "Video";
    case "link":
      return "Link card";
    case "embed":
      return "Embed";
    case "swatch":
      return "Colour swatch";
    case "palette":
      return "Palette";
    case "typeSpecimen":
      return "Type specimen";
  }
}

/** The name shown in Layers: a frame's name, the first line of text, or the kind of object. */
export function layerName(doc: BoardDoc, o: CanvasObject): string {
  if (o.type === "frame") return o.name.trim() || "Frame";
  if (o.type === "text" || o.type === "sticky" || o.type === "shape" || o.type === "arrow") {
    return firstLine(objectText(doc, o.id)) || typeLabel(o);
  }
  return typeLabel(o);
}

/** Everything that changes what a row shows or how rows nest: used to skip re-renders for plain moves. */
export function rowSignature(doc: BoardDoc, o: CanvasObject | undefined): string {
  if (!o) return "";
  return `${o.type}|${o.parentId ?? ""}|${o.index}|${o.locked ? 1 : 0}|${layerName(doc, o)}`;
}

/**
 * The visible rows of the layer tree: top-most layer first, children after their frame or group (also top-most
 * first), skipping the children of collapsed layers.
 */
export function layerRows(doc: BoardDoc, collapsed: ReadonlySet<string>): LayerRow[] {
  const rows: LayerRow[] = [];
  const walk = (parentId: string | null, depth: number) => {
    const kids = doc.childrenOf(parentId).slice().reverse();
    kids.forEach((obj, i) => {
      const hasKids = (obj.type === "frame" || obj.type === "group") && doc.childrenOf(obj.id).length > 0;
      const expanded = hasKids && !collapsed.has(obj.id);
      rows.push({ id: obj.id, obj, depth, expandable: hasKids, expanded, pos: i + 1, setSize: kids.length });
      if (expanded) walk(obj.id, depth + 1);
    });
  };
  walk(null, 0);
  return rows;
}

/** All ids below `id` (children, their children, ...). */
export function descendantIds(doc: BoardDoc, id: string): string[] {
  const out: string[] = [];
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const c of doc.childrenOf(cur)) {
      out.push(c.id);
      stack.push(c.id);
    }
  }
  return out;
}
