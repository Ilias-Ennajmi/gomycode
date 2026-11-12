import type { Rect } from "../model/types";

/**
 * A snap guide. `axis` is the coordinate that `pos` fixes: an "x" guide is a vertical line at x = pos running from
 * y = from to y = to. With `gap` it is a distance marker instead: a segment between two boxes (from..to along the
 * other axis, at `pos`) labelled with the gap.
 */
export type Guide = { axis: "x" | "y"; pos: number; from: number; to: number; gap?: number };

export type SnapResult = { dx: number; dy: number; guides: Guide[] };

const EPS = 1e-6;

type Axis = {
  lo: (r: Rect) => number;
  len: (r: Rect) => number;
  clo: (r: Rect) => number; // cross axis
  clen: (r: Rect) => number;
  /** Which Guide axis an alignment line along this axis has. */
  alignAxis: "x" | "y";
  gapAxis: "x" | "y";
};

const X: Axis = { lo: (r) => r.x, len: (r) => r.w, clo: (r) => r.y, clen: (r) => r.h, alignAxis: "x", gapAxis: "y" };
const Y: Axis = { lo: (r) => r.y, len: (r) => r.h, clo: (r) => r.x, clen: (r) => r.w, alignAxis: "y", gapAxis: "x" };

const edges = (a: Axis, r: Rect): number[] => [a.lo(r), a.lo(r) + a.len(r) / 2, a.lo(r) + a.len(r)];
const hi = (a: Axis, r: Rect) => a.lo(r) + a.len(r);
const crossOverlap = (a: Axis, p: Rect, q: Rect) => a.clo(p) < a.clo(q) + a.clen(q) && a.clo(q) < a.clo(p) + a.clen(p);

type Candidate = { d: number; kind: "align" | "space" };

function candidates(a: Axis, m: Rect, others: Rect[], thr: number): Candidate[] {
  const out: Candidate[] = [];
  const me = edges(a, m);
  for (const o of others) {
    for (const oe of edges(a, o)) for (const e of me) if (Math.abs(oe - e) <= thr) out.push({ d: oe - e, kind: "align" });
  }

  // Equal spacing along this axis, among boxes that share a row (or column) with the moving box.
  const row = others.filter((o) => crossOverlap(a, o, m)).sort((p, q) => a.lo(p) - a.lo(q));
  for (let i = 0; i + 1 < row.length; i++) {
    const A = row[i];
    const B = row[i + 1];
    const g = a.lo(B) - hi(a, A);
    if (g < 0) continue;
    const mHi = hi(a, m);
    if (a.lo(m) >= hi(a, A) && mHi <= a.lo(B)) {
      const d = (a.lo(B) - mHi - (a.lo(m) - hi(a, A))) / 2; // centre in the gap
      if (Math.abs(d) <= thr) out.push({ d, kind: "space" });
    }
    if (a.lo(m) >= hi(a, B)) {
      const d = hi(a, B) + g - a.lo(m); // same gap after B
      if (Math.abs(d) <= thr) out.push({ d, kind: "space" });
    }
    if (mHi <= a.lo(A)) {
      const d = a.lo(A) - g - mHi; // same gap before A
      if (Math.abs(d) <= thr) out.push({ d, kind: "space" });
    }
  }
  return out;
}

function best(cs: Candidate[]): number {
  let pick: Candidate | null = null;
  for (const c of cs) {
    if (!pick || Math.abs(c.d) < Math.abs(pick.d) - EPS || (Math.abs(Math.abs(c.d) - Math.abs(pick.d)) <= EPS && c.kind === "align" && pick.kind !== "align")) {
      pick = c;
    }
  }
  return pick ? pick.d : 0;
}

function alignGuides(a: Axis, m: Rect, others: Rect[]): Guide[] {
  const byPos = new Map<number, Guide>();
  const me = edges(a, m);
  for (const o of others) {
    for (const oe of edges(a, o)) {
      if (!me.some((e) => Math.abs(e - oe) < EPS)) continue;
      const key = Math.round(oe * 1e4) / 1e4;
      const from = Math.min(a.clo(m), a.clo(o));
      const to = Math.max(a.clo(m) + a.clen(m), a.clo(o) + a.clen(o));
      const g = byPos.get(key);
      if (g) {
        g.from = Math.min(g.from, from);
        g.to = Math.max(g.to, to);
      } else byPos.set(key, { axis: a.alignAxis, pos: oe, from, to });
    }
  }
  return [...byPos.values()];
}

function gapGuides(a: Axis, m: Rect, others: Rect[]): Guide[] {
  const row = others.filter((o) => crossOverlap(a, o, m)).sort((p, q) => a.lo(p) - a.lo(q));
  const all = [...row, m].sort((p, q) => a.lo(p) - a.lo(q));
  const cross = a.clo(m) + a.clen(m) / 2;
  const gaps: Array<{ p: Rect; q: Rect; g: number }> = [];
  for (let i = 0; i + 1 < all.length; i++) gaps.push({ p: all[i], q: all[i + 1], g: a.lo(all[i + 1]) - hi(a, all[i]) });
  const mine = gaps.filter((x) => (x.p === m || x.q === m) && x.g >= -EPS);
  // A marker is only meaningful for a gap that equals another one: show every gap in the row with that size.
  const wanted = gaps.filter((x) => mine.some((y) => Math.abs(x.g - y.g) < EPS) && gaps.filter((z) => Math.abs(z.g - x.g) < EPS).length >= 2);
  return wanted.map(({ p, q, g }) => ({ axis: a.gapAxis, pos: cross, from: hi(a, p), to: a.lo(q), gap: g }));
}

/**
 * Snap `moving` to its neighbours. Aligns edges and centres and equalises spacing, separately per axis, within
 * `thresholdCanvas` canvas units. Returns the correction to add to the moving box and the guides to draw.
 */
export function computeSnap(moving: Rect, others: Rect[], thresholdCanvas: number): SnapResult {
  const none: SnapResult = { dx: 0, dy: 0, guides: [] };
  const finite = (r: Rect) => [r.x, r.y, r.w, r.h].every(Number.isFinite);
  const thr = thresholdCanvas;
  if (!finite(moving) || !(thr > 0) || !Number.isFinite(thr)) return none;
  const near = others.filter(finite);
  if (near.length === 0) return none;

  const dx = best(candidates(X, moving, near, thr));
  const dy = best(candidates(Y, moving, near, thr));
  if (dx === 0 && dy === 0) return none;
  const snapped = { x: moving.x + dx, y: moving.y + dy, w: moving.w, h: moving.h };
  const guides: Guide[] = [];
  if (dx !== 0) guides.push(...alignGuides(X, snapped, near), ...gapGuides(X, snapped, near));
  if (dy !== 0) guides.push(...alignGuides(Y, snapped, near), ...gapGuides(Y, snapped, near));
  return { dx, dy, guides };
}
