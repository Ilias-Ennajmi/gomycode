// JSON Canvas 1.0 (jsoncanvas.org) export: an open format other tools (Obsidian and friends) read. The mapping is lossy and
// says so in `warnings`: text, stickies, labelled shapes, swatches, palettes and specimens become text nodes; pictures and
// videos file nodes; links and embeds link nodes; frames group nodes; arrows with both ends bound become edges. Pen strokes,
// loose arrows and rotation have no JSON Canvas equivalent and are dropped (counted).
import { blocksToMarkdown } from "./text-layout";
import { formatColor, normalizeHex } from "@/lib/engine/model/color";
import { compareByIndex } from "@/lib/engine/model/index-order";
import type { ArrowObj, CanvasObject, Head, Point } from "@/lib/engine/model/types";
import type { SceneSource } from "./scene";

export type JsonCanvasSide = "top" | "right" | "bottom" | "left";
interface NodeBase {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
}
export type JsonCanvasNode =
  | (NodeBase & { type: "text"; text: string })
  | (NodeBase & { type: "file"; file: string })
  | (NodeBase & { type: "link"; url: string })
  | (NodeBase & { type: "group"; label?: string });
export interface JsonCanvasEdge {
  id: string;
  fromNode: string;
  toNode: string;
  fromSide?: JsonCanvasSide;
  toSide?: JsonCanvasSide;
  fromEnd?: "none" | "arrow";
  toEnd?: "none" | "arrow";
  color?: string;
  label?: string;
}
export interface JsonCanvas {
  nodes: JsonCanvasNode[];
  edges: JsonCanvasEdge[];
}

/** JSON Canvas preset colours: 1 red, 2 orange, 3 yellow, 4 green, 5 cyan, 6 purple. */
const STICKY_PRESET: Record<string, string | undefined> = { yellow: "3", peach: "2", pink: "1", lilac: "6", blue: "5", mint: "4", sand: "2", grey: undefined };
const MAX_ID = 64;

const int = (n: number, min = 0): number => (Number.isFinite(n) ? Math.max(min, Math.round(n)) : min);
const trimId = (id: string): string => id.slice(0, MAX_ID);

function sideOf(anchor: Point): JsonCanvasSide {
  const d = { left: anchor.x, right: 1 - anchor.x, top: anchor.y, bottom: 1 - anchor.y };
  return (Object.entries(d).sort((a, b) => a[1] - b[1])[0][0] as JsonCanvasSide) ?? "right";
}
const endOf = (h: Head): "none" | "arrow" => (h === "arrow" || h === "triangle" ? "arrow" : "none");

