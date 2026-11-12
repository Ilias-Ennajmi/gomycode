// WebGL implementation of the ImageLayer (PixiJS 8, loaded only when needed). One canvas for every image: the browser
// has one element to composite however many images there are, which is what the 1,000-image gate needs.
import type { Application, Container, Sprite, Texture } from "pixi.js";
import type { AssetResolver } from "@/lib/assets/resolver-types";
import type { Camera } from "@/lib/engine/geometry/camera";
import { maskRadii, toDisplayCrop } from "@/lib/engine/model/image-style";
import type { DomImageLayerDeps } from "./dom-image-layer";
import type { FailableImageLayer } from "./image-layer-factory";
import type { ImageLayerItem, ImageLayerStats, ImageLayerView } from "./image-layer";
import { ImageResidency, decodedBytes, defaultBudgetBytes, type ResidencyEntry } from "./residency";
import { TextureCache } from "./texture-cache";
import type { ChosenVariant } from "./variant";
import { decodedSize, selectVariant } from "./variant-select";
import { nodeZ } from "./z-order";

type Pixi = typeof import("pixi.js");

const DIM_ALPHA = 0.25;
const CAPTION_MIN_PX = 120;
const CAPTION_FONT_PX = 11;
/** A lost context that has not come back after this long is given up on (the DOM layer takes over). */
const RESTORE_WAIT_MS = 3000;
/** Mipmaps add a third. */
const MIPMAP_FACTOR = 4 / 3;

type Slot = {
  id: string;
  node: Container;
  sprite: Sprite;
  mask: import("pixi.js").Graphics | null;
  lastSeen: number;
  /** The texture key being shown, and the tier it came from (null: placeholder). */
  shownKey: string | null;
  variant: ChosenVariant | null;
  decW: number;
  decH: number;
  wantKey: string | null;
  item: ImageLayerItem;
  maskKey: string;
  grey: boolean;
  caption: HTMLElement | null;
};

function cssColor(name: string, fallback: number): number {
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const m = /^#([0-9a-f]{6})$/i.exec(raw);
    return m ? parseInt(m[1], 16) : fallback;
  } catch {
    return fallback;
  }
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

export class WebGLImageLayer implements FailableImageLayer {
  private readonly resolver: AssetResolver;
  private readonly residency: ImageResidency;
  private readonly now: () => number;
  private readonly cache: TextureCache<Texture>;
  private readonly slots = new Map<string, Slot>();
  private readonly loading = new Set<string>();
  private readonly failed = new Set<string>();
  private readonly bitmaps = new Map<string, ImageBitmap>();
  private host: HTMLElement | null = null;
  private captionHost: HTMLElement | null = null;
  private pixi: Pixi | null = null;
  private app: Application | null = null;
  private starting: Promise<void> | null = null;
  private destroyed = false;
  private gesture = false;
  private dimmed: ReadonlySet<string> | null = null;
  private camera: Camera = { x: 0, y: 0, z: 1 };
  private view: ImageLayerView | null = null;
  private items: ImageLayerItem[] = [];
  private raf = 0;
  private failure: (() => void) | null = null;
  private failedOver = false;
  private restoreTimer: ReturnType<typeof setTimeout> | undefined;
  private greyFilter: import("pixi.js").ColorMatrixFilter | null = null;
  private placeholderTint = 0xe0dcd3;

  constructor(deps: DomImageLayerDeps) {
    this.resolver = deps.resolver;
    this.residency = deps.residency ?? new ImageResidency({ budgetBytes: browserBudget() });
    this.now = deps.now ?? (() => (typeof performance !== "undefined" ? performance.now() : Date.now()));
    this.cache = new TextureCache<Texture>(browserBudget(), (key, tex) => {
      tex.destroy(true);
      this.bitmaps.get(key)?.close();
      this.bitmaps.delete(key);
    });
  }

  onFailure(cb: () => void): void {
    this.failure = cb;
    if (this.failedOver) cb();
  }

  private fail(): void {
    if (this.failedOver) return;
    this.failedOver = true;
    this.failure?.();
  }

  mount(container: HTMLElement): void {
    this.host = container;
    this.destroyed = false;
    this.starting ??= this.start().catch(() => this.fail());
  }

