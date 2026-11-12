"use client";

import { useMemo } from "react";
import { strokeOutline } from "@/lib/engine/geometry/stroke-outline";
import type { StrokeObj } from "@/lib/engine/model/types";
import { TEXT_BARS_ZOOM, useLod } from "../lod";
import { safeColor } from "./style";

export { strokeOutline };

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
