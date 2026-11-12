// DOM implementation of the ImageLayer: a keyed pool of <img> elements, written to only when something changed.
import type { AssetResolver } from "@/lib/assets/resolver-types";
import type { VariantName } from "@/lib/assets/variants";
import type { Camera } from "@/lib/engine/geometry/camera";
import { maskRadii, toDisplayCrop } from "@/lib/engine/model/image-style";
import type { Rect } from "@/lib/engine/model/types";
import { ImageResidency, decodedBytes, defaultBudgetBytes, type ResidencyEntry } from "./residency";
import type { ImageLayer, ImageLayerItem, ImageLayerStats, ImageLayerView } from "./image-layer";
import { TIERS, pickVariant, tierSize, type ChosenVariant } from "./variant";
import { nodeZ } from "./z-order";

export interface DomImageLayerDeps {
  resolver: AssetResolver;
  residency?: ImageResidency;
  now?: () => number;
  /**
   * The container sits inside a layer that already carries the camera transform (the canvas does this): `setCamera`
   * then writes nothing. Without it the layer transforms its own container.
   */
  inheritCamera?: boolean;
}

/** A caption is hidden when the image is narrower than this on screen. */
const CAPTION_MIN_PX = 120;
const CAPTION_FONT_PX = 11;
const DIM_OPACITY = 0.25;
const POOL_MAX = 48;
const LEGACY_VARIANTS: VariantName[] = ["w1024"];
/** Phase 1 assets have no recorded size: assume the original is no bigger than a w2048, so it is the tier after w1024. */
const LEGACY_ORIGINAL_LONGEST = 2048;

type Slot = {
  id: string;
  wrapper: HTMLDivElement;
  img: HTMLImageElement;
  caption: HTMLSpanElement | null;
  lastSeen: number;
  /** Tier currently shown (null: placeholder). */
  variant: ChosenVariant | null;
  /** undefined: nothing decided yet; null: no URL (placeholder). */
  src: string | null | undefined;
  decW: number;
  decH: number;
  mounted: boolean;
  // What is currently written to the DOM, so an unchanged update writes nothing.
  box: string;
  look: string;
  fit: string;
  z: number;
  dimmed: boolean | null;
  captionText: string;
  captionShown: boolean;
  captionSize: number;
};

function createSlot(doc: Document): Slot {
  const wrapper = doc.createElement("div");
  const s = wrapper.style;
  s.position = "absolute";
  s.left = "0";
  s.top = "0";
  s.overflow = "hidden";
  s.transformOrigin = "50% 50%";
  s.contain = "layout paint style";
  wrapper.setAttribute("data-object-type", "image");
  const img = doc.createElement("img");
  img.alt = "";
  img.setAttribute("decoding", "async");
  img.setAttribute("draggable", "false");
  img.style.position = "absolute";
  img.style.display = "block";
  img.style.maxWidth = "none";
  img.style.userSelect = "none";
  img.style.pointerEvents = "none";
  wrapper.appendChild(img);
  return { id: "", wrapper, img, caption: null, lastSeen: 0, variant: null, src: undefined, decW: 0, decH: 0, mounted: false, box: "", look: "", fit: "", z: NaN, dimmed: null, captionText: "", captionShown: true, captionSize: NaN };
}

/** Same rule as `imageClip` in model/image-style.ts (the mask is a border radius), without React. */
function maskRadius(item: ImageLayerItem): string {
  const { rx, ry } = maskRadii({ w: item.rect.w, h: item.rect.h, mask: item.mask });
  return rx > 0 || ry > 0 ? `${rx}px / ${ry}px` : "";
}

const clamp01 = (v: number) => (Number.isFinite(v) && v > 0 ? Math.min(1, v) : 1);

function intersects(r: Rect, c: Camera, vp: { w: number; h: number }): boolean {
  const z = c.z;
  const left = (r.x - c.x) * z;
  const top = (r.y - c.y) * z;
  return left < vp.w && top < vp.h && left + r.w * z > 0 && top + r.h * z > 0;
}

function browserBudget(): number {
  let coarse = false;
  try {
    coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  } catch {
    coarse = false;
  }
  const mem = typeof navigator !== "undefined" ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory : undefined;
  return defaultBudgetBytes({ deviceMemory: mem, coarsePointer: coarse });
}

