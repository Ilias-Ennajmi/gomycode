"use client";

import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { hitTest } from "@/lib/engine/geometry/hit";
import { LoadTracker } from "@/lib/viewer/load-tracker";
import { buildTree, objectsOfSlide } from "@/lib/viewer/scene";
import type { ViewerResolver } from "@/lib/viewer/viewer-resolver";
import type { ViewerBoard, ViewerObject, ViewerSlide } from "@/lib/viewer/viewer-types";
import { NodeCtx, TreeView, type NodeContext } from "./nodes";
import { ZoomPane } from "./ZoomPane";

/*
 * Slides mode. Each slide is shown as the studio's pre-rendered picture (w480 first, w1280 over it); the fit is pure CSS so the
 * server's HTML is already laid out. Pinching, wheeling or the + button mounts the live objects of that one frame on top
 * (sharper pictures, real text), and the preview is dropped once they have loaded. A tap on a picture opens it full size.
 */

export interface SlideOverlayInfo {
  slide: ViewerSlide;
  objects: ViewerObject[];
  z: number;
}

interface Props {
  board: ViewerBoard;
  resolver: ViewerResolver;
  index: number;
  dir: "next" | "prev" | "none";
  onIndex: (i: number) => void;
  credits: boolean;
  onOpenImage: (id: string) => void;
  /** Drawn inside the zoomed box, in percentages of the frame (pins, badges). */
  overlay?: (info: SlideOverlayInfo) => ReactNode;
  /** A tap on the slide itself (not on a picture): u, v in 0..1 across the frame. Return true when it was used. */
  onSlideTap?: (info: { slide: ViewerSlide; u: number; v: number; point: { x: number; y: number }; hit: ViewerObject | null }) => boolean;
  /** The announcement text for the live region lives in ViewerApp; this tells it which slide is showing. */
}

const pct = (v: number) => `${Math.round(v * 10000) / 100}%`;

