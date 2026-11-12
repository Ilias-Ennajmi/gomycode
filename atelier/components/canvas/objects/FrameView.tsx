"use client";

import type { ReactNode } from "react";
import type { FrameObj } from "@/lib/engine/model/types";
import { safeColor } from "./style";

/**
 * A frame hosts its children inside a clip box. Children keep their absolute canvas coordinates: the inner layer
 * applies the inverse of the frame's own transform, so rotating or moving the frame needs no coordinate changes here.
 * The name label sits outside the clip at constant screen size (scaled by the layer's --inv-zoom variable).
 */
export function FrameView({ obj, children }: { obj: FrameObj; children?: ReactNode }) {
  const cx = obj.x + obj.w / 2;
  const cy = obj.y + obj.h / 2;
  const inverse =
    obj.rotation === 0
      ? `translate(${-obj.x}px, ${-obj.y}px)`
      : `translate(${obj.w / 2}px, ${obj.h / 2}px) rotate(${-obj.rotation}rad) translate(${-cx}px, ${-cy}px)`;
  return (
    <>
      <div
        data-frame-label=""
        style={{
          position: "absolute",
          left: 0,
          bottom: "100%",
          maxWidth: `max(80px, calc(${obj.w}px * var(--zoom, 1)))`,
          paddingBottom: "var(--space-1)",
          transformOrigin: "0 100%",
          transform: "scale(var(--inv-zoom, 1))",
          color: "var(--color-muted)",
          fontSize: "var(--text-xs)",
          lineHeight: 1.2,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {obj.name}
      </div>
      <div
        style={{
          position: "absolute",
          inset: 0,
          overflow: obj.clip ? "hidden" : "visible",
          background: safeColor(obj.background, "var(--color-surface)"),
          boxShadow: "var(--elev-1)",
        }}
      >
        <div style={{ position: "absolute", left: 0, top: 0, transformOrigin: "0 0", transform: inverse }}>{children}</div>
      </div>
    </>
  );
}