export class DomImageLayer implements ImageLayer {
  private readonly resolver: AssetResolver;
  private readonly residency: ImageResidency;
  private readonly now: () => number;
  private readonly inherit: boolean;
  private container: HTMLElement | null = null;
  private readonly slots = new Map<string, Slot>();
  private pool: Slot[] = [];
  private gesture = false;
  private dimmed: ReadonlySet<string> | null = null;
  private camera: Camera = { x: 0, y: 0, z: 1 };

  constructor(deps: DomImageLayerDeps) {
    this.resolver = deps.resolver;
    this.residency = deps.residency ?? new ImageResidency({ budgetBytes: browserBudget() });
    this.now = deps.now ?? (() => (typeof performance !== "undefined" ? performance.now() : Date.now()));
    this.inherit = deps.inheritCamera ?? false;
  }

  mount(container: HTMLElement): void {
    this.container = container;
    if (!this.inherit) {
      container.style.position = "absolute";
      container.style.left = "0";
      container.style.top = "0";
      container.style.transformOrigin = "0 0";
      this.writeCamera();
    }
  }

  setCamera(c: Camera): void {
    this.camera = c;
    this.writeCamera();
  }

  private writeCamera(): void {
    if (this.inherit || !this.container) return;
    const c = this.camera;
    this.container.style.transform = `translate(${-c.x * c.z}px, ${-c.y * c.z}px) scale(${c.z})`;
  }

  setGesture(active: boolean): void {
    this.gesture = active;
  }

  setDimmed(ids: ReadonlySet<string> | null): void {
    this.dimmed = ids;
    for (const slot of this.slots.values()) this.writeDim(slot, this.itemOf.get(slot.id));
  }

  /** The latest item for each mounted id (kept for opacity, which depends on the dim state too). */
  private readonly itemOf = new Map<string, ImageLayerItem>();

  update(items: ImageLayerItem[], view: ImageLayerView): void {
    const container = this.container;
    if (!container) return;
    this.camera = view.camera;
    const settled = !this.gesture;
    const doc = container.ownerDocument;
    const now = this.now();
    const z = this.stacking(items);

    const entries: ResidencyEntry[] = [];
    const chosen = new Map<string, { item: ImageLayerItem; tiers: ChosenVariant[]; aw: number; ah: number; originalLongest: number }>();
    const seen = new Set<string>();

    for (const item of items) {
      let slot = this.slots.get(item.id);
      if (!slot) {
        if (!settled) continue; // no new mounts while the camera moves
        slot = this.pool.pop() ?? createSlot(doc);
        slot.id = item.id;
        slot.lastSeen = now;
        slot.wrapper.setAttribute("data-object-id", item.id);
        container.appendChild(slot.wrapper);
        slot.mounted = true;
        this.slots.set(item.id, slot);
      }
      seen.add(item.id);
      this.itemOf.set(item.id, item);
      const visible = intersects(item.rect, view.camera, view.viewport);
      if (visible) slot.lastSeen = now;
      this.writeGeometry(slot, item, z.get(item.id) ?? 0);
      this.writeDim(slot, item);
      if (!settled) continue;

      const info = this.choose(slot, item, view);
      chosen.set(item.id, { item, tiers: info.tiers, aw: info.aw, ah: info.ah, originalLongest: info.originalLongest });
      entries.push({ id: item.id, wanted: info.wanted, w: info.w, h: info.h, visible, lastSeen: slot.lastSeen, tiers: info.tiers });
    }
    if (!settled) return;

    for (const [id, slot] of this.slots) if (!seen.has(id)) this.release(id, slot);

    const plan = this.residency.plan(entries);
    for (const e of entries) {
      const slot = this.slots.get(e.id)!;
      const c = chosen.get(e.id)!;
      const tier = plan.get(e.id) ?? e.wanted;
      this.writeSource(slot, c.item, tier, c.aw, c.ah, c.originalLongest);
      this.writeCaption(slot, c.item, view.camera.z);
    }
  }

  /** z-index for every item: the host's base (or one from its z key), ties broken by key then id, one step apart. */
  private stacking(items: ImageLayerItem[]): Map<string, number> {
    const base = (i: ImageLayerItem) => i.z ?? nodeZ(i.zIndexKey);
    const sorted = items.length > 1 ? [...items].sort((a, b) => base(a) - base(b) || (a.zIndexKey < b.zIndexKey ? -1 : a.zIndexKey > b.zIndexKey ? 1 : a.id < b.id ? -1 : 1)) : items;
    const out = new Map<string, number>();
    let prev = NaN;
    let tie = 0;
    for (const i of sorted) {
      const b = base(i);
      tie = b === prev ? Math.min(tie + 1, 62) : 0;
      prev = b;
      out.set(i.id, b + tie);
    }
    return out;
  }

