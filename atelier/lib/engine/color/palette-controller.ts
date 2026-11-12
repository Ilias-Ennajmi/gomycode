import type { AssetMetaStore } from "@/lib/assets/meta-store";
import { DERIVED_ORIGIN, type BoardDoc } from "../doc/board-doc";
import type { CanvasObject, ImageObj, PaletteObj, PaletteSwatch } from "../model/types";
import { aggregatePalette, type AggregateInput } from "./aggregate";

export type PaletteControllerDeps = {
  doc: BoardDoc;
  meta: Pick<AssetMetaStore, "get" | "subscribe">;
  /** Quiet time after the last change before the palettes are recomputed. Default 300 ms. */
  debounceMs?: number;
};

const round = (v: number, places: number) => Math.round(v * 10 ** places) / 10 ** places;

/** Same colours, names and locks, weights equal to three decimals. */
export function samePalette(a: readonly PaletteSwatch[], b: readonly PaletteSwatch[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].hex !== b[i].hex || a[i].name !== b[i].name || a[i].locked !== b[i].locked) return false;
    if (round(a[i].weight, 3) !== round(b[i].weight, 3)) return false;
  }
  return true;
}

/** Whether `obj` sits (at any depth) inside the frame or group `ancestorId`. */
function isInside(doc: BoardDoc, obj: CanvasObject, ancestorId: string): boolean {
  const seen = new Set<string>();
  let p = obj.parentId;
  while (p && !seen.has(p)) {
    if (p === ancestorId) return true;
    seen.add(p);
    p = doc.get(p)?.parentId ?? null;
  }
  return false;
}

/**
 * Keeps every live palette object in step with the pictures on the board. A palette lists the colours of all images (or,
 * when it sits inside a frame, of the images inside that frame), merged by AssetMetaStore palettes weighted by image area;
 * locked and renamed swatches are kept. The result is written ONLY under DERIVED_ORIGIN, so it is never an undo step,
 * and ONLY when it differs from what is stored, so a quiet board produces no writes; changes made under DERIVED_ORIGIN
 * (its own writes) never trigger a recompute. `live: false` palettes are never touched.
 */
export class PaletteController {
  /** How many times the palettes were actually computed (tests, diagnostics). */
  recomputes = 0;
  private readonly doc: BoardDoc;
  private readonly meta: PaletteControllerDeps["meta"];
  private readonly wait: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private offs: Array<() => void> = [];

  constructor(deps: PaletteControllerDeps) {
    this.doc = deps.doc;
    this.meta = deps.meta;
    this.wait = deps.debounceMs ?? 300;
  }

  start(): void {
    if (this.offs.length) return;
    this.offs = [
      this.doc.onChange((ids, origin) => {
        if (origin === DERIVED_ORIGIN) return; // our own write (or another derived one): nothing to react to
        // Pictures, palettes and deletions matter; a text edit or a drag of a sticky does not.
        for (const id of ids) {
          const o = this.doc.get(id);
          if (!o || o.type === "image" || o.type === "palette" || o.type === "frame" || o.type === "group") {
            this.schedule();
            return;
          }
        }
      }),
      this.meta.subscribe(() => this.schedule()),
    ];
    this.schedule();
  }

  stop(): void {
    for (const off of this.offs) off();
    this.offs = [];
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.recompute();
    }, this.wait);
  }

  /** Compute now. Writes at most once (one transaction for all palettes), and only if something differs. */
  recompute(): void {
    const all = this.doc.all();
    const palettes = all.filter((o): o is PaletteObj => o.type === "palette" && o.live);
    if (palettes.length === 0) return;
    this.recomputes++;
    const images = all.filter((o): o is ImageObj => o.type === "image");
    const writes: Array<[string, PaletteSwatch[]]> = [];
    for (const p of palettes) {
      const scope = p.parentId && this.doc.get(p.parentId)?.type === "frame" ? images.filter((i) => isInside(this.doc, i, p.parentId!)) : images;
      const inputs: AggregateInput[] = [];
      for (const img of scope) {
        const palette = this.meta.get(img.assetId)?.palette;
        if (palette) inputs.push({ palette, area: img.w * img.h });
      }
      const keep = p.swatches.filter((s) => s.locked || s.name.trim() !== "");
      const next = aggregatePalette(inputs, { maxColors: p.maxColors, locked: keep }).map((s) => ({ ...s, weight: round(s.weight, 4) }));
      if (!samePalette(p.swatches, next)) writes.push([p.id, next]);
    }
    if (writes.length === 0) return;
    this.doc.transactAs(DERIVED_ORIGIN, () => {
      for (const [id, swatches] of writes) this.doc.update(id, { swatches });
    });
  }
}
