"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AssetResolver } from "@/lib/assets/resolver-types";
import type { BoardDoc } from "@/lib/engine/doc/board-doc";
import { fitRect, type Camera } from "@/lib/engine/geometry/camera";
import { boundsOf, unionRects } from "@/lib/engine/geometry/rect";
import { CameraStore, easeInOut, interpolateCamera } from "@/lib/engine/input/camera-store";
import { SpatialIndex } from "@/lib/engine/spatial/spatial-index";
import { ObjectLayer, type ObjectLayerView } from "./ObjectLayer";

/** What the rest of the editor (chrome, commands, tools) may do with the canvas. */
export interface CanvasHandle {
  getCamera(): Camera;
  /** Set the camera. `animate` eases over about 350 ms (instant under prefers-reduced-motion); any input cancels it. */
  setCamera(c: Camera, opts?: { animate?: boolean }): void;
  /** Size of the canvas element in CSS px. */
  viewport(): { w: number; h: number };
  container(): HTMLElement;
  /** Called on every camera change, including each frame of an animation. Returns the unsubscribe function. */
  subscribeCamera(cb: (c: Camera) => void): () => void;
  /** Stop a running camera animation, leaving the camera where it is. */
  cancelCameraAnimation(): void;
  readonly doc: BoardDoc;
  readonly index: SpatialIndex;
}

export type CanvasViewProps = {
  doc: BoardDoc;
  assets: AssetResolver;
  /** Share an index with other consumers; otherwise the view builds its own. */
  index?: SpatialIndex;
  /** Camera for the first frame. Default: fit all objects (at most 100 %), or the origin centred when empty. */
  initialCamera?: Camera;
  /** Overlays and chrome drawn in screen space above the objects. */
  children?: ReactNode;
};

const SETTLE_MS = 100;
const SETTLE_MAX_WAIT_MS = 300;
const ANIMATION_MS = 350;

function prefersReducedMotion(): boolean {
  try {
    return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * The infinite canvas: one camera-transformed layer (its transform is written straight to the element, never through
 * React state) holding the objects that intersect the viewport. Culling and level of detail are recomputed 100 ms
 * after the camera stops changing (at most every 300 ms during a long gesture).
 */
export const CanvasView = forwardRef<CanvasHandle, CanvasViewProps>(function CanvasView(
  { doc, assets, index: sharedIndex, initialCamera, children },
  handleRef,
) {
  const rootRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const [store] = useState(() => new CameraStore(initialCamera));
  const [ownIndex] = useState(() => (sharedIndex ? null : new SpatialIndex(doc)));
  const index = sharedIndex ?? ownIndex!;
  const [dpr] = useState(() => (typeof window === "undefined" ? 1 : window.devicePixelRatio || 1));
  const [view, setView] = useState<ObjectLayerView>(() => ({ camera: store.get(), viewport: { w: 0, h: 0 } }));

  const viewportRef = useRef({ w: 0, h: 0 });
  const positioned = useRef(initialCamera !== undefined);
  const animation = useRef<(() => void) | null>(null);
  const settle = useRef<{ timer: ReturnType<typeof setTimeout> | null; since: number }>({ timer: null, since: 0 });

  const cancelCameraAnimation = useCallback(() => {
    animation.current?.();
    animation.current = null;
  }, []);

  const flushView = useCallback(() => {
    const s = settle.current;
    if (s.timer) clearTimeout(s.timer);
    s.timer = null;
    s.since = 0;
    setView({ camera: store.get(), viewport: { ...viewportRef.current } });
  }, [store]);

  const scheduleView = useCallback(() => {
    const s = settle.current;
    const now = Date.now();
    if (s.since === 0) s.since = now;
    if (s.timer) clearTimeout(s.timer);
    const wait = Math.max(0, Math.min(SETTLE_MS, s.since + SETTLE_MAX_WAIT_MS - now));
    s.timer = setTimeout(flushView, wait);
  }, [flushView]);

  const applyCamera = useCallback((c: Camera) => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.style.transform = `translate(${-c.x * c.z}px, ${-c.y * c.z}px) scale(${c.z})`;
    layer.style.setProperty("--zoom", String(c.z));
    layer.style.setProperty("--inv-zoom", String(1 / c.z));
  }, []);

  useLayoutEffect(() => {
    applyCamera(store.get());
    return store.subscribe((c) => {
      applyCamera(c);
      scheduleView();
    });
  }, [store, applyCamera, scheduleView]);

  // Measure the canvas; place the first camera once the size is known.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const r = root.getBoundingClientRect();
      viewportRef.current = { w: r.width, h: r.height };
      if (!positioned.current && r.width > 0 && r.height > 0) {
        positioned.current = true;
        const box = unionRects(doc.all().map(boundsOf));
        store.set(box ? fitRect(box, viewportRef.current, 64, 1) : { x: -r.width / 2, y: -r.height / 2, z: 1 });
      }
      flushView();
    });
    ro.observe(root);
    return () => ro.disconnect();
  }, [doc, store, flushView]);

  useEffect(
    () => () => {
      if (settle.current.timer) clearTimeout(settle.current.timer);
      animation.current?.();
    },
    [],
  );
  useEffect(() => () => ownIndex?.destroy(), [ownIndex]);

  useImperativeHandle(
    handleRef,
    () => ({
      getCamera: () => store.get(),
      setCamera(c, opts) {
        positioned.current = true;
        cancelCameraAnimation();
        if (!opts?.animate || prefersReducedMotion()) {
          store.set(c);
          return;
        }
        const from = store.get();
        const start = performance.now();
        let raf = 0;
        const tick = (now: number) => {
          const t = (now - start) / ANIMATION_MS;
          store.set(interpolateCamera(from, c, viewportRef.current, easeInOut(t)));
          if (t < 1) raf = requestAnimationFrame(tick);
          else animation.current = null;
        };
        raf = requestAnimationFrame(tick);
        animation.current = () => cancelAnimationFrame(raf);
      },
      viewport: () => ({ ...viewportRef.current }),
      container: () => rootRef.current!,
      subscribeCamera: (cb) => store.subscribe(cb),
      cancelCameraAnimation,
      doc,
      index,
    }),
    [store, doc, index, cancelCameraAnimation],
  );

  return (
    <div
      ref={rootRef}
      data-canvas-root=""
      role="application"
      aria-label="Board canvas"
      tabIndex={0}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: "var(--color-bg)",
        touchAction: "none",
        userSelect: "none",
        outlineOffset: -2,
      }}
    >
      <ObjectLayer ref={layerRef} doc={doc} index={index} assets={assets} view={view} dpr={dpr} />
      {children}
    </div>
  );
});
