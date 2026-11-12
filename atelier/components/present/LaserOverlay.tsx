"use client";

import { useEffect, useRef } from "react";
import { LaserTrail } from "@/lib/engine/present/laser";

function reducedMotion(): boolean {
  try {
    return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * The laser pointer: a dot that follows the pointer with a short fading trail, drawn on a 2D canvas above the slide.
 * It is never written to the board. Under reduced motion the trail is dropped and the dot just follows the pointer.
 */
export function LaserOverlay() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext("2d");
    const trail = new LaserTrail();
    const still = reducedMotion();
    let raf = 0;
    let last: { x: number; y: number } | null = null;

    const size = () => {
      const dpr = window.devicePixelRatio || 1;
      el.width = Math.max(1, Math.round(window.innerWidth * dpr));
      el.height = Math.max(1, Math.round(window.innerHeight * dpr));
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const dot = (x: number, y: number, r: number, alpha: number, colour: string) => {
      if (!ctx) return;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    };
    const draw = () => {
      raf = 0;
      if (!ctx) return;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      const colour = getComputedStyle(el).color; // the --color-laser token, resolved
      if (still) {
        if (last) dot(last.x, last.y, 7, 1, colour);
        return;
      }
      const pts = trail.points(performance.now());
      pts.forEach((p, i) => dot(p.x, p.y, i === pts.length - 1 ? 8 : 3 + 5 * p.alpha, i === pts.length - 1 ? 1 : p.alpha * 0.7, colour));
      ctx.globalAlpha = 1;
      if (pts.length > 0) raf = requestAnimationFrame(draw);
    };
    const onMove = (e: PointerEvent) => {
      last = { x: e.clientX, y: e.clientY };
      if (!still) trail.add(last, performance.now());
      if (!raf) raf = requestAnimationFrame(draw);
    };
    const onLeave = () => {
      last = null;
      trail.clear();
      if (!raf) raf = requestAnimationFrame(draw);
    };
    size();
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("resize", size);
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("resize", size);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return <canvas ref={canvas} aria-hidden="true" data-testid="present-laser" className="pointer-events-none absolute inset-0 size-full" style={{ color: "var(--color-laser)" }} />;
}
