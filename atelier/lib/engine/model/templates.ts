import * as Y from "yjs";
import type { BoardDoc } from "../doc/board-doc";
import { defaultsFor } from "./defaults";
import { keyBetween } from "./index-order";
import type { ArrowObj, FrameObj, NewObject, Point, ShapeObj, StickyColor, StickyObj, TextObj } from "./types";

/*
 * Starter boards. Each template is a pure builder over a BoardDoc: it creates objects (one undo
 * step) and nothing else, so it works the same on the client, in tests and from the first sync.
 * All colours are CSS custom properties from styles/tokens.css, never raw values.
 */

export const TEMPLATE_IDS = ["blank", "moodboard", "deck", "brainstorm", "flowchart", "kanban"] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

export type Template = {
  id: TemplateId;
  name: string;
  description: string;
  build(doc: BoardDoc): void;
};

const INK = "var(--color-ink)";
const MUTED = "var(--color-muted)";
const SURFACE = "var(--color-surface)";

// ---- small building blocks ---------------------------------------------------------------------------

/** Plain text into a text/sticky/shape's rich-text fragment: one paragraph per line. */
function writeText(doc: BoardDoc, id: string, text: string): void {
  const fragment = doc.content(id);
  if (!fragment) return;
  text.split("\n").forEach((line, i) => {
    const p = new Y.XmlElement("paragraph");
    fragment.insert(i, [p]);
    if (line) {
      const t = new Y.XmlText();
      p.insert(0, [t]);
      t.insert(0, line);
    }
  });
}

type Box = { x: number; y: number; w: number; h: number };

function text(doc: BoardDoc, box: Box, content: string, patch: Partial<TextObj> = {}, parentId: string | null = null): string {
  const id = doc.create({ ...defaultsFor("text"), ...box, parentId, autoWidth: false, ...patch } as NewObject);
  writeText(doc, id, content);
  return id;
}

function sticky(doc: BoardDoc, box: Box, content: string, fill: StickyColor, parentId: string | null = null): string {
  const id = doc.create({ ...defaultsFor("sticky"), ...box, parentId, fill } as NewObject<StickyObj>);
  writeText(doc, id, content);
  return id;
}

function shape(doc: BoardDoc, box: Box, patch: Partial<ShapeObj>, content = "", parentId: string | null = null): string {
  const id = doc.create({ ...defaultsFor("shape"), ...box, parentId, ...patch } as NewObject<ShapeObj>);
  if (content) writeText(doc, id, content);
  return id;
}

function frames(doc: BoardDoc, specs: Array<{ name: string; x: number; y: number; w: number; h: number; preset: FrameObj["preset"] }>): string[] {
  let prev: string | null = null;
  return specs.map((s) => {
    const order = keyBetween(prev, null);
    prev = order;
    return doc.create({ ...defaultsFor("frame"), ...s, order } as NewObject<FrameObj>);
  });
}

type Anchor = { id: string; at: Point };

/** An arrow whose two ends are glued to shapes. Its box is the box around the two anchor points. */
function arrow(doc: BoardDoc, from: Anchor, to: Anchor, patch: Partial<ArrowObj> = {}): string {
  const pos = (a: Anchor): Point => {
    const t = doc.get(a.id)!;
    return { x: t.x + a.at.x * t.w, y: t.y + a.at.y * t.h };
  };
  const p = pos(from);
  const q = pos(to);
  const x = Math.min(p.x, q.x);
  const y = Math.min(p.y, q.y);
  return doc.create({
    ...defaultsFor("arrow"),
    x,
    y,
    w: Math.max(1, Math.abs(p.x - q.x)),
    h: Math.max(1, Math.abs(p.y - q.y)),
    start: { kind: "bound", id: from.id, anchor: from.at },
    end: { kind: "bound", id: to.id, anchor: to.at },
    ...patch,
  } as NewObject<ArrowObj>);
}

const TOP = { x: 0.5, y: 0 };
const BOTTOM = { x: 0.5, y: 1 };
const LEFT = { x: 0, y: 0.5 };
const RIGHT = { x: 1, y: 0.5 };

const SLIDE = { w: 1920, h: 1080 } as const;
const SLIDE_GAP = 240;

// ---- templates ---------------------------------------------------------------------------------------

function buildMoodboard(doc: BoardDoc): void {
  const names = ["Direction A", "Direction B"];
  const ids = frames(
    doc,
    names.map((name, i) => ({ name, x: i * (SLIDE.w + SLIDE_GAP), y: 0, ...SLIDE, preset: "slide-16-9" as const })),
  );
  const cols = 3;
  const gap = 48;
  const pad = 96;
  const cell = { w: Math.floor((SLIDE.w - pad * 2 - gap * (cols - 1)) / cols), h: 360 };
  ids.forEach((frameId, i) => {
    const fx = i * (SLIDE.w + SLIDE_GAP);
    text(doc, { x: fx + pad, y: 72, w: SLIDE.w - pad * 2, h: 72 }, names[i], { fontSize: 56 }, frameId);
    for (let k = 0; k < 6; k++) {
      const x = fx + pad + (k % cols) * (cell.w + gap);
      const y = 220 + Math.floor(k / cols) * (cell.h + gap);
      shape(doc, { x, y, ...cell }, { kind: "rect", fill: null, stroke: MUTED, strokeStyle: "dashed", strokeWidth: 2 }, "", frameId);
    }
  });
}