  private choose(slot: Slot, item: ImageLayerItem, view: ImageLayerView) {
    const meta = this.resolver.available(item.assetId);
    const variants = meta ? meta.variants : LEGACY_VARIANTS;
    const aw = meta ? meta.width : 0;
    const ah = meta ? meta.height : 0;
    const known = aw > 0 && ah > 0;
    const originalLongest = known ? Math.max(aw, ah) : LEGACY_ORIGINAL_LONGEST;
    const tiers = TIERS.filter((t) => t === "original" || variants.includes(t));
    // Measure along the source's longest axis (the object's, when the source size is unknown).
    const alongX = known ? aw >= ah : item.rect.w >= item.rect.h;
    const onScreenPx = (alongX ? item.rect.w : item.rect.h) * view.camera.z;
    const cropFraction = item.crop ? clamp01(alongX ? item.crop.w : item.crop.h) : 1;
    const wanted = pickVariant({ onScreenPx, dpr: view.dpr, cropFraction, available: variants, originalLongest, loaded: slot.variant, gesture: false });
    const aspect = known ? aw / ah : item.rect.h > 0 ? item.rect.w / item.rect.h : 1;
    const { w, h } = this.decodedSize(wanted, aspect, originalLongest);
    return { wanted, tiers, w, h, aw, ah, originalLongest };
  }

  private decodedSize(tier: ChosenVariant, aspect: number, originalLongest: number): { w: number; h: number } {
    const longest = tierSize(tier, originalLongest);
    return aspect >= 1 ? { w: longest, h: longest / aspect } : { w: longest * aspect, h: longest };
  }

  // ---- DOM writes: each one guarded by what is already there ----

  private writeGeometry(slot: Slot, item: ImageLayerItem, z: number): void {
    const { x, y, w, h } = item.rect;
    const box = `${x}|${y}|${w}|${h}|${item.rotation}`;
    const ws = slot.wrapper.style;
    if (box !== slot.box) {
      slot.box = box;
      ws.width = `${w}px`;
      ws.height = `${h}px`;
      ws.transform = item.rotation ? `translate(${x}px, ${y}px) rotate(${item.rotation}rad)` : `translate(${x}px, ${y}px)`;
    }
    if (z !== slot.z) {
      slot.z = z;
      ws.zIndex = String(z);
    }
    const radius = maskRadius(item);
    const look = `${radius}|${item.grayscale}|${item.flipX}|${item.flipY}`;
    if (look !== slot.look) {
      slot.look = look;
      ws.borderRadius = radius;
      const is = slot.img.style;
      is.filter = item.grayscale ? "grayscale(1)" : "";
      is.transform = item.flipX || item.flipY ? `scale(${item.flipX ? -1 : 1}, ${item.flipY ? -1 : 1})` : "";
    }
    // The crop is in source space; the picture is mirrored by a flip, so the window is mapped to what is displayed.
    const c = item.crop && item.crop.w > 0 && item.crop.h > 0 ? toDisplayCrop(item.crop, item.flipX, item.flipY) : null;
    const fit = c ? `${w}|${h}|${c.x}|${c.y}|${c.w}|${c.h}` : "cover";
    if (fit !== slot.fit) {
      slot.fit = fit;
      const is = slot.img.style;
      if (c) {
        is.width = `${w / c.w}px`;
        is.height = `${h / c.h}px`;
        is.left = `${(-c.x / c.w) * w}px`;
        is.top = `${(-c.y / c.h) * h}px`;
        is.objectFit = "";
      } else {
        is.width = "100%";
        is.height = "100%";
        is.left = "0";
        is.top = "0";
        is.objectFit = "cover";
      }
    }
  }

  private writeDim(slot: Slot, item: ImageLayerItem | undefined): void {
    if (!item) return;
    const dim = this.dimmed !== null && !this.dimmed.has(item.id);
    if (dim === slot.dimmed && slot.wrapper.style.opacity === this.opacityOf(item, dim)) return;
    slot.dimmed = dim;
    slot.wrapper.style.opacity = this.opacityOf(item, dim);
    slot.img.setAttribute("data-dimmed", dim ? "true" : "false");
  }

