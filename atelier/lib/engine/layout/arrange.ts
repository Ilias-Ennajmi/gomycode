import type { Point } from "../model/types";

/**
 * Layout algorithms for a selection: pure functions over rects (no DOM, no document). Each takes the objects' current
 * axis-aligned boxes and returns a placement for every one of them, in the input order. Aspect ratios are never
 * distorted: a size only changes by a uniform scale. Items with a zero or non-finite size are left exactly where
 * they are and take no part; with fewer than two usable items nothing moves.
 */

/** The current rect of an item (for a rotated object: its axis-aligned bounds). */
export type LayoutItem = { id: string; w: number; h: number; x: number; y: number };
export type Placement = { id: string; x: number; y: number; w: number; h: number };

const usable = (i: LayoutItem): boolean => [i.x, i.y, i.w, i.h].every(Number.isFinite) && i.w > 0 && i.h > 0;
const unchanged = (i: LayoutItem): Placement => ({ id: i.id, x: i.x, y: i.y, w: i.w, h: i.h });

const gutterOf = (g: number): number => (Number.isFinite(g) && g > 0 ? g : 0);
const countOf = (n: number): number => (Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1);

type Prepared = { items: LayoutItem[]; live: LayoutItem[]; box: { x: number; y: number; w: number; h: number } | null };

function prepare(items: LayoutItem[]): Prepared {
  const live = items.filter(usable);
  if (live.length === 0) return { items, live, box: null };
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const i of live) {
    x0 = Math.min(x0, i.x);
    y0 = Math.min(y0, i.y);
    x1 = Math.max(x1, i.x + i.w);
    y1 = Math.max(y1, i.y + i.h);
  }
  return { items, live, box: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } };
}

/** Placements in the input order: `placed` for the items that moved, the item itself for everything else. */
function assemble(items: LayoutItem[], placed: Map<string, Placement>): Placement[] {
  return items.map((i) => placed.get(i.id) ?? unchanged(i));
}

const noop = (items: LayoutItem[]): Placement[] => items.map(unchanged);

// ---- reading order -----------------------------------------------------------------------------------------------

const centreY = (i: LayoutItem) => i.y + i.h / 2;
const centreX = (i: LayoutItem) => i.x + i.w / 2;
const byId = (a: LayoutItem, b: LayoutItem) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Group usable items into visual rows: an item joins the current row when its vertical extent overlaps the row's
 * first item by more than half of the smaller height. Rows run top to bottom, items within a row left to right.
 * Ties are broken by id, so the result does not depend on the input order.
 */
export function rowsOf(items: LayoutItem[]): LayoutItem[][] {
  const sorted = items.filter(usable).sort((a, b) => centreY(a) - centreY(b) || centreX(a) - centreX(b) || byId(a, b));
  const rows: LayoutItem[][] = [];
  let anchor: LayoutItem | null = null;
  for (const it of sorted) {
    if (anchor) {
      const overlap = Math.min(it.y + it.h, anchor.y + anchor.h) - Math.max(it.y, anchor.y);
      if (overlap > 0.5 * Math.min(it.h, anchor.h)) {
        rows[rows.length - 1].push(it);
        continue;
      }
    }
    anchor = it;
    rows.push([it]);
  }
  return rows.map((r) => r.sort((a, b) => centreX(a) - centreX(b) || byId(a, b)));
}

/** Items in reading order (top to bottom, then left to right of their centres); unusable items go last. */
export function orderByReading(items: LayoutItem[]): LayoutItem[] {
  return [...rowsOf(items).flat(), ...items.filter((i) => !usable(i))];
}

// ---- grid and masonry --------------------------------------------------------------------------------------------

type ColumnOpts = { columns: number; gutter: number; origin?: Point; width?: number };

function columnSetup(p: Prepared, o: ColumnOpts) {
  const columns = countOf(o.columns);
  const gutter = gutterOf(o.gutter);
  const width = o.width !== undefined && Number.isFinite(o.width) && o.width > 0 ? o.width : Math.max(p.box!.w, 200 * columns);
  const cell = Math.max((width - gutter * (columns - 1)) / columns, 1e-6);
  const origin = o.origin && Number.isFinite(o.origin.x) && Number.isFinite(o.origin.y) ? o.origin : { x: p.box!.x, y: p.box!.y };
  return { columns, gutter, cell, origin };
}

