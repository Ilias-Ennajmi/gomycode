import type { AssetMetaStore } from "@/lib/assets/meta-store";
import type { BoardDoc } from "../doc/board-doc";
import type { SelectionStore } from "../input/selection-store";
import { normalizeHex } from "../model/color";
import type { ImageLayer } from "../render/image-layer";
import { imageContainsColor } from "./aggregate";

type Listener = () => void;

/** The colour the board is currently filtered by (a swatch click), or none. View state: never saved, never undoable. */
export class HighlightStore {
  private current: string | null = null;
  private readonly listeners = new Set<Listener>();

  get hex(): string | null {
    return this.current;
  }

  set(hex: string | null): void {
    const next = hex === null ? null : normalizeHex(hex);
    if (next === this.current) return;
    this.current = next;
    for (const cb of [...this.listeners]) cb();
  }

  toggle(hex: string): void {
    const norm = normalizeHex(hex);
    this.set(norm !== null && norm === this.current ? null : hex);
  }

  subscribe = (cb: Listener): (() => void) => {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  };
}

let shared: HighlightStore | null = null;
/** The one highlight the app shares (the canvas, the palette card and the Palette panel all read it). */
export function getHighlightStore(): HighlightStore {
  return (shared ??= new HighlightStore());
}

/** Ids of the images that do NOT contain `hex`. An image whose colours are not known yet counts as containing it. */
export function dimmedImageIds(doc: BoardDoc, meta: Pick<AssetMetaStore, "get">, hex: string): Set<string> {
  const out = new Set<string>();
  for (const o of doc.all()) {
    if (o.type !== "image") continue;
    const palette = meta.get(o.assetId)?.palette;
    if (palette && !imageContainsColor(palette, hex)) out.add(o.id);
  }
  return out;
}

/** Ids of the images that stay at full strength while `hex` is highlighted (the complement of dimmedImageIds). */
export function litImageIds(doc: BoardDoc, meta: Pick<AssetMetaStore, "get">, hex: string): Set<string> {
  const out = new Set<string>();
  for (const o of doc.all()) {
    if (o.type !== "image") continue;
    const palette = meta.get(o.assetId)?.palette;
    if (!palette || imageContainsColor(palette, hex)) out.add(o.id);
  }
  return out;
}

export type BindHighlightDeps = {
  doc: BoardDoc;
  meta: Pick<AssetMetaStore, "get" | "subscribe">;
  /** Only `setDimmed` is used: it takes the ids that stay lit, everything else is drawn faint. */
  images: Pick<ImageLayer, "setDimmed">;
  store: HighlightStore;
  selection: SelectionStore;
  /** The canvas element: a press on it that selects nothing clears the highlight. */
  container?: HTMLElement | null;
  /** How long after a board or colour-analysis change the dimming is recomputed. Default 100 ms. */
  debounceMs?: number;
};

/**
 * Keeps the image layer in step with the highlighted colour: images without it go faint. Recomputed when the colour
 * changes (at once) and when images or their colours change (debounced). Escape, or a press on empty canvas, clears the
 * highlight (a press on a `[data-highlight-chip]` does not). Returns the function that stops it and restores the layer.
 */
export function bindHighlight(d: BindHighlightDeps): () => void {
  const wait = d.debounceMs ?? 100;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let applied = false;

  const apply = () => {
    const hex = d.store.hex;
    if (hex === null) {
      if (applied) d.images.setDimmed(null);
      applied = false;
      return;
    }
    applied = true;
    d.images.setDimmed(litImageIds(d.doc, d.meta, hex));
  };
  const later = () => {
    if (d.store.hex === null || timer) return;
    timer = setTimeout(() => {
      timer = null;
      apply();
    }, wait);
  };

  const offStore = d.store.subscribe(apply);
  const offMeta = d.meta.subscribe(later);
  const offDoc = d.doc.onChange(later);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && d.store.hex !== null) d.store.set(null);
  };
  window.addEventListener("keydown", onKey, true);
  const onPress = (e: Event) => {
    if (d.store.hex === null) return;
    if (e.target instanceof Element && e.target.closest("[data-highlight-chip]")) return;
    // The tool has handled the press by the time this runs: nothing selected means it landed on empty canvas.
    setTimeout(() => {
      if (d.selection.size === 0) d.store.set(null);
    }, 0);
  };
  d.container?.addEventListener("pointerdown", onPress);

  return () => {
    offStore();
    offMeta();
    offDoc();
    window.removeEventListener("keydown", onKey, true);
    d.container?.removeEventListener("pointerdown", onPress);
    if (timer) clearTimeout(timer);
    if (applied) d.images.setDimmed(null);
  };
}