function buildDeck(doc: BoardDoc): void {
  const ids = frames(
    doc,
    [1, 2, 3, 4, 5].map((n) => ({ name: `Slide ${n}`, x: (n - 1) * (SLIDE.w + SLIDE_GAP), y: 0, ...SLIDE, preset: "slide-16-9" as const })),
  );
  ids.forEach((frameId, i) => {
    const fx = i * (SLIDE.w + SLIDE_GAP);
    if (i === 0) {
      text(doc, { x: fx + 160, y: 380, w: SLIDE.w - 320, h: 140 }, "Presentation title", { fontSize: 112 }, frameId);
      text(doc, { x: fx + 160, y: 560, w: SLIDE.w - 320, h: 64 }, "Subtitle or date", { fontSize: 40, color: MUTED }, frameId);
    } else {
      text(doc, { x: fx + 160, y: 120, w: SLIDE.w - 320, h: 100 }, "Slide title", { fontSize: 72 }, frameId);
      text(doc, { x: fx + 160, y: 280, w: SLIDE.w - 320, h: 400 }, "Add your content here", { fontSize: 40, color: MUTED }, frameId);
    }
  });
}

const STICKY_CYCLE: StickyColor[] = ["yellow", "peach", "pink", "lilac", "blue", "mint", "sand", "grey"];

function buildBrainstorm(doc: BoardDoc): void {
  text(doc, { x: -200, y: -50, w: 400, h: 100 }, "Topic", { fontSize: 64, align: "center" });
  const radius = 480;
  for (let k = 0; k < 8; k++) {
    const angle = (k / 8) * Math.PI * 2 - Math.PI / 2;
    const cx = Math.cos(angle) * radius;
    const cy = Math.sin(angle) * radius;
    sticky(doc, { x: cx - 100, y: cy - 100, w: 200, h: 200 }, "Idea", STICKY_CYCLE[k]);
  }
}

function buildFlowchart(doc: BoardDoc): void {
  const base = { fill: SURFACE, stroke: INK, strokeWidth: 2 } as const;
  const start = shape(doc, { x: -100, y: 0, w: 200, h: 80 }, { ...base, kind: "roundRect", cornerRadius: 40 }, "Start");
  const process = shape(doc, { x: -120, y: 160, w: 240, h: 100 }, { ...base, kind: "rect" }, "Process step");
  const decision = shape(doc, { x: -120, y: 340, w: 240, h: 160 }, { ...base, kind: "diamond" }, "Decision?");
  const end = shape(doc, { x: -100, y: 600, w: 200, h: 80 }, { ...base, kind: "roundRect", cornerRadius: 40 }, "End");
  const revise = shape(doc, { x: 300, y: 370, w: 220, h: 100 }, { ...base, kind: "rect" }, "Revise");

  arrow(doc, { id: start, at: BOTTOM }, { id: process, at: TOP });
  arrow(doc, { id: process, at: BOTTOM }, { id: decision, at: TOP });
  arrow(doc, { id: decision, at: BOTTOM }, { id: end, at: TOP }, { label: "Yes" });
  arrow(doc, { id: decision, at: RIGHT }, { id: revise, at: LEFT }, { label: "No" });
  arrow(doc, { id: revise, at: TOP }, { id: process, at: RIGHT }, { route: "elbow" });
}

function buildKanban(doc: BoardDoc): void {
  const cols = [
    { name: "To do", cards: ["Task one", "Task two", "Task three"], colors: ["yellow", "yellow", "yellow"] },
    { name: "Doing", cards: ["Task four", "Task five"], colors: ["blue", "blue"] },
    { name: "Done", cards: ["Task six"], colors: ["mint"] },
  ] satisfies Array<{ name: string; cards: string[]; colors: StickyColor[] }>;
  const W = 640;
  const H = 1000;
  const GAP = 80;
  const ids = frames(
    doc,
    cols.map((c, i) => ({ name: c.name, x: i * (W + GAP), y: 0, w: W, h: H, preset: "custom" as const })),
  );
  cols.forEach((c, i) => {
    c.cards.forEach((label, k) => {
      sticky(doc, { x: i * (W + GAP) + (W - 200) / 2, y: 80 + k * 240, w: 200, h: 200 }, label, c.colors[k], ids[i]);
    });
  });
}

export const TEMPLATES: Template[] = [
  { id: "blank", name: "Blank board", description: "An empty canvas.", build: () => {} },
  { id: "moodboard", name: "Moodboard", description: "Two directions, each with six image slots.", build: (doc) => doc.transact(() => buildMoodboard(doc)) },
  { id: "deck", name: "Presentation deck", description: "Five 16:9 slides in order.", build: (doc) => doc.transact(() => buildDeck(doc)) },
  { id: "brainstorm", name: "Brainstorm", description: "A topic with eight stickies around it.", build: (doc) => doc.transact(() => buildBrainstorm(doc)) },
  { id: "flowchart", name: "Flowchart", description: "Start, process, decision and end, joined by arrows.", build: (doc) => doc.transact(() => buildFlowchart(doc)) },
  { id: "kanban", name: "Kanban", description: "To do, Doing and Done columns with cards.", build: (doc) => doc.transact(() => buildKanban(doc)) },
];

export function getTemplate(id: string | null | undefined): Template | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

/** Name of the frame that comes first in presentation order, for the board's card on the home screen. */
export function firstFrameName(doc: BoardDoc): string | null {
  let first: FrameObj | null = null;
  for (const o of doc.all()) {
    if (o.type === "frame" && (first === null || o.order < first.order)) first = o;
  }
  return first ? first.name : null;
}