/** Equal columns; reading order fills row by row, each row as tall as its tallest item, items top-aligned. */
export function layoutGrid(items: LayoutItem[], o: ColumnOpts): Placement[] {
  const p = prepare(items);
  if (p.live.length < 2) return noop(items);
  const { columns, gutter, cell, origin } = columnSetup(p, o);
  const placed = new Map<string, Placement>();
  const ordered = rowsOf(p.live).flat();
  let top = origin.y;
  for (let start = 0; start < ordered.length; start += columns) {
    let rowH = 0;
    ordered.slice(start, start + columns).forEach((it, c) => {
      const s = cell / it.w;
      const h = it.h * s;
      placed.set(it.id, { id: it.id, x: origin.x + c * (cell + gutter), y: top, w: cell, h });
      rowH = Math.max(rowH, h);
    });
    top += rowH + gutter;
  }
  return assemble(items, placed);
}

/** Equal columns; each item goes to the currently shortest column (ties: leftmost), in reading order. */
export function layoutMasonry(items: LayoutItem[], o: ColumnOpts): Placement[] {
  const p = prepare(items);
  if (p.live.length < 2) return noop(items);
  const { columns, gutter, cell, origin } = columnSetup(p, o);
  const heights = new Array<number>(columns).fill(0);
  const placed = new Map<string, Placement>();
  for (const it of rowsOf(p.live).flat()) {
    let c = 0;
    for (let k = 1; k < columns; k++) if (heights[k] < heights[c] - 1e-9) c = k;
    const h = it.h * (cell / it.w);
    placed.set(it.id, { id: it.id, x: origin.x + c * (cell + gutter), y: origin.y + heights[c], w: cell, h });
    heights[c] += h + gutter;
  }
  return assemble(items, placed);
}

// ---- justified rows ----------------------------------------------------------------------------------------------

/** The last row is only stretched to the full width when that takes a scale of at most this. */
const LAST_ROW_STRETCH = 1.25;

/**
 * Rows of equal height filling `width`: items are added at `targetRowHeight` until the row exceeds the width, then
 * the row is scaled to fill it exactly. The last row stays at the target height unless filling it needs a scale of
 * at most 1.25.
 */
export function layoutJustified(items: LayoutItem[], o: { targetRowHeight: number; gutter: number; width: number; origin?: Point }): Placement[] {
  const p = prepare(items);
  if (p.live.length < 2) return noop(items);
  const gutter = gutterOf(o.gutter);
  const target = Number.isFinite(o.targetRowHeight) && o.targetRowHeight > 0 ? o.targetRowHeight : median(p.live.map((i) => i.h));
  const width = Number.isFinite(o.width) && o.width > 0 ? o.width : Math.max(p.box!.w, 1);
  const origin = o.origin && Number.isFinite(o.origin.x) && Number.isFinite(o.origin.y) ? o.origin : { x: p.box!.x, y: p.box!.y };
  const placed = new Map<string, Placement>();
  let top = origin.y;

  const flush = (row: LayoutItem[], full: boolean) => {
    const natural = row.map((it) => (it.w * target) / it.h);
    const sum = natural.reduce((a, b) => a + b, 0);
    const avail = width - gutter * (row.length - 1);
    let scale = avail > 0 ? avail / sum : 1;
    if (!full && scale > LAST_ROW_STRETCH) scale = 1;
    if (!(scale > 0) || !Number.isFinite(scale)) scale = 1;
    const h = target * scale;
    let x = origin.x;
    row.forEach((it, k) => {
      const w = natural[k] * scale;
      placed.set(it.id, { id: it.id, x, y: top, w, h });
      x += w + gutter;
    });
    top += h + gutter;
  };

  let row: LayoutItem[] = [];
  let used = 0;
  for (const it of rowsOf(p.live).flat()) {
    row.push(it);
    used += (it.w * target) / it.h + (row.length > 1 ? gutter : 0);
    if (used > width) {
      flush(row, true);
      row = [];
      used = 0;
    }
  }
  if (row.length > 0) flush(row, false);
  return assemble(items, placed);
}