  private opacityOf(item: ImageLayerItem, dim: boolean): string {
    const o = (Number.isFinite(item.opacity) ? item.opacity : 1) * (dim ? DIM_OPACITY : 1);
    return o < 1 ? String(Math.round(o * 1e6) / 1e6) : "";
  }

  private writeSource(slot: Slot, item: ImageLayerItem, tier: ChosenVariant, aw: number, ah: number, originalLongest: number): void {
    const url = this.resolver.url(item.assetId, tier);
    if (url === slot.src) return;
    slot.src = url;
    if (url) {
      slot.img.src = url;
      slot.variant = tier;
      slot.img.setAttribute("data-variant", tier);
      const aspect = aw > 0 && ah > 0 ? aw / ah : item.rect.h > 0 ? item.rect.w / item.rect.h : 1;
      const d = this.decodedSize(tier, aspect, originalLongest);
      slot.decW = d.w;
      slot.decH = d.h;
      slot.wrapper.style.backgroundColor = "";
      slot.wrapper.removeAttribute("data-placeholder");
    } else {
      slot.img.removeAttribute("src");
      slot.img.removeAttribute("data-variant");
      slot.variant = null;
      slot.decW = 0;
      slot.decH = 0;
      slot.wrapper.style.backgroundColor = "var(--color-border)";
      slot.wrapper.setAttribute("data-placeholder", "");
    }
  }

  private writeCaption(slot: Slot, item: ImageLayerItem, zoom: number): void {
    const text = item.caption ?? "";
    if (!text) {
      if (slot.caption) {
        slot.caption.remove();
        slot.caption = null;
        slot.captionText = "";
        slot.captionShown = true;
        slot.captionSize = NaN;
      }
      return;
    }
    if (!slot.caption) {
      const span = slot.wrapper.ownerDocument.createElement("span");
      const s = span.style;
      s.position = "absolute";
      s.left = "0";
      s.right = "0";
      s.bottom = "0";
      s.padding = "0.2em 0.5em";
      s.whiteSpace = "nowrap";
      s.overflow = "hidden";
      s.textOverflow = "ellipsis";
      s.pointerEvents = "none";
      s.color = "var(--color-bg)";
      s.background = "color-mix(in srgb, var(--color-ink) 70%, transparent)";
      slot.wrapper.appendChild(span);
      slot.caption = span;
    }
    if (text !== slot.captionText) {
      slot.captionText = text;
      slot.caption.textContent = text;
    }
    const size = CAPTION_FONT_PX / zoom;
    if (size !== slot.captionSize) {
      slot.captionSize = size;
      slot.caption.style.fontSize = `${size}px`;
    }
    const shown = item.rect.w * zoom >= CAPTION_MIN_PX;
    if (shown !== slot.captionShown) {
      slot.captionShown = shown;
      slot.caption.style.display = shown ? "" : "none";
    }
  }

  private release(id: string, slot: Slot): void {
    this.slots.delete(id);
    this.itemOf.delete(id);
    slot.img.removeAttribute("src");
    slot.img.removeAttribute("data-variant");
    slot.img.removeAttribute("data-dimmed");
    slot.wrapper.remove();
    slot.wrapper.removeAttribute("data-object-id");
    slot.caption?.remove();
    slot.mounted = false;
    // Whatever style the next owner needs is written again.
    slot.caption = null;
    slot.captionText = "";
    slot.captionShown = true;
    slot.captionSize = NaN;
    slot.src = undefined;
    slot.variant = null;
    slot.decW = 0;
    slot.decH = 0;
    slot.box = "";
    slot.look = "";
    slot.fit = "";
    slot.z = NaN;
    slot.dimmed = null;
    slot.wrapper.style.backgroundColor = "";
      slot.wrapper.removeAttribute("data-placeholder");
    if (this.pool.length < POOL_MAX) this.pool.push(slot);
  }

  stats(): ImageLayerStats {
    const variantCounts: Record<ChosenVariant, number> = { w256: 0, w1024: 0, w2048: 0, original: 0 };
    let bytes = 0;
    for (const s of this.slots.values()) {
      if (s.variant) {
        variantCounts[s.variant]++;
        bytes += decodedBytes(s.decW, s.decH);
      }
    }
    return { mounted: this.slots.size, residentBytes: bytes, variantCounts };
  }

  destroy(): void {
    for (const [id, slot] of [...this.slots]) this.release(id, slot);
    this.pool = [];
    this.gesture = false;
    this.container = null;
  }
}
