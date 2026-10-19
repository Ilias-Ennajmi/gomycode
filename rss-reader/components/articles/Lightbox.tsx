"use client";

import * as React from "react";
import { X } from "lucide-react";
import { useBackToClose } from "@/lib/hooks/useHistorySync";

/**
 * A picture full screen: pinch (or double-tap) to zoom, drag to look around, swipe down
 * or tap the background to close. No library: a few pointer events.
 */
export function Lightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt?: string;
  onClose: () => void;
}) {
  useBackToClose(true, onClose);
  const [scale, setScale] = React.useState(1);
  const [offset, setOffset] = React.useState({ x: 0, y: 0 });
  const pointers = React.useRef(new Map<number, { x: number; y: number }>());
  const gesture = React.useRef<{
    distance: number;
    scale: number;
    center: { x: number; y: number };
    offset: { x: number; y: number };
    moved: boolean;
  } | null>(null);
  const lastTap = React.useRef(0);

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const pointsOf = () => Array.from(pointers.current.values());
  const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y);

  return (
    <div
      role="dialog"
      aria-label={alt || "Picture"}
      className="fixed inset-0 z-[60] flex animate-fade-in items-center justify-center bg-black/95 touch-none"
      onPointerDown={(event) => {
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        const points = pointsOf();
        gesture.current = {
          distance: points.length === 2 ? distance(points[0], points[1]) : 0,
          scale,
          center:
            points.length === 2
              ? { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 }
              : points[0],
          offset,
          moved: false,
        };
      }}
      onPointerMove={(event) => {
        if (!pointers.current.has(event.pointerId) || !gesture.current) return;
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        const points = pointsOf();
        const g = gesture.current;
        if (points.length === 2 && g.distance > 0) {
          const next = Math.max(
            1,
            Math.min(5, (g.scale * distance(points[0], points[1])) / g.distance)
          );
          setScale(next);
          g.moved = true;
        } else if (points.length === 1) {
          const dx = points[0].x - g.center.x;
          const dy = points[0].y - g.center.y;
          if (Math.abs(dx) > 4 || Math.abs(dy) > 4) g.moved = true;
          if (scale > 1) setOffset({ x: g.offset.x + dx, y: g.offset.y + dy });
          else if (dy > 0) setOffset({ x: 0, y: dy });
        }
      }}
      onPointerUp={(event) => {
        pointers.current.delete(event.pointerId);
        const g = gesture.current;
        if (!g) return;
        if (pointers.current.size === 0) {
          if (scale <= 1 && offset.y > 110) return onClose();
          if (scale <= 1) setOffset({ x: 0, y: 0 });
          if (!g.moved) {
            const now = Date.now();
            if (now - lastTap.current < 300) {
              // Double tap: zoom in around the tap, or back out.
              setScale((s) => (s > 1 ? 1 : 2.5));
              if (scale > 1) setOffset({ x: 0, y: 0 });
              lastTap.current = 0;
            } else {
              lastTap.current = now;
              const target = event.target as HTMLElement;
              if (target.tagName !== "IMG" && scale <= 1) setTimeout(onClose, 10);
            }
          }
          gesture.current = null;
        }
      }}
      onPointerCancel={(event) => pointers.current.delete(event.pointerId)}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur hover:bg-white/20"
        style={{ top: "calc(env(safe-area-inset-top) + 12px)" }}
      >
        <X className="h-5 w-5" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt ?? ""}
        draggable={false}
        className="max-h-full max-w-full select-none object-contain"
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          transition: gesture.current ? "none" : "transform 200ms ease-out",
          opacity: scale <= 1 ? 1 - Math.min(0.6, offset.y / 400) : 1,
        }}
      />
    </div>
  );
}
