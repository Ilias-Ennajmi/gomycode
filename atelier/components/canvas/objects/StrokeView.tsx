"use client";

import { getStroke } from "perfect-freehand";
import { useMemo } from "react";
import type { StrokeObj } from "@/lib/engine/model/types";
import { TEXT_BARS_ZOOM, useLod } from "../lod";
import { safeColor } from "./style";

function outlinePath(outline: number[][]): string {
  if (outline.length < 3) return "";
  const [first, ...rest] = outline;
  let d = `M ${first[0].toFixed(2)} ${first[1].toFixed(2)}`;
  for (let i = 0; i < rest.length; i++) {
    const [x0, y0] = rest[i];
    const [x1, y1] = rest[(i + 1) % rest.length];
    d += ` Q ${x0.toFixed(2)} ${y0.toFixed(2)} ${((x0 + x1) / 2).toFixed(2)} ${((y0 + y1) / 2).toFixed(2)}`;
  }
  return `${d} Z`;
}

/** Points are x,y,pressure triples relative to the object's x, y. Simplified (every 4th point) when zoomed far out. */
export function strokeOutline(obj: StrokeObj, simplify: boolean): string {
  const step = simplify ? 4 : 1;
  const pts: number[][] = [];
  const n = obj.points.length / 3;
  for (let i = 0; i < n; i += step) pts.push([obj.points[i * 3], obj.points[i * 3 + 1], obj.points[i * 3 + 2]]);
  if (simplify && n > 1 && (n - 1) % step !== 0) pts.push([obj.points[(n - 1) * 3], obj.points[(n - 1) * 3 + 1], obj.points[(n - 1) * 3 + 2]]);
  if (pts.length === 0) return "";
  const highlighter = obj.tool === "highlighter";
  const outline = getStroke(pts, {
    size: obj.size,
    thinning: highlighter ? 0 : 0.5,
    smoothing: 0.5,
    streamline: 0.4,
    simulatePressure: false,
    last: true,
  });
  return outlinePath(outline);
}

export function StrokeView({ obj }: { obj: StrokeObj }) {
  const { zoom } = useLod();
  const simplify = zoom < TEXT_BARS_ZOOM;
  const d = useMemo(() => strokeOutline(obj, simplify), [obj, simplify]);
  const highlighter = obj.tool === "highlighter";
  return (
    <svg
      width={obj.w}
      height={obj.h}
      viewBox={`0 0 ${obj.w} ${obj.h}`}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        overflow: "visible",
        opacity: highlighter ? 0.4 : undefined,
        mixBlendMode: highlighter ? "multiply" : undefined,
      }}
    >
      <path d={d} fill={safeColor(obj.color, "var(--color-ink)")} />
    </svg>
  );
}
