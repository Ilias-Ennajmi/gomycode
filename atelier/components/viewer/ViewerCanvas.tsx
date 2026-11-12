"use client";

import { Maximize2, Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import { fitRect, panBy, zoomAt, type Camera } from "@/lib/engine/geometry/camera";
import { boundsOf, unionRects } from "@/lib/engine/geometry/rect";
import type { Point, Rect } from "@/lib/engine/model/types";
import { buildTree, cullTree } from "@/lib/viewer/scene";
import type { ViewerResolver } from "@/lib/viewer/viewer-resolver";
import type { ViewerObject } from "@/lib/viewer/viewer-types";
import { NodeCtx, TreeView, type NodeContext } from "./nodes";
import { useGestures, type PointLike } from "./use-gestures";

/*
 * Free roam: the whole board as one pannable, zoomable surface (plain DOM, no Yjs). Only what overlaps the view (plus a margin)
 * is mounted; pictures pick their own variant from how large they are on screen (lib/engine/render/variant.ts), and never
 * swap to a smaller one while the camera is moving.
 */

export interface CanvasTap {
  point: Point;
  target: EventTarget | null;
  pointerType: string;
}

interface Props {
  objects: readonly ViewerObject[];
  resolver: ViewerResolver;
  credits: boolean;
  /** Fit this rectangle when it changes (a slide chosen in the strip); the whole board on first show. */
  focus: { rect: Rect; key: string } | null;
  onTap?: (tap: CanvasTap) => void;
  /** Drawn in canvas coordinates on top of the objects (pins, badges). */
  overlay?: (cam: Camera) => ReactNode;
  label: string;
}

const subscribeNothing = () => () => undefined;
const halfOctave = (z: number) => 2 ** (Math.round(Math.log2(Math.max(z, 1e-4)) * 2) / 2);

export function ViewerCanvas({ objects, resolver, credits, focus, onTap, overlay, label }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [vp, setVp] = useState({ w: 0, h: 0 });
  const [cam, setCam] = useState<Camera>({ x: 0, y: 0, z: 1 });
  const camRef = useRef(cam);
  const [moving, setMoving] = useState(false);
  const dpr = useSyncExternalStore(subscribeNothing, () => window.devicePixelRatio || 1, () => 1);
  const fitted = useRef<string | null>(null);
  const vpRef = useRef(vp);
  const cullRef = useRef<Camera>(cam);
  // What is mounted is computed for `cull`: the camera at the time the margin around the view was last re-centred.
  const [cull, setCull] = useState<Camera>(cam);

  const tree = useMemo(() => buildTree(objects), [objects]);
  const byId = useMemo(() => new Map(objects.map((o) => [o.id, o])), [objects]);
  const all = useMemo(() => unionRects(objects.filter((o) => o.type !== "arrow").map(boundsOf)), [objects]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const read = () => {
      vpRef.current = { w: el.clientWidth, h: el.clientHeight };
      setVp(vpRef.current);
    };
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** Moves the camera; re-centres what is mounted only when the view has left the margin it was computed for (or zoomed a lot). */
  const apply = useCallback((c: Camera, recull = false) => {
    camRef.current = c;
    setCam(c);
    const k = cullRef.current;
    const v = vpRef.current;
    const m = Math.max(v.w, v.h) * 0.5;
    const ratio = c.z / k.z;
    if (recull || Math.abs(c.x - k.x) * c.z > m * 0.6 || Math.abs(c.y - k.y) * c.z > m * 0.6 || ratio > 1.4 || ratio < 0.7) {
      cullRef.current = c;
      setCull(c);
    }
  }, []);

  // First fit, and a fit whenever a different slide is chosen.
  useEffect(() => {
    if (vp.w === 0 || vp.h === 0) return;
    const key = focus?.key ?? "all";
    if (fitted.current === key) return;
    fitted.current = key;
    apply(fitRect(focus?.rect ?? all, vp, 24, focus ? 4 : 1), true);
  }, [vp, focus, all, apply]);

  useGestures(
    host,
    {
      pan: (dx, dy) => apply(panBy(camRef.current, dx, dy)),
      zoom: (f, at) => {
        const r = host.current?.getBoundingClientRect();
        apply({ ...zoomAt(camRef.current, { x: at.clientX - (r?.left ?? 0), y: at.clientY - (r?.top ?? 0) }, f) });
      },
      tap: (p: PointLike) => {
        const r = host.current?.getBoundingClientRect();
        if (!r || !onTap) return;
        const c = camRef.current;
        onTap({ point: { x: (p.clientX - r.left) / c.z + c.x, y: (p.clientY - r.top) / c.z + c.y }, target: p.target, pointerType: p.pointerType });
      },
      doubleTap: (p) => {
        const r = host.current?.getBoundingClientRect();
        apply(zoomAt(camRef.current, { x: p.clientX - (r?.left ?? 0), y: p.clientY - (r?.top ?? 0) }, 2));
      },
      swipe: () => undefined,
      moving: (m) => {
        setMoving(m);
        if (!m) apply(camRef.current, true);
      },
    },
    { swipeEnabled: () => false, wheelPans: () => true },
  );

  const step = (factor: number) => apply(zoomAt(camRef.current, { x: vp.w / 2, y: vp.h / 2 }, factor));
  const onKey = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const d = 80;
    if (e.key === "+" || e.key === "=") step(1.25);
    else if (e.key === "-" || e.key === "_") step(0.8);
    else if (e.key === "0") apply(fitRect(all, vp, 24, 1));
    else if (e.key === "ArrowLeft") apply(panBy(camRef.current, d, 0));
    else if (e.key === "ArrowRight") apply(panBy(camRef.current, -d, 0));
    else if (e.key === "ArrowUp") apply(panBy(camRef.current, 0, d));
    else if (e.key === "ArrowDown") apply(panBy(camRef.current, 0, -d));
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  const margin = Math.max(vp.w, vp.h) * 0.5;
  const visible = useMemo(() => {
    if (vp.w === 0) return tree.slice(0, 0);
    const view: Rect = { x: cull.x, y: cull.y, w: vp.w / cull.z, h: vp.h / cull.z };
    return cullTree(tree, view, (margin * 1.2) / cull.z);
  }, [tree, cull, vp, margin]);

  const ctx = useMemo<NodeContext>(() => ({ resolver, byId, underlay: false, credits, dpr, tracker: null }), [resolver, byId, credits, dpr]);
  const scale = halfOctave(cam.z);

  return (
    <div
      ref={host}
      className="vw-canvas"
      role="group"
      aria-roledescription="canvas"
      aria-label={label}
      tabIndex={0}
      onKeyDown={onKey}
      data-zoom={cam.z.toFixed(3)}
    >
      <div
        className="vw-camera"
        style={{ transform: `scale(${cam.z}) translate(${-cam.x}px, ${-cam.y}px)`, ["--zoom" as string]: String(cam.z), ["--inv-zoom" as string]: String(1 / cam.z) }}
      >
        <NodeCtx.Provider value={ctx}>
          {visible.map((n) => (
            <TreeView key={n.obj.id} node={n} scale={scale} gesture={moving} />
          ))}
        </NodeCtx.Provider>
        {overlay ? overlay(cam) : null}
      </div>
      <div className="vw-zoom-controls" role="group" aria-label="Zoom">
        <button type="button" className="vw-icon-btn" aria-label="Zoom in" onClick={() => step(1.25)}>
          <Plus aria-hidden="true" size={18} strokeWidth={1.75} />
        </button>
        <button type="button" className="vw-icon-btn" aria-label="Zoom out" onClick={() => step(0.8)}>
          <Minus aria-hidden="true" size={18} strokeWidth={1.75} />
        </button>
        <button type="button" className="vw-icon-btn" aria-label="Fit board to screen" onClick={() => apply(fitRect(all, vp, 24, 1))}>
          <Maximize2 aria-hidden="true" size={16} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}