/** The canvas of a board, and what could not be carried over. `assetPath` maps a picture to the file path it will have in the export. */
export function toJsonCanvas(src: SceneSource, o: { assetPath(assetId: string): string | null }): { canvas: JsonCanvas; warnings: string[] } {
  const objs = src.all().slice().sort(compareByIndex);
  const byId = new Map(objs.map((x) => [x.id, x]));
  const ids = new Set<string>();
  const unique = (raw: string): string => {
    let id = trimId(raw);
    for (let n = 2; ids.has(id); n++) id = trimId(`${raw}`.slice(0, MAX_ID - String(n).length - 1)) + `-${n}`;
    ids.add(id);
    return id;
  };
  const nodeId = new Map<string, string>();
  const groups: JsonCanvasNode[] = [];
  const nodes: JsonCanvasNode[] = [];
  const counts = { strokes: 0, looseArrows: 0, rotated: 0, shapes: 0, files: 0, empty: 0 };
  const arrowEnds = new Set<string>();
  for (const a of objs) if (a.type === "arrow") for (const t of [a.start, a.end]) if (t.kind === "bound") arrowEnds.add(t.id);

  const box = (x: CanvasObject) => ({ x: int(x.x, -1e9), y: int(x.y, -1e9), width: int(x.w, 1), height: int(x.h, 1) });
  const text = (x: CanvasObject, body: string, color?: string): JsonCanvasNode => {
    const id = unique(x.id);
    nodeId.set(x.id, id);
    return { type: "text", id, ...box(x), text: body, ...(color ? { color } : {}) };
  };
  const hexLine = (hex: string, name: string) => `${normalizeHex(hex) ?? hex}${name ? ` ${name}` : ""}`;

  for (const x of objs) {
    if (x.rotation !== 0 && x.type !== "group" && x.type !== "arrow" && x.type !== "stroke") counts.rotated++;
    switch (x.type) {
      case "frame": {
        const id = unique(x.id);
        nodeId.set(x.id, id);
        groups.push({ type: "group", id, ...box(x), ...(x.name ? { label: x.name } : {}) });
        break;
      }
      case "text":
        nodes.push(text(x, blocksToMarkdown(src.blocks(x.id))));
        break;
      case "sticky":
        nodes.push(text(x, blocksToMarkdown(src.blocks(x.id)), STICKY_PRESET[x.fill]));
        break;
      case "shape": {
        const body = blocksToMarkdown(src.blocks(x.id));
        if (body !== "" || arrowEnds.has(x.id)) nodes.push(text(x, body));
        else counts.shapes++;
        break;
      }
      case "image":
      case "video": {
        const path = o.assetPath(x.assetId);
        if (!path) {
          counts.files++;
          break;
        }
        const id = unique(x.id);
        nodeId.set(x.id, id);
        nodes.push({ type: "file", id, ...box(x), file: path });
        break;
      }
      case "link":
      case "embed": {
        const id = unique(x.id);
        nodeId.set(x.id, id);
        nodes.push({ type: "link", id, ...box(x), url: x.url });
        break;
      }
      case "swatch":
        nodes.push(text(x, hexLine(x.hex, x.name) + (x.format !== "hex" ? `\n${formatColor(x.hex, x.format)}` : "")));
        break;
      case "palette":
        nodes.push(text(x, x.swatches.map((s) => hexLine(s.hex, s.name)).join("\n")));
        break;
      case "typeSpecimen":
        nodes.push(text(x, `${x.sample}\n\n${x.family} ${x.weight}${x.italic ? " italic" : ""}`));
        break;
      case "stroke":
        counts.strokes++;
        break;
      case "arrow":
        break; // below
      default:
        break;
    }
  }

  const edges: JsonCanvasEdge[] = [];
  for (const x of objs) {
    if (x.type !== "arrow") continue;
    const a: ArrowObj = x;
    if (a.start.kind !== "bound" || a.end.kind !== "bound") {
      counts.looseArrows++;
      continue;
    }
    const from = nodeId.get(a.start.id);
    const to = nodeId.get(a.end.id);
    if (!from || !to || !byId.has(a.start.id) || !byId.has(a.end.id)) {
      counts.looseArrows++;
      continue;
    }
    edges.push({
      id: unique(a.id),
      fromNode: from,
      toNode: to,
      fromSide: sideOf(a.start.anchor),
      toSide: sideOf(a.end.anchor),
      fromEnd: endOf(a.startHead),
      toEnd: endOf(a.endHead),
      ...(a.label ? { label: a.label } : {}),
    });
  }

  const warnings: string[] = [];
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  if (counts.strokes) warnings.push(`${plural(counts.strokes, "pen stroke was", "pen strokes were")} left out (JSON Canvas has no drawings).`);
  if (counts.looseArrows) warnings.push(`${plural(counts.looseArrows, "arrow was", "arrows were")} left out because it is not attached to two objects.`);
  if (counts.shapes) warnings.push(`${plural(counts.shapes, "shape was", "shapes were")} left out because it has no text and no arrow.`);
  if (counts.files) warnings.push(`${plural(counts.files, "picture or video was", "pictures or videos were")} left out because its file is not part of the export.`);
  if (counts.rotated) warnings.push(`Rotation is not kept (${plural(counts.rotated, "object", "objects")}).`);
  return { canvas: { nodes: [...groups, ...nodes], edges }, warnings };
}