function Preview({ slide, covered, first }: { slide: ViewerSlide; covered: boolean; first: boolean }) {
  if (!slide.previewW480 || !slide.previewW1280) return null;
  const w = Math.max(1, Math.round(slide.w));
  const h = Math.max(1, Math.round(slide.h));
  return (
    <div className="vw-preview" data-covered={covered ? "" : undefined} aria-hidden="true">
      {/* The small one is what paints first (the LCP element); the big one lands over it. Both are pre-rendered by the studio. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="vw-preview-lo" src={slide.previewW480} alt="" width={w} height={h} decoding="async" fetchPriority={first ? "high" : "auto"} draggable={false} onContextMenu={(e) => e.preventDefault()} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="vw-preview-hi"
        src={slide.previewW1280}
        srcSet={`${slide.previewW480} 480w, ${slide.previewW1280} 1280w`}
        sizes="(min-width: 900px) 70vw, 100vw"
        alt=""
        width={w}
        height={h}
        decoding="async"
        // The sharp version must not compete with the scripts that make the page interactive.
        fetchPriority="low"
        draggable={false}
        onContextMenu={(e) => e.preventDefault()}
      />
    </div>
  );
}

function LiveLayer({ slide, objects, resolver, boxPx, z, moving, hasPreview, onReady }: { slide: ViewerSlide; objects: ViewerObject[]; resolver: ViewerResolver; boxPx: number; z: number; moving: boolean; hasPreview: boolean; onReady: (r: boolean) => void }) {
  const [tracker] = useState(() => {
    const t = new LoadTracker();
    t.start(); // released after mount, once every picture has had the chance to register itself
    return t;
  });
  const ready = useSyncExternalStore(tracker.subscribe, tracker.getSnapshot, () => false);
  useEffect(() => {
    const id = requestAnimationFrame(() => tracker.done());
    return () => {
      cancelAnimationFrame(id);
      tracker.dispose();
    };
  }, [tracker]);
  useEffect(() => {
    onReady(ready);
    return () => onReady(false);
  }, [ready, onReady]);

  const byId = useMemo(() => new Map(objects.map((o) => [o.id, o])), [objects]);
  const roots = useMemo(() => buildTree(objects), [objects]);
  const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  // While the studio's picture is still showing underneath, frames paint nothing of their own; once the live objects have loaded
  // and the picture fades out, the frame's own background takes over in the same moment.
  const ctx = useMemo<NodeContext>(() => ({ resolver, byId, underlay: hasPreview && !ready, credits: false, dpr, tracker }), [resolver, byId, hasPreview, ready, dpr, tracker]);
  const k = boxPx > 0 ? boxPx / Math.max(slide.w, 1) : 0;
  return (
    <div className="vw-live" data-ready={ready || !hasPreview ? "" : undefined} style={{ width: slide.w, height: slide.h, transform: `scale(${k})`, visibility: k > 0 ? "visible" : "hidden" }}>
      <div style={{ position: "absolute", left: 0, top: 0, transform: `translate(${-slide.x}px, ${-slide.y}px)` }}>
        <NodeCtx.Provider value={ctx}>
          {roots.map((n) => (
            <TreeView key={n.obj.id} node={n} scale={k * z} gesture={moving} />
          ))}
        </NodeCtx.Provider>
      </div>
    </div>
  );
}

function CreditChips({ slide, objects, resolver }: { slide: ViewerSlide; objects: ViewerObject[]; resolver: ViewerResolver }) {
  const chips = objects.flatMap((o) => {
    if (o.type !== "image" && o.type !== "video") return [];
    const text = resolver.assetCredit(o.assetId);
    return text ? [{ id: o.id, o, text }] : [];
  });
  return (
    <>
      {chips.map(({ id, o, text }) => (
        <span key={id} className="vw-chip vw-credit-chip" style={{ left: pct((o.x - slide.x) / slide.w), top: pct((o.y + o.h - slide.y) / slide.h) }}>
          {text}
        </span>
      ))}
    </>
  );
}

export function SlideDeck({ board, resolver, index, dir, onIndex, credits, onOpenImage, overlay, onSlideTap }: Props) {
  const slide = board.slides[index];
  const n = board.slides.length;
  const objects = useMemo(() => (slide ? objectsOfSlide(board.objects, slide.id) : []), [board.objects, slide]);
  const [forced, setForced] = useState<string | null>(null);
  const [covered, setCovered] = useState(false);
  const hasPreview = !!(slide?.previewW480 && slide.previewW1280);
  if (!slide) return null;

  const onTap = ({ u, v, target }: { u: number; v: number; target: EventTarget | null }) => {
    const el = target instanceof Element ? target : null;
    if (el?.closest("button, a, video, [data-no-tap], [data-pin]")) return;
    const point = { x: slide.x + u * slide.w, y: slide.y + v * slide.h };
    // Topmost thing a visitor can act on under the finger.
    let hit: ViewerObject | null = null;
    for (let i = objects.length - 1; i >= 0; i--) {
      const o = objects[i];
      if ((o.type === "image" || o.type === "link" || o.type === "embed" || o.type === "video") && hitTest(o, point, 0)) {
        hit = o;
        break;
      }
    }
    if (onSlideTap?.({ slide, u, v, point, hit })) return;
    if (!hit) return;
    if (hit.type === "image") onOpenImage(hit.id);
    else if (hit.type === "link") {
      const href = (() => {
        try {
          const u2 = new URL(hit.url);
          return u2.protocol === "https:" || u2.protocol === "http:" ? u2.href : null;
        } catch {
          return null;
        }
      })();
      if (href) window.open(href, "_blank", "noopener,noreferrer");
    } else if (hit.type === "embed" || hit.type === "video") setForced(slide.id);
  };

  return (
    <section className="vw-stage" aria-roledescription="carousel" aria-label="Slides" data-dir={dir}>
      <ZoomPane
        key={slide.id}
        className="vw-slide"
        contentW={slide.w}
        contentH={slide.h}
        label={`Slide ${index + 1} of ${n}: ${slide.name}`}
        onSwipe={(d) => onIndex(Math.min(n - 1, Math.max(0, index + (d === "next" ? 1 : -1))))}
        onTap={onTap}
      >
        {({ z, boxPx, moving }) => {
          const live = z > 1.02 || forced === slide.id || !hasPreview;
          return (
            <>
              <Preview slide={slide} covered={live && covered} first={index === 0} />
              {live ? <LiveLayer slide={slide} objects={objects} resolver={resolver} boxPx={boxPx} z={z} moving={moving} hasPreview={hasPreview} onReady={setCovered} /> : null}
              <div className="vw-overlay" style={{ ["--vw-inv" as string]: String(1 / z) }}>
                {credits ? <CreditChips slide={slide} objects={objects} resolver={resolver} /> : null}
                {overlay ? overlay({ slide, objects, z }) : null}
              </div>
            </>
          );
        }}
      </ZoomPane>
    </section>
  );
}