// ---- tight pack --------------------------------------------------------------------------------------------------

type FreeRect = { x: number; y: number; w: number; h: number };

/** MaxRects (best short side fit) for a bin of the given size. Returns the placed top-left corners or null. */
function maxRects(sizes: Array<{ w: number; h: number }>, binW: number, binH: number): Array<{ x: number; y: number }> | null {
  let free: FreeRect[] = [{ x: 0, y: 0, w: binW, h: binH }];
  const out: Array<{ x: number; y: number }> = [];
  for (const s of sizes) {
    let best: FreeRect | null = null;
    let bestShort = Infinity;
    let bestLong = Infinity;
    for (const f of free) {
      if (f.w + 1e-9 < s.w || f.h + 1e-9 < s.h) continue;
      const short = Math.min(f.w - s.w, f.h - s.h);
      const long = Math.max(f.w - s.w, f.h - s.h);
      if (short < bestShort || (short === bestShort && long < bestLong)) {
        best = f;
        bestShort = short;
        bestLong = long;
      }
    }
    if (!best) return null;
    const placed = { x: best.x, y: best.y, w: s.w, h: s.h };
    out.push({ x: placed.x, y: placed.y });
    const next: FreeRect[] = [];
    for (const f of free) {
      if (placed.x >= f.x + f.w || placed.x + placed.w <= f.x || placed.y >= f.y + f.h || placed.y + placed.h <= f.y) {
        next.push(f);
        continue;
      }
      if (placed.x > f.x) next.push({ x: f.x, y: f.y, w: placed.x - f.x, h: f.h });
      if (placed.x + placed.w < f.x + f.w) next.push({ x: placed.x + placed.w, y: f.y, w: f.x + f.w - (placed.x + placed.w), h: f.h });
      if (placed.y > f.y) next.push({ x: f.x, y: f.y, w: f.w, h: placed.y - f.y });
      if (placed.y + placed.h < f.y + f.h) next.push({ x: f.x, y: placed.y + placed.h, w: f.w, h: f.y + f.h - (placed.y + placed.h) });
    }
    // Drop free rects contained in another one.
    free = next.filter((a, i) => !next.some((b, j) => i !== j && a.x >= b.x - 1e-9 && a.y >= b.y - 1e-9 && a.x + a.w <= b.x + b.w + 1e-9 && a.y + a.h <= b.y + b.h + 1e-9 && (a.w < b.w || a.h < b.h || j < i)));
  }
  return out;
}

/** Shelf packing (rows of the tallest-first items): fast, used for very large selections. */
function shelves(sizes: Array<{ w: number; h: number }>, binW: number, binH: number): Array<{ x: number; y: number }> | null {
  const out: Array<{ x: number; y: number }> = [];
  let x = 0;
  let y = 0;
  let rowH = 0;
  for (const s of sizes) {
    if (s.w > binW + 1e-9) return null;
    if (x + s.w > binW + 1e-9) {
      y += rowH;
      x = 0;
      rowH = 0;
    }
    if (y + s.h > binH + 1e-9) return null;
    out.push({ x, y });
    x += s.w;
    rowH = Math.max(rowH, s.h);
  }
  return out;
}

const MAXRECTS_LIMIT = 300;

/**
 * No resizing: items are packed (MaxRects, best short side; shelves above 300 items) into the narrowest bin of the
 * requested aspect (default: the selection's own aspect), found by binary search on the bin width.
 */
