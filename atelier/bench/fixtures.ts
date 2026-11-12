/*
 * Board fixtures for the performance harness and the fault tests. Everything is generated from a seed, so every run
 * measures the same board and nothing large is committed.
 *
 * A fixture is a BoardDoc built in Node and encoded as one Yjs update. `seedBoard` (harness.ts) writes that update into
 * the browser's IndexedDB under `atelier-board-{id}`, exactly where the app's own persistence keeps it, so the board
 * opens "from the local cache" the way a returning visit does.
 */
import * as Y from "yjs";
import { BoardDoc } from "../lib/engine/doc/board-doc";
import { arrowBounds } from "../lib/engine/geometry/arrow-path";
import { defaultsFor } from "../lib/engine/model/defaults";
import type { ArrowObj, CanvasObject, NewObject, StickyColor } from "../lib/engine/model/types";

/** A small, fast, seedable generator (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const COLORS: StickyColor[] = ["yellow", "peach", "pink", "lilac", "blue", "mint", "sand", "grey"];
const WORDS = ["light", "texture", "grain", "palette", "mood", "contrast", "tone", "layout", "type", "shadow", "edge", "warm", "cool", "quiet", "loud"];

function words(rand: () => number, n: number): string {
  return Array.from({ length: n }, () => WORDS[Math.floor(rand() * WORDS.length)]).join(" ");
}

/** Plain text into a text, sticky or shape's rich-text fragment, one paragraph per line. */
export function writeText(doc: BoardDoc, id: string, text: string): void {
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

export type MixedBoardOptions = { count?: number; seed?: number };

/**
 * A realistic mixed board of exactly `count` objects (default 500): a few frames holding stickies, loose stickies with
 * text, labelled shapes, text blocks, pen strokes, bound arrows between shapes, and image placeholders, laid out on a
 * grid roughly 6,500 x 5,200 canvas units across.
 */
export function buildMixedBoard(opts: MixedBoardOptions = {}): BoardDoc {
  const count = opts.count ?? 500;
  const rand = rng(opts.seed ?? 7);
  const doc = new BoardDoc(new Y.Doc());
  doc.meta.title = `Bench ${count}`;
  const PITCH_X = 280;
  const PITCH_Y = 260;
  const COLS = Math.max(8, Math.round(Math.sqrt(count * 1.25)));
  let made = 0;
  const cell = (i: number) => ({ x: (i % COLS) * PITCH_X, y: Math.floor(i / COLS) * PITCH_Y });

  doc.transact(() => {
    // Five frames, each holding six stickies (35 objects).
    const framesWanted = count >= 100 ? 5 : 0;
    for (let f = 0; f < framesWanted; f++) {
      const fx = (f % 5) * 1100;
      const fy = -900;
      const frame = doc.create({ ...defaultsFor("frame"), x: fx, y: fy, w: 1000, h: 700, name: `Frame ${f + 1}`, preset: "custom", order: String.fromCharCode(97 + f) } as NewObject);
      made++;
      for (let s = 0; s < 6; s++) {
        const id = doc.create({ ...defaultsFor("sticky"), x: fx + 40 + (s % 3) * 310, y: fy + 60 + Math.floor(s / 3) * 300, fill: COLORS[s % COLORS.length], parentId: frame } as NewObject);
        writeText(doc, id, words(rand, 4));
        made++;
      }
    }

    // Shapes first (arrows need targets), then the rest of the mix by fixed proportions of what remains.
    const remaining = count - made;
    const nShapes = Math.round(remaining * 0.22);
    const nArrows = Math.round(remaining * 0.1);
    const nStrokes = Math.round(remaining * 0.1);
    const nText = Math.round(remaining * 0.14);
    const nImages = Math.round(remaining * 0.1);
    const nStickies = remaining - nShapes - nArrows - nStrokes - nText - nImages;

    let slot = 0;
    const shapeIds: string[] = [];
    for (let i = 0; i < nShapes; i++, slot++) {
      const c = cell(slot);
      const kinds = ["rect", "roundRect", "ellipse", "triangle", "diamond", "star"] as const;
      const id = doc.create({ ...defaultsFor("shape"), ...c, w: 180, h: 120, kind: kinds[i % kinds.length], fill: i % 3 === 0 ? "var(--color-surface)" : null } as NewObject);
      if (i % 2 === 0) writeText(doc, id, words(rand, 2));
      shapeIds.push(id);
      made++;
    }
    for (let i = 0; i < nStickies; i++, slot++) {
      const id = doc.create({ ...defaultsFor("sticky"), ...cell(slot), fill: COLORS[i % COLORS.length] } as NewObject);
      writeText(doc, id, words(rand, 3 + (i % 5)));
      made++;
    }
    for (let i = 0; i < nText; i++, slot++) {
      const id = doc.create({ ...defaultsFor("text"), ...cell(slot), w: 220, h: 60, autoWidth: false } as NewObject);
      writeText(doc, id, words(rand, 5));
      made++;
    }
    for (let i = 0; i < nImages; i++, slot++) {
      doc.create({ ...defaultsFor("image"), ...cell(slot), w: 240, h: 180, assetId: `bench-placeholder-${i}` } as NewObject);
      made++;
    }
    for (let i = 0; i < nStrokes; i++, slot++) {
      const c = cell(slot);
      const points: number[] = [];
      for (let p = 0; p < 40; p++) points.push(p * 4, Math.sin(p / 4) * 30 + 40, 0.5);
      doc.create({ ...defaultsFor("stroke"), x: c.x, y: c.y, w: 160, h: 80, tool: "pen", size: 4, points } as NewObject);
      made++;
    }
    for (let i = 0; i < nArrows && shapeIds.length > 1; i++) {
      const a = shapeIds[i % shapeIds.length];
      const b = shapeIds[(i * 7 + 3) % shapeIds.length];
      if (a === b) continue;
      const probe = {
        ...defaultsFor("arrow"),
        id: "",
        index: "",
        createdAt: 0,
        updatedAt: 0,
        start: { kind: "bound", id: a, anchor: { x: 1, y: 0.5 } },
        end: { kind: "bound", id: b, anchor: { x: 0, y: 0.5 } },
      } as ArrowObj;
      const box = arrowBounds(probe, (id) => doc.get(id));
      doc.create({ ...defaultsFor("arrow"), ...box, start: probe.start, end: probe.end } as NewObject);
      made++;
    }
  });

  // Rounding or a skipped arrow can leave the count short: top up with stickies so the board is exactly `count`.
  const have = doc.all().length;
  if (have < count) {
    doc.createMany(
      Array.from({ length: count - have }, (_, i) => ({ ...defaultsFor("sticky"), ...cell(COLS * 30 + i) }) as NewObject),
    );
  }
  return doc;
}

/** `count` image objects whose assets do not exist: what a board of that many images costs to lay out and cull. */
export function buildImageBoard(count = 1000, seed = 11): BoardDoc {
  const rand = rng(seed);
  const doc = new BoardDoc(new Y.Doc());
  doc.meta.title = `Bench ${count} images`;
  const cols = Math.ceil(Math.sqrt(count * 1.4));
  doc.createMany(
    Array.from({ length: count }, (_, i) => {
      const w = 160 + Math.floor(rand() * 200);
      const h = 120 + Math.floor(rand() * 200);
      return { ...defaultsFor("image"), x: (i % cols) * 400, y: Math.floor(i / cols) * 360, w, h, assetId: `bench-image-${i}` } as NewObject;
    }),
  );
  return doc;
}

/** The whole document as one Yjs update, base64, ready for `seedBoard`. */
export function encodeBase64(doc: BoardDoc): string {
  return Buffer.from(Y.encodeStateAsUpdate(doc.ydoc)).toString("base64");
}

/**
 * A board whose map holds good objects and bad ones, written straight into the Yjs document the way an older or newer
 * app version, a bug or a damaged sync could have left them. Returns the update and what a correct reader must keep.
 */
export function buildFaultyBoard(): { update: string; validIds: string[]; badIds: string[] } {
  const good = new BoardDoc(new Y.Doc());
  const g1 = good.create({ ...defaultsFor("sticky"), x: 0, y: 0 } as NewObject);
  const g2 = good.create({ ...defaultsFor("shape"), x: 300, y: 0 } as NewObject);
  const g3 = good.create({ ...defaultsFor("frame"), x: -400, y: 300, w: 500, h: 300, name: "Fine", preset: "custom", order: "a" } as NewObject);

  const ydoc = good.ydoc;
  const objects = ydoc.getMap<Y.Map<unknown>>("objects");
  const bad: Record<string, Record<string, unknown>> = {
    "bad-nan-x": { ...(good.get(g1) as CanvasObject), x: Number.NaN },
    "bad-infinity": { ...(good.get(g2) as CanvasObject), w: Number.POSITIVE_INFINITY },
    "bad-negative-size": { ...(good.get(g2) as CanvasObject), h: -10 },
    "bad-unknown-type": { ...(good.get(g1) as CanvasObject), type: "hologram" },
    "bad-future-kind": { ...(good.get(g2) as CanvasObject), kind: "heptagon" },
    "bad-missing-fields": { type: "sticky", x: 1, y: 2 },
    "bad-no-type": { x: 5, y: 5, w: 10, h: 10 },
    "bad-string-coords": { ...(good.get(g1) as CanvasObject), x: "12", y: "oops" },
    "bad-arrow-terminal": { ...defaultsFor("arrow"), index: "a1", createdAt: 1, updatedAt: 1, start: { kind: "teleport" }, end: null },
    "bad-stroke-points": { ...defaultsFor("stroke"), index: "a2", createdAt: 1, updatedAt: 1, points: [1, 2] },
  };
  ydoc.transact(() => {
    for (const [id, props] of Object.entries(bad)) {
      const m = new Y.Map<unknown>();
      objects.set(id, m);
      for (const [k, v] of Object.entries({ index: "a0", createdAt: 1, updatedAt: 1, ...props })) m.set(k, v);
    }
    // A key that is not a map at all, and one whose map is empty.
    (objects as unknown as Y.Map<unknown>).set("bad-not-a-map", "just a string");
    objects.set("bad-empty", new Y.Map<unknown>());
  });
  return {
    update: Buffer.from(Y.encodeStateAsUpdate(ydoc)).toString("base64"),
    validIds: [g1, g2, g3],
    badIds: [...Object.keys(bad), "bad-not-a-map", "bad-empty"],
  };
}