  private async start(): Promise<void> {
    const host = this.host;
    if (!host) return;
    const pixi = await import("pixi.js");
    if (this.destroyed || this.host !== host) return;
    this.pixi = pixi;
    const app = new pixi.Application();
    const vp = this.view?.viewport ?? { w: Math.max(host.ownerDocument.defaultView?.innerWidth ?? 1, 1), h: Math.max(host.ownerDocument.defaultView?.innerHeight ?? 1, 1) };
    await app.init({
      width: Math.max(1, Math.round(vp.w)),
      height: Math.max(1, Math.round(vp.h)),
      backgroundAlpha: 0,
      antialias: false,
      autoStart: false,
      autoDensity: true,
      resolution: this.view?.dpr ?? host.ownerDocument.defaultView?.devicePixelRatio ?? 1,
      preference: "webgl",
      powerPreference: "high-performance",
    });
    if (this.destroyed) {
      app.destroy(true, { children: true });
      return;
    }
    app.ticker.stop();
    this.app = app;
    const canvas = app.canvas as HTMLCanvasElement;
    canvas.setAttribute("data-image-canvas", "");
    canvas.style.position = "absolute";
    canvas.style.left = "0";
    canvas.style.top = "0";
    canvas.style.transformOrigin = "0 0";
    canvas.style.pointerEvents = "none";
    canvas.addEventListener("webglcontextlost", this.onLost);
    canvas.addEventListener("webglcontextrestored", this.onRestored);
    host.appendChild(canvas);
    const captions = host.ownerDocument.createElement("div");
    captions.setAttribute("data-image-captions", "");
    captions.style.position = "absolute";
    captions.style.left = "0";
    captions.style.top = "0";
    host.appendChild(captions);
    this.captionHost = captions;
    this.placeholderTint = cssColor("--color-border", 0xe0dcd3);
    this.greyFilter = new pixi.ColorMatrixFilter();
    this.greyFilter.desaturate();
    this.writeCamera();
    if (this.view) this.update(this.items, this.view);
  }

  private readonly onLost = (e: Event): void => {
    e.preventDefault(); // lets the browser restore the context
    clearTimeout(this.restoreTimer);
    this.restoreTimer = setTimeout(() => this.fail(), RESTORE_WAIT_MS);
  };

  private readonly onRestored = (): void => {
    clearTimeout(this.restoreTimer);
    // Every texture is gone with the context: forget them and ask for what is on screen again.
    this.cache.clear();
    for (const s of this.slots.values()) {
      s.shownKey = null;
      s.variant = null;
      s.wantKey = null;
    }
    this.loading.clear();
    if (this.view) this.update(this.items, this.view);
  };

  setCamera(c: Camera): void {
    this.camera = c;
    this.writeCamera();
  }

  private writeCamera(): void {
    const app = this.app;
    if (!app) return;
    const c = this.camera;
    app.stage.position.set(-c.x * c.z, -c.y * c.z);
    app.stage.scale.set(c.z);
    // The canvas sits inside the camera layer (which scales by z): undo that so it covers the screen 1:1.
    const canvas = app.canvas as HTMLCanvasElement;
    canvas.style.transform = `translate(${c.x}px, ${c.y}px) scale(${1 / c.z})`;
    this.requestRender();
  }

