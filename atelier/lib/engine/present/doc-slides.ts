// Slides of an owner's board document: reading them and reordering them. The share viewer does not import this file.
import type { BoardDoc } from "../doc/board-doc";
import { keyBetween } from "../model/index-order";
import { oneStepOn } from "../model/one-step";
import type { FrameObj } from "../model/types";
import { slidesOf, type Slide } from "./slides";

const framesOf = (doc: BoardDoc): FrameObj[] => doc.all().filter((o): o is FrameObj => o.type === "frame");

export function slidesOfDoc(doc: BoardDoc): Slide[] {
  return slidesOf(framesOf(doc));
}

/**
 * Put the slides in `orderedIds` order. Ids that are not slides are ignored, repeated ids count once, and slides not
 * named keep their current relative order after the named ones. Every slide gets a fresh, unique order key, which also
 * repairs duplicate or empty keys. One undo step; the frames' z-order is untouched.
 */
export function setSlideOrder(doc: BoardDoc, orderedIds: readonly string[]): void {
  const current = slidesOfDoc(doc);
  const known = new Set(current.map((s) => s.id));
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const id of orderedIds) {
    if (known.has(id) && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  for (const s of current) if (!seen.has(s.id)) ids.push(s.id);
  oneStepOn(doc, () => {
    let prev: string | null = null;
    for (const id of ids) {
      const key = keyBetween(prev, null);
      prev = key;
      const f = doc.get(id) as FrameObj | undefined;
      if (f && f.order !== key) doc.update(id, { order: key } as Partial<FrameObj>);
    }
  });
}

/** The plan's name for the same operation. */
export const reorderSlides = setSlideOrder;

/** Move one slide a place earlier (-1) or later (1). Returns false at the ends or for an unknown id. */
export function moveSlide(doc: BoardDoc, id: string, delta: -1 | 1): boolean {
  const ids = slidesOfDoc(doc).map((s) => s.id);
  const from = ids.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= ids.length) return false;
  ids.splice(to, 0, ...ids.splice(from, 1));
  setSlideOrder(doc, ids);
  return true;
}

/**
 * Where "present from here" starts: the slide that is selected, or that holds a selected object (walking up through
 * groups and frames), else the slide under `viewCentre`, else the first.
 */
export function startIndexFor(doc: BoardDoc, slides: readonly Slide[], selectionIds: ReadonlySet<string>, viewCentre: { x: number; y: number }): number {
  const byId = new Map(slides.map((s) => [s.id, s.index]));
  for (const id of selectionIds) {
    let cur = doc.get(id);
    for (let guard = 0; cur && guard < 64; guard++) {
      const hit = byId.get(cur.id);
      if (hit !== undefined) return hit;
      cur = cur.parentId ? doc.get(cur.parentId) : undefined;
    }
  }
  const under = slides.find((s) => viewCentre.x >= s.rect.x && viewCentre.x <= s.rect.x + s.rect.w && viewCentre.y >= s.rect.y && viewCentre.y <= s.rect.y + s.rect.h);
  return under?.index ?? 0;
}
