"use client";

import { useMemo } from "react";
import type { BoardDoc } from "@/lib/engine/doc/board-doc";
import { arrowPath } from "@/lib/engine/geometry/arrow-path";
import type { ArrowObj, Head, Point } from "@/lib/engine/model/types";
import { useDocObject } from "../useDocObject";
import { dashArray, safeColor } from "./style";

function headShape(head: Head, tip: Point, dir: Point, size: number): { d: string; filled: boolean } | null {
  if (head === "none") return null;
  const back = { x: -dir.x, y: -dir.y };
  const rot = (v: Point, a: number): Point => ({ x: v.x * Math.cos(a) - v.y * Math.sin(a), y: v.x * Math.sin(a) + v.y * Math.cos(a) });
  const at = (v: Point, len: number): Point => ({ x: tip.x + v.x * len, y: tip.y + v.y * len });
  const f = (p: Point) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
  switch (head) {
    case "arrow": {
      const a = at(rot(back, 0.45), size);
      const b = at(rot(back, -0.45), size);
      return { d: `M ${f(a)} L ${f(tip)} L ${f(b)}`, filled: false };
    }
    case "triangle": {
      const a = at(rot(back, 0.4), size);
      const b = at(rot(back, -0.4), size);
      return { d: `M ${f(tip)} L ${f(a)} L ${f(b)} Z`, filled: true };
    }
    case "dot": {
      const r = size * 0.4;
      const c = at(back, r);
      return { d: `M ${f({ x: c.x - r, y: c.y })} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0 Z`, filled: true };
    }
    case "bar": {
      const n = { x: -dir.y, y: dir.x };
      const a = at(n, size * 0.5);
      const b = at(n, -size * 0.5);
      return { d: `M ${f(a)} L ${f(b)}`, filled: false };
    }
  }
}

export function ArrowView({ doc, obj }: { doc: BoardDoc; obj: ArrowObj }) {
  // Re-render when a bound target moves or disappears.
  const startTarget = useDocObject(doc, obj.start.kind === "bound" ? obj.start.id : null);
  const endTarget = useDocObject(doc, obj.end.kind === "bound" ? obj.end.id : null);
  const geom = useMemo(
    () => arrowPath(obj, (id) => doc.get(id)),
    // startTarget/endTarget are the inputs that matter; doc.get reads the same snapshots.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [obj, startTarget, endTarget, doc],
  );
  const color = safeColor(obj.stroke, "var(--color-ink)");
  const width = Math.max(obj.strokeWidth, 0);
  const headSize = Math.max(10, width * 4);
  const startHead = headShape(obj.startHead, geom.start, geom.startDir, headSize);
  const endHead = headShape(obj.endHead, geom.end, geom.endDir, headSize);
  const dash = obj.strokeStyle === "solid" ? undefined : dashArray(obj.strokeStyle, width);
  return (
    <>
      <svg
        width={1}
        height={1}
        style={{ position: "absolute", left: 0, top: 0, overflow: "visible", opacity: geom.dangling ? 0.5 : undefined }}
      >
        <path
          d={geom.d}
          fill="none"
          stroke={color}
          strokeWidth={width}
          strokeDasharray={geom.dangling && !dash ? `${Math.max(width, 1) * 3} ${Math.max(width, 1) * 2}` : dash}
          strokeLinecap={obj.strokeStyle === "dotted" ? "round" : "butt"}
          strokeLinejoin="round"
        />
        {[startHead, endHead].map((h, i) =>
          h ? (
            <path
              key={i}
              d={h.d}
              fill={h.filled ? color : "none"}
              stroke={color}
              strokeWidth={width}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null,
        )}
      </svg>
      {obj.label ? (
        <div
          style={{
            position: "absolute",
            left: geom.labelAt.x,
            top: geom.labelAt.y,
            transform: "translate(-50%, -50%)",
            padding: "2px var(--space-2)",
            background: "var(--color-bg)",
            borderRadius: "var(--radius-sm)",
            color: "var(--color-ink)",
            fontSize: "var(--text-sm)",
            whiteSpace: "pre",
          }}
        >
          {obj.label}
        </div>
      ) : null}
    </>
  );
}
