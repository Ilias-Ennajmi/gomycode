"use client";

import type { BoardDoc } from "@/lib/engine/doc/board-doc";
import type { ShapeObj } from "@/lib/engine/model/types";
import { RichContent } from "./RichContent";
import { dashArray, safeColor } from "./style";

function polygonPoints(kind: ShapeObj["kind"], w: number, h: number): string | null {
  const hw = w / 2;
  const hh = h / 2;
  switch (kind) {
    case "triangle":
      return `${hw},0 ${w},${h} 0,${h}`;
    case "diamond":
      return `${hw},0 ${w},${hh} ${hw},${h} 0,${hh}`;
    case "star": {
      const pts: string[] = [];
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? 1 : 0.382;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        pts.push(`${hw + Math.cos(a) * hw * r},${hh + Math.sin(a) * hh * r}`);
      }
      return pts.join(" ");
    }
    default:
      return null;
  }
}

export function ShapeView({ doc, obj }: { doc: BoardDoc; obj: ShapeObj }) {
  const { w, h } = obj;
  const stroke = obj.stroke && obj.strokeWidth > 0 ? safeColor(obj.stroke, "var(--color-ink)") : "none";
  const common = {
    fill: obj.fill ? safeColor(obj.fill, "none") : "none",
    stroke,
    strokeWidth: obj.strokeWidth,
    strokeDasharray: dashArray(obj.strokeStyle, obj.strokeWidth),
    strokeLinecap: obj.strokeStyle === "dotted" ? ("round" as const) : undefined,
    strokeLinejoin: "round" as const,
  };
  const points = polygonPoints(obj.kind, w, h);
  const radius = obj.kind === "roundRect" ? (obj.cornerRadius > 0 ? obj.cornerRadius : Math.min(w, h) * 0.12) : obj.cornerRadius;
  return (
    <>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
        {obj.kind === "ellipse" ? (
          <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} {...common} />
        ) : points ? (
          <polygon points={points} {...common} />
        ) : (
          <rect x={0} y={0} width={w} height={h} rx={Math.min(radius, w / 2, h / 2)} {...common} />
        )}
      </svg>
      <RichContent
        doc={doc}
        obj={obj}
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "var(--space-2)",
          boxSizing: "border-box",
          textAlign: "center",
          color: "var(--color-ink)",
          fontSize: "var(--text-md)",
          overflowWrap: "anywhere",
        }}
      />
    </>
  );
}
