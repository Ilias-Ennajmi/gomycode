import RBush from "rbush";
import type { BoardDoc } from "../doc/board-doc";
import { screenToCanvas, type Camera } from "../geometry/camera";
import { boundsOf } from "../geometry/rect";
import { compareByIndex } from "../model/index-order";
import type { Point, Rect } from "../model/types";

type Item = { minX: number; minY: number; maxX: number; maxY: number; id: string; index: string };

/**
 * rbush over the axis-aligned bounds of every object, kept in sync with the doc incrementally via
 * `BoardDoc.onChange` (only touched ids are re-inserted). Results are in z-order (bottom first), except
 * `pointCandidates` which is top-most first.
 */
export class SpatialIndex {
  private readonly tree = new RBush<Item>();
  private readonly items = new Map<string, Item>();
  private off: (() => void) | null;

  constructor(private readonly doc: BoardDoc) {
    const initial: Item[] = [];
    for (const o of doc.all()) {
      const item = this.toItem(o);
      this.items.set(o.id, item);
      initial.push(item);
    }
    this.tree.load(initial);
    this.off = doc.onChange((ids) => this.refresh(ids));
  }

  /** Ids of objects whose bounds intersect `r` (edges touching count), bottom-most first. */
  search(r: Rect): string[] {
    return this.query(r)
      .sort(compareByIndex)
      .map((i) => i.id);
  }

  /** Candidates under a canvas point (within `tolerance`), top-most first. Callers refine with hitTest. */
  pointCandidates(p: Point, tolerance: number): string[] {
    const t = Math.max(Number.isFinite(tolerance) ? tolerance : 0, 0);
    return this.query({ x: p.x - t, y: p.y - t, w: 2 * t, h: 2 * t })
      .sort((a, b) => compareByIndex(b, a))
      .map((i) => i.id);
  }

  /** Objects in the viewport plus `marginPx` screen pixels on every side, bottom-most first. */
  visible(c: Camera, viewport: { w: number; h: number }, marginPx = 256): string[] {
    const m = Math.max(Number.isFinite(marginPx) ? marginPx : 0, 0);
    const tl = screenToCanvas(c, { x: -m, y: -m });
    const br = screenToCanvas(c, { x: viewport.w + m, y: viewport.h + m });
    return this.search({ x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y });
  }

  destroy(): void {
    this.off?.();
    this.off = null;
    this.tree.clear();
    this.items.clear();
  }

  private query(r: Rect): Item[] {
    if (this.off === null) return [];
    return this.tree.search({ minX: r.x, minY: r.y, maxX: r.x + r.w, maxY: r.y + r.h });
  }

  private refresh(ids: Set<string>): void {
    for (const id of ids) {
      const old = this.items.get(id);
      if (old) {
        this.tree.remove(old);
        this.items.delete(id);
      }
      const o = this.doc.get(id);
      if (!o) continue;
      const item = this.toItem(o);
      this.items.set(id, item);
      this.tree.insert(item);
    }
  }

  private toItem(o: { id: string; index: string; x: number; y: number; w: number; h: number; rotation: number }): Item {
    const b = boundsOf(o);
    return { minX: b.x, minY: b.y, maxX: b.x + b.w, maxY: b.y + b.h, id: o.id, index: o.index };
  }
}
