// The seam between the canvas and whatever draws images: DomImageLayer today, a WebGL layer if the benchmark needs one.
import type { Camera } from "@/lib/engine/geometry/camera";
import type { ImageObj, Rect } from "@/lib/engine/model/types";
import type { ChosenVariant } from "./variant";

export interface ImageLayerItem {
  id: string;
  assetId: string;
  /** Absolute canvas coordinates. */
  rect: Rect;
  rotation: number;
  crop: Rect | null;
  mask: ImageObj["mask"];
  flipX: boolean;
  flipY: boolean;
  grayscale: boolean;
  opacity: number;
  /** `ImageObj.index`: z-order among siblings. */
  zIndexKey: string;
  /** Credits overlay text (Task 16); null = none. */
  caption: string | null;
  /**
   * Stacking base from the host, so images interleave with the other objects (see z-order.ts). When absent the layer
   * derives it from `zIndexKey` alone.
   */
  z?: number;
}

export interface ImageLayerStats {
  mounted: number;
  /** Decoded bytes of the bitmaps currently shown. */
  residentBytes: number;
  variantCounts: Record<ChosenVariant, number>;
}

export interface ImageLayerView {
  camera: Camera;
  viewport: { w: number; h: number };
  dpr: number;
}

export interface ImageLayer {
  mount(container: HTMLElement): void;
  /** Transform only; no per-object work. */
  setCamera(c: Camera): void;
  /** True while panning, zooming or pinching: no src changes and no mounts. */
  setGesture(active: boolean): void;
  /** Visible items only (viewport plus the culling margin). Items no longer passed are released. */
  update(items: ImageLayerItem[], view: ImageLayerView): void;
  /** Palette highlight: ids not listed are drawn at 25 % opacity. `null` restores. */
  setDimmed(ids: ReadonlySet<string> | null): void;
  stats(): ImageLayerStats;
  destroy(): void;
}