export function layoutPack(items: LayoutItem[], o: { gutter: number; aspect?: number; origin?: Point }): Placement[] {
  const p = prepare(items);
  if (p.live.length < 2) return noop(items);
  const g = gutterOf(o.gutter);
  const aspect = o.aspect !== undefined && Number.isFinite(o.aspect) && o.aspect > 0 ? o.aspect : p.box!.w / p.box!.h;
  const origin = o.origin && Number.isFinite(o.origin.x) && Number.isFinite(o.origin.y) ? o.origin : { x: p.box!.x, y: p.box!.y };
  // Big items first: a stable, input-order independent sequence.
  const seq = [...p.live].sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.w * b.h - a.w * a.h || byId(a, b));
  const sizes = seq.map((i) => ({ w: i.w + g, h: i.h + g }));
  const pack = seq.length > MAXRECTS_LIMIT ? shelves : maxRects;
  // The bin includes one extra gutter on the right and bottom, so the last items need no trailing gap.
  const tryWidth = (w: number) => pack(sizes, w + g, w / aspect + g);

  const maxW = Math.max(...seq.map((i) => i.w));
  const maxH = Math.max(...seq.map((i) => i.h));
  const lo0 = Math.max(maxW, maxH * aspect);
  const area = sizes.reduce((n, s) => n + s.w * s.h, 0);
  let hi = Math.max(lo0, Math.sqrt(area * aspect));
  let best = tryWidth(hi);
  let lo = lo0;
  for (let k = 0; !best && k < 80; k++) {
    lo = hi;
    hi *= 1.25;
    best = tryWidth(hi);
  }
  if (best) {
    for (let k = 0; k < 14 && hi - lo > 1; k++) {
      const mid = (lo + hi) / 2;
      const r = tryWidth(mid);
      if (r) {
        best = r;
        hi = mid;
      } else lo = mid;
    }
  } else {
    // Cannot happen for finite input; a single column is always valid.
    let y = 0;
    best = sizes.map((s) => {
      const at = { x: 0, y };
      y += s.h;
      return at;
    });
  }
  const placed = new Map<string, Placement>();
  seq.forEach((it, k) => placed.set(it.id, { id: it.id, x: origin.x + best![k].x, y: origin.y + best![k].y, w: it.w, h: it.h }));
  return assemble(items, placed);
}

// ---- normalise sizes ---------------------------------------------------------------------------------------------

function median(values: number[]): number {
  const v = [...values].sort((a, b) => a - b);
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** Scale every item (uniformly, about its own centre) so its height or width equals the target. */
export function normaliseSize(items: LayoutItem[], o: { by: "height" | "width"; target: "median" | "min" | "max" | number }): Placement[] {
  const p = prepare(items);
  if (p.live.length < 2) return noop(items);
  const dim = (i: LayoutItem) => (o.by === "height" ? i.h : i.w);
  const values = p.live.map(dim);
  let target: number;
  if (typeof o.target === "number") target = o.target;
  else if (o.target === "min") target = Math.min(...values);
  else if (o.target === "max") target = Math.max(...values);
  else target = median(values);
  if (!Number.isFinite(target) || target <= 0) return noop(items);
  const placed = new Map<string, Placement>();
  for (const it of p.live) {
    const s = target / dim(it);
    const w = it.w * s;
    const h = it.h * s;
    placed.set(it.id, { id: it.id, x: it.x + it.w / 2 - w / 2, y: it.y + it.h / 2 - h / 2, w, h });
  }
  return assemble(items, placed);
}

// ---- tidy (keep the grid) ----------------------------------------------------------------------------------------

/**
 * Keep the order and sizes; straighten the rows. Rows are the items that overlap vertically by more than half of
 * the smaller height. Each row keeps its left edge and has equal gutters between items; a row starts a gutter below
 * the bottom of the row above (the first row keeps its top).
 */
export function tidy(items: LayoutItem[], o: { gutter: number }): Placement[] {
  const p = prepare(items);
  if (p.live.length < 2) return noop(items);
  const gutter = gutterOf(o.gutter);
  const placed = new Map<string, Placement>();
  let prevBottom: number | null = null;
  for (const row of rowsOf(p.live)) {
    const left = Math.min(...row.map((i) => i.x));
    const top: number = prevBottom === null ? Math.min(...row.map((i) => i.y)) : prevBottom + gutter;
    let x = left;
    let bottom = top;
    for (const it of row) {
      placed.set(it.id, { id: it.id, x, y: top, w: it.w, h: it.h });
      x += it.w + gutter;
      bottom = Math.max(bottom, top + it.h);
    }
    prevBottom = bottom;
  }
  return assemble(items, placed);
}
