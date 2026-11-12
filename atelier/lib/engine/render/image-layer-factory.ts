// Picks the ImageLayer: WebGL when asked for and available, the DOM layer otherwise, and the DOM layer again if WebGL
// dies on the way (a context that is lost and not restored).
import type { Camera } from "@/lib/engine/geometry/camera";
import { DomImageLayer, type DomImageLayerDeps } from "./dom-image-layer";
import type { ImageLayer, ImageLayerItem, ImageLayerStats, ImageLayerView } from "./image-layer";

/** An ImageLayer that can say it has become unusable (could not start, or lost its GPU context for good). */
export interface FailableImageLayer extends ImageLayer {
  onFailure(cb: () => void): void;
}

export interface ImageLayerFactoryOptions {
  preferWebGL: boolean;
  webglSupported: boolean;
  deps: DomImageLayerDeps;
  /** Makes the WebGL layer (the real one is in webgl-image-layer.ts, loaded only when needed). */
  createWebGL?: (deps: DomImageLayerDeps) => FailableImageLayer;
}

/** Can this browser make a WebGL context? `makeCanvas` is for tests. */
export function detectWebGL(makeCanvas: () => HTMLCanvasElement = () => document.createElement("canvas")): boolean {
  try {
    const c = makeCanvas();
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

/** Forwards to one layer and swaps it for the DOM layer, once, when told the first one failed. */
class SwitchingImageLayer implements ImageLayer {
  private current: ImageLayer;
  private switched = false;
  private container: HTMLElement | null = null;
  private camera: Camera | null = null;
  private gesture = false;
  private dimmed: ReadonlySet<string> | null = null;
  private last: { items: ImageLayerItem[]; view: ImageLayerView } | null = null;

  constructor(
    primary: FailableImageLayer,
    private readonly makeFallback: () => ImageLayer,
  ) {
    this.current = primary;
    primary.onFailure(() => this.fallBack());
  }

  private fallBack(): void {
    if (this.switched) return;
    this.switched = true;
    this.current.destroy();
    this.current = this.makeFallback();
    if (this.container) this.current.mount(this.container);
    if (this.camera) this.current.setCamera(this.camera);
    this.current.setGesture(this.gesture);
    this.current.setDimmed(this.dimmed);
    if (this.last) this.current.update(this.last.items, this.last.view);
  }

  mount(container: HTMLElement): void {
    this.container = container;
    this.current.mount(container);
  }
  setCamera(c: Camera): void {
    this.camera = c;
    this.current.setCamera(c);
  }
  setGesture(active: boolean): void {
    this.gesture = active;
    this.current.setGesture(active);
  }
  update(items: ImageLayerItem[], view: ImageLayerView): void {
    this.last = { items, view };
    this.current.update(items, view);
  }
  setDimmed(ids: ReadonlySet<string> | null): void {
    this.dimmed = ids;
    this.current.setDimmed(ids);
  }
  stats(): ImageLayerStats {
    return this.current.stats();
  }
  destroy(): void {
    this.current.destroy();
    this.container = null;
    this.last = null;
  }
}

export function createImageLayer(opts: ImageLayerFactoryOptions): ImageLayer {
  const dom = () => new DomImageLayer(opts.deps);
  if (!opts.preferWebGL || !opts.webglSupported || !opts.createWebGL) return dom();
  let primary: FailableImageLayer;
  try {
    primary = opts.createWebGL(opts.deps);
  } catch {
    return dom();
  }
  return new SwitchingImageLayer(primary, dom);
}
