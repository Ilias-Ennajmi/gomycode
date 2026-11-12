"use client";

import { useMemo } from "react";
import type { BoardDoc } from "@/lib/engine/doc/board-doc";
import { headShape } from "@/lib/engine/geometry/arrow-heads";
import { arrowPath } from "@/lib/engine/geometry/arrow-path";
import type { ArrowObj } from "@/lib/engine/model/types";
import { useDocObject } from "../useDocObject";
import { dashArray, safeColor } from "./style";

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
            background: "var(--color-surface)",
            boxShadow: "var(--elev-1)",
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
