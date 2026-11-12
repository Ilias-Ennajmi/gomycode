"use client";

import { Minus, Plus, Maximize2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { useGestures, type PointLike } from "./use-gestures";

/*
 * A picture-sized surface that fits its content (contentW : contentH) into the space it is given, and lets a visitor pinch,
 * wheel or button-zoom into it and drag it around. At fit size one finger swipes (to the next slide); zoomed in one finger
 * pans. The fit itself is CSS only (container query units), so the first paint on the server is already laid out; the
 * zoom is a transform on the box, which a child can read (`z`, and the box's width in px) to load sharper pictures.
 */

export interface ZoomState {
  z: number;
  /** The box's laid-out width in CSS px at zoom 1 (0 before it has been measured). */
  boxPx: number;
  /** A finger or button is moving the view. */
  moving: boolean;
}

export const MAX_ZOOM = 8;
const STEP = 1.5;

interface Props {
  contentW: number;
  contentH: number;
  children: (s: ZoomState) => ReactNode;
  /** Drawn outside the zoomed box (e.g. the box's own controls are added here). */
  label: string;
  maxZoom?: number;
  onSwipe?: (dir: "next" | "prev") => void;
  /** u, v in 0..1 across the content; `target` is where the press began. */
  onTap?: (hit: { u: number; v: number; target: EventTarget | null }) => void;
  onZoomChange?: (z: number) => void;
  className?: string;
  style?: CSSProperties;
  /** Arrow keys pan while zoomed in (and are swallowed); when false they bubble up. */
  keyboard?: boolean;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export function ZoomPane({ contentW, contentH, children, label, maxZoom = MAX_ZOOM, onSwipe, onTap, onZoomChange, className, style, keyboard = true }: Props) {
  const pane = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ z: 1, x: 0, y: 0 });
  const viewRef = useRef(view);
  const [moving, setMoving] = useState(false);
  const [size, setSize] = useState({ cw: 0, ch: 0, bw: 0, bh: 0 });

  useEffect(() => {
    viewRef.current = view;
    onZoomChange?.(view.z);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.z]);

  // Measure the pane and the box (layout size, unaffected by the transform).
  useEffect(() => {
    const p = pane.current;
    const b = box.current;
    if (!p || !b) return;
    const read = () => setSize({ cw: p.clientWidth, ch: p.clientHeight, bw: b.offsetWidth, bh: b.offsetHeight });
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    ro.observe(p);
    return () => ro.disconnect();
  }, []);

  /** Keep the content covering the pane: pan only as far as the scaled box overflows it. */
  const clampView = useCallback(
    (z: number, x: number, y: number) => {
      const zz = clamp(z, 1, maxZoom);
      const snapped = zz < 1.02 ? 1 : zz;
      const ox = Math.max(0, (size.bw * snapped - size.cw) / 2);
      const oy = Math.max(0, (size.bh * snapped - size.ch) / 2);
      return { z: snapped, x: clamp(x, -ox, ox), y: clamp(y, -oy, oy) };
    },
    [size, maxZoom],
  );

  const zoomTo = useCallback(
    (factor: number, at?: { clientX: number; clientY: number }) => {
      const p = pane.current;
      const v = viewRef.current;
      if (!p) return;
      const r = p.getBoundingClientRect();
      const px = at ? at.clientX - (r.left + r.width / 2) : 0;
      const py = at ? at.clientY - (r.top + r.height / 2) : 0;
      const nz = clamp(v.z * factor, 1, maxZoom);
      const k = nz / v.z;
      const next = clampView(nz, px - (px - v.x) * k, py - (py - v.y) * k);
      viewRef.current = next;
      setView(next);
    },
    [clampView, maxZoom],
  );

  const reset = useCallback(() => {
    viewRef.current = { z: 1, x: 0, y: 0 };
    setView(viewRef.current);
  }, []);

  useGestures(
    pane,
    {
      pan: (dx, dy) => {
        const v = viewRef.current;
        if (v.z <= 1) return;
        const next = clampView(v.z, v.x + dx, v.y + dy);
        viewRef.current = next;
        setView(next);
      },
      zoom: (f, at) => zoomTo(f, at),
      tap: (p: PointLike) => {
        const b = box.current;
        if (!b || !onTap) return;
        const r = b.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return;
        const u = (p.clientX - r.left) / r.width;
        const v = (p.clientY - r.top) / r.height;
        if (u < 0 || u > 1 || v < 0 || v > 1) return;
        onTap({ u, v, target: p.target });
      },
      doubleTap: (p) => (viewRef.current.z > 1 ? reset() : zoomTo(2.5, p)),
      swipe: (d) => onSwipe?.(d),
      moving: setMoving,
    },
    { swipeEnabled: () => viewRef.current.z <= 1 && !!onSwipe, wheelPans: () => viewRef.current.z > 1 },
  );

  const onKey = (e: KeyboardEvent) => {
    if (!keyboard || e.ctrlKey || e.metaKey || e.altKey) return;
    const v = viewRef.current;
    if (e.key === "+" || e.key === "=") zoomTo(STEP);
    else if (e.key === "-" || e.key === "_") zoomTo(1 / STEP);
    else if (e.key === "0") reset();
    else if (v.z > 1 && e.key.startsWith("Arrow")) {
      const d = 60;
      const dx = e.key === "ArrowLeft" ? d : e.key === "ArrowRight" ? -d : 0;
      const dy = e.key === "ArrowUp" ? d : e.key === "ArrowDown" ? -d : 0;
      const next = clampView(v.z, v.x + dx, v.y + dy);
      viewRef.current = next;
      setView(next);
    } else return;
    e.preventDefault();
    e.stopPropagation();
  };

  const ratio = contentW > 0 && contentH > 0 ? contentW / contentH : 1;
  return (
    <div
      ref={pane}
      className={`vw-zoom ${className ?? ""}`}
      style={style}
      role="group"
      aria-roledescription="zoomable image"
      aria-label={label}
      tabIndex={0}
      onKeyDown={onKey}
    >
      <div
        ref={box}
        className="vw-zoom-box"
        data-zoom={view.z.toFixed(2)}
        style={
          {
            "--vw-ratio": String(ratio),
            "--vw-inv": String(1 / view.z),
            transform: view.z === 1 && view.x === 0 && view.y === 0 ? undefined : `translate(${view.x}px, ${view.y}px) scale(${view.z})`,
            transition: moving ? "none" : undefined,
          } as CSSProperties
        }
      >
        {children({ z: view.z, boxPx: size.bw, moving })}
      </div>
      <div className="vw-zoom-controls" role="group" aria-label="Zoom">
        <button type="button" className="vw-icon-btn" aria-label="Zoom in" onClick={() => zoomTo(STEP)} disabled={view.z >= maxZoom}>
          <Plus aria-hidden="true" size={18} strokeWidth={1.75} />
        </button>
        <button type="button" className="vw-icon-btn" aria-label="Zoom out" onClick={() => zoomTo(1 / STEP)} disabled={view.z <= 1}>
          <Minus aria-hidden="true" size={18} strokeWidth={1.75} />
        </button>
        <button type="button" className="vw-icon-btn" aria-label="Fit to screen" onClick={reset} disabled={view.z === 1}>
          <Maximize2 aria-hidden="true" size={16} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}