  private requestRender(): void {
    if (this.raf || !this.app || this.destroyed) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      try {
        this.app?.render();
      } catch {
        this.fail();
      }
    });
  }

  setGesture(active: boolean): void {
    this.gesture = active;
  }

  setDimmed(ids: ReadonlySet<string> | null): void {
    this.dimmed = ids;
    for (const s of this.slots.values()) this.writeLook(s);
    this.requestRender();
  }

  update(items: ImageLayerItem[], view: ImageLayerView): void {
    this.items = items;
    this.view = view;
    this.camera = view.camera;
    const app = this.app;
    const pixi = this.pixi;
    if (!app || !pixi || this.destroyed) return;
    const settled = !this.gesture;
    const now = this.now();
    const vp = view.viewport;
    if (vp.w > 0 && vp.h > 0 && (app.renderer.width !== Math.round(vp.w) || app.renderer.height !== Math.round(vp.h))) app.renderer.resize(Math.round(vp.w), Math.round(vp.h));
    this.writeCamera();
    const z = this.stacking(items);

    const entries: ResidencyEntry[] = [];
    const picked = new Map<string, { slot: Slot; apply: boolean; aw: number; ah: number; originalLongest: number }>();
    const seen = new Set<string>();
    const wanted = new Set<string>();
    for (const item of items) {
      let slot = this.slots.get(item.id);
      const isNew = !slot;
      if (!slot) {
        slot = this.makeSlot(pixi, item);
        this.slots.set(item.id, slot);
        app.stage.addChild(slot.node);
      }
      seen.add(item.id);
      slot.item = item;
      const left = (item.rect.x - view.camera.x) * view.camera.z;
      const top = (item.rect.y - view.camera.y) * view.camera.z;
      const visible = left < vp.w && top < vp.h && left + item.rect.w * view.camera.z > 0 && top + item.rect.h * view.camera.z > 0;
      if (visible || isNew) slot.lastSeen = now;
      slot.node.zIndex = z.get(item.id) ?? 0;
      this.writeLook(slot);
      const apply = settled || isNew;
      const sel = selectVariant(this.resolver, item, view, slot.variant, apply);
      picked.set(item.id, { slot, apply, aw: sel.aw, ah: sel.ah, originalLongest: sel.originalLongest });
      entries.push({ id: item.id, wanted: sel.wanted, w: sel.w, h: sel.h, visible, lastSeen: slot.lastSeen, tiers: sel.tiers });
    }
    for (const [id, slot] of this.slots) if (!seen.has(id)) this.release(id, slot);

    const plan = this.residency.plan(entries);
    for (const e of entries) {
      const p = picked.get(e.id)!;
      const tier = plan.get(e.id) ?? e.wanted;
      if (p.apply) {
        const url = this.resolver.url(p.slot.item.assetId, tier);
        p.slot.wantKey = url;
        if (url) {
          wanted.add(url);
          this.ensure(url, tier, p.slot, p.aw, p.ah, p.originalLongest);
        } else {
          this.showPlaceholder(p.slot);
        }
      } else if (p.slot.shownKey) wanted.add(p.slot.shownKey);
      this.layoutSlot(p.slot);
      if (settled) this.writeCaption(p.slot, view.camera.z);
    }
    app.stage.sortableChildren = true;
    // One canvas for all images, stacked where the lowest image would be: objects below it are an underlay, everything
    // above it (an object between two images included) is drawn over every image.
    let lowest = Infinity;
    for (const i of items) lowest = Math.min(lowest, i.z ?? nodeZ(i.zIndexKey));
    const zs = Number.isFinite(lowest) ? String(lowest) : "";
    const canvas = app.canvas as HTMLCanvasElement;
    if (canvas.style.zIndex !== zs) canvas.style.zIndex = zs;
    if (this.captionHost && this.captionHost.style.zIndex !== zs) this.captionHost.style.zIndex = zs;
    this.cache.markInUse(wanted);
    this.cache.evict();
    this.requestRender();
  }

  private stacking(items: ImageLayerItem[]): Map<string, number> {
    const base = (i: ImageLayerItem) => i.z ?? nodeZ(i.zIndexKey);
    const sorted = items.length > 1 ? [...items].sort((a, b) => base(a) - base(b) || (a.zIndexKey < b.zIndexKey ? -1 : a.zIndexKey > b.zIndexKey ? 1 : a.id < b.id ? -1 : 1)) : items;
    const out = new Map<string, number>();
    let rank = 0;
    for (const i of sorted) out.set(i.id, rank++);
    return out;
  }

  private makeSlot(pixi: Pixi, item: ImageLayerItem): Slot {
    const node = new pixi.Container();
    const sprite = new pixi.Sprite(pixi.Texture.WHITE);
    sprite.anchor.set(0.5);
    sprite.tint = this.placeholderTint;
    node.addChild(sprite);
    return { id: item.id, node, sprite, mask: null, lastSeen: this.now(), shownKey: null, variant: null, decW: 0, decH: 0, wantKey: null, item, maskKey: "", grey: false, caption: null };
  }

  private release(id: string, slot: Slot): void {
    this.slots.delete(id);
    slot.node.destroy({ children: true });
    slot.caption?.remove();
  }

  private showPlaceholder(slot: Slot): void {
    const pixi = this.pixi;
    if (!pixi || (slot.shownKey === null && slot.variant === null)) return;
    slot.sprite.texture = pixi.Texture.WHITE;
    slot.sprite.tint = this.placeholderTint;
    slot.shownKey = null;
    slot.variant = null;
    slot.decW = 0;
    slot.decH = 0;
  }

  /** Show `url` for the slot, loading it first when it is not a texture yet (the old picture stays until then). */
  private ensure(url: string, tier: ChosenVariant, slot: Slot, aw: number, ah: number, originalLongest: number): void {
    if (slot.shownKey === url) return;
    const have = this.cache.get(url);
    if (have) {
      this.apply(slot, url, have, tier, aw, ah, originalLongest);
      return;
    }
    if (this.failed.has(url) || this.loading.has(url)) {
      if (this.loading.has(url)) this.pendingFor(url, slot, tier, aw, ah, originalLongest);
      return;
    }
    this.loading.add(url);
    this.pendingFor(url, slot, tier, aw, ah, originalLongest);
    void this.load(url);
  }

  private readonly waiting = new Map<string, Array<{ slotId: string; tier: ChosenVariant; aw: number; ah: number; originalLongest: number }>>();

  private pendingFor(url: string, slot: Slot, tier: ChosenVariant, aw: number, ah: number, originalLongest: number): void {
    const list = this.waiting.get(url) ?? [];
    if (!list.some((w) => w.slotId === slot.id)) list.push({ slotId: slot.id, tier, aw, ah, originalLongest });
    this.waiting.set(url, list);
  }

  private async load(url: string): Promise<void> {
    const pixi = this.pixi;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("bad status");
      const bitmap = await createImageBitmap(await res.blob());
      if (this.destroyed || !pixi) {
        bitmap.close();
        return;
      }
      const source = new pixi.ImageSource({ resource: bitmap, autoGenerateMipmaps: true, scaleMode: "linear" });
      const texture = new pixi.Texture({ source });
      this.bitmaps.set(url, bitmap);
      this.cache.set(url, texture, decodedBytes(bitmap.width, bitmap.height) * MIPMAP_FACTOR);
      this.loading.delete(url);
      for (const w of this.waiting.get(url) ?? []) {
        const slot = this.slots.get(w.slotId);
        if (slot && slot.wantKey === url) this.apply(slot, url, texture, w.tier, w.aw, w.ah, w.originalLongest);
      }
      this.waiting.delete(url);
      this.cache.markInUse(new Set([...this.slots.values()].map((s) => s.shownKey).filter((k): k is string => !!k)));
      this.cache.evict();
      this.requestRender();
    } catch {
      this.loading.delete(url);
      this.failed.add(url);
      this.waiting.delete(url);
    }
  }

  private apply(slot: Slot, url: string, texture: Texture, tier: ChosenVariant, aw: number, ah: number, originalLongest: number): void {
    const pixi = this.pixi;
    if (!pixi) return;
    slot.shownKey = url;
    slot.variant = tier;
    const aspect = aw > 0 && ah > 0 ? aw / ah : slot.item.rect.h > 0 ? slot.item.rect.w / slot.item.rect.h : 1;
    const d = decodedSize(tier, aspect, originalLongest);
    slot.decW = d.w;
    slot.decH = d.h;
    const crop = slot.item.crop && slot.item.crop.w > 0 && slot.item.crop.h > 0 ? slot.item.crop : null;
    if (crop) {
      const c = toDisplayCrop(crop, slot.item.flipX, slot.item.flipY);
      const tw = texture.source.width;
      const th = texture.source.height;
      slot.sprite.texture = new pixi.Texture({ source: texture.source, frame: new pixi.Rectangle(c.x * tw, c.y * th, c.w * tw, c.h * th) });
    } else {
      slot.sprite.texture = texture;
    }
    slot.sprite.tint = 0xffffff;
    this.layoutSlot(slot);
    this.requestRender();
  }

  /** Position, size, rotation, flip, mask. Cheap; runs for every item on every update. */
  private layoutSlot(slot: Slot): void {
    const { rect, rotation, flipX, flipY, mask } = slot.item;
    const node = slot.node;
    node.position.set(rect.x + rect.w / 2, rect.y + rect.h / 2);
    node.rotation = rotation;
    const sprite = slot.sprite;
    const tw = sprite.texture.width || 1;
    const th = sprite.texture.height || 1;
    sprite.scale.set((rect.w / tw) * (flipX ? -1 : 1), (rect.h / th) * (flipY ? -1 : 1));
    const key = `${mask.kind}|${mask.radius}|${rect.w}|${rect.h}`;
    if (key !== slot.maskKey) {
      slot.maskKey = key;
      const { rx, ry } = maskRadii({ w: rect.w, h: rect.h, mask });
      if (this.pixi && (rx > 0 || ry > 0)) {
        const g = slot.mask ?? new this.pixi.Graphics();
        g.clear();
        if (mask.kind === "circle") g.ellipse(0, 0, rect.w / 2, rect.h / 2).fill(0xffffff);
        else g.roundRect(-rect.w / 2, -rect.h / 2, rect.w, rect.h, rx).fill(0xffffff);
        if (!slot.mask) {
          slot.mask = g;
          node.addChild(g);
          node.mask = g;
        }
      } else if (slot.mask) {
        node.mask = null;
        slot.mask.destroy();
        slot.mask = null;
      }
    }
  }

  private writeLook(slot: Slot): void {
    const item = slot.item;
    const dim = this.dimmed !== null && !this.dimmed.has(item.id);
    slot.node.alpha = (Number.isFinite(item.opacity) ? item.opacity : 1) * (dim ? DIM_ALPHA : 1);
    if (item.grayscale !== slot.grey && this.greyFilter) {
      slot.grey = item.grayscale;
      slot.sprite.filters = item.grayscale ? [this.greyFilter] : null;
    }
  }

  private writeCaption(slot: Slot, zoom: number): void {
    const host = this.captionHost;
    const item = slot.item;
    if (!host) return;
    const text = item.caption ?? "";
    if (!text) {
      slot.caption?.remove();
      slot.caption = null;
      return;
    }
    if (!slot.caption) {
      const doc = host.ownerDocument;
      const box = doc.createElement("div");
      box.style.position = "absolute";
      box.style.pointerEvents = "none";
      box.style.overflow = "hidden";
      const span = doc.createElement("span");
      span.style.position = "absolute";
      span.style.left = "0";
      span.style.right = "0";
      span.style.bottom = "0";
      span.style.padding = "0.2em 0.5em";
      span.style.whiteSpace = "nowrap";
      span.style.overflow = "hidden";
      span.style.textOverflow = "ellipsis";
      span.style.color = "var(--color-bg)";
      span.style.background = "color-mix(in srgb, var(--color-ink) 70%, transparent)";
      box.appendChild(span);
      host.appendChild(box);
      slot.caption = box;
    }
    const box = slot.caption;
    const r = item.rect;
    box.style.left = `${r.x}px`;
    box.style.top = `${r.y}px`;
    box.style.width = `${r.w}px`;
    box.style.height = `${r.h}px`;
    box.style.display = r.w * zoom >= CAPTION_MIN_PX ? "" : "none";
    const span = box.firstElementChild as HTMLElement;
    if (span.textContent !== text) span.textContent = text;
    span.style.fontSize = `${CAPTION_FONT_PX / zoom}px`;
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
    this.destroyed = true;
    clearTimeout(this.restoreTimer);
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    for (const [id, slot] of [...this.slots]) this.release(id, slot);
    this.cache.clear();
    this.waiting.clear();
    this.loading.clear();
    const app = this.app;
    if (app) {
      const canvas = app.canvas as HTMLCanvasElement;
      canvas.removeEventListener("webglcontextlost", this.onLost);
      canvas.removeEventListener("webglcontextrestored", this.onRestored);
      app.destroy(true, { children: true });
    }
    this.captionHost?.remove();
    this.captionHost = null;
    this.app = null;
    this.starting = null;
    this.gesture = false;
    this.host = null;
  }
}
