"use client";

import type { CameraStore } from "@/lib/engine/input/camera-store";
import type { OverlayStore } from "@/lib/engine/input/tool-machine";
import { useCamera, useOverlayState } from "./useStores";

const TICK = 4;

/** Snap guides in the accent colour: alignment lines, and distance markers with their value. */
export function GuidesOverlay({ overlays, camera }: { overlays: OverlayStore; camera: CameraStore }) {
  const cam = useCamera(camera);
  const { guides } = useOverlayState(overlays);
  if (guides.length === 0) return null;
  const sx = (x: number) => (x - cam.x) * cam.z;
  const sy = (y: number) => (y - cam.y) * cam.z;
  return (
    <svg
      aria-hidden="true"
      data-guides-overlay=""
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "hidden", pointerEvents: "none" }}
    >
      {guides.map((g, i) => {
        const horizontal = g.axis === "y"; // the line runs along x at y = pos
        const [x1, y1, x2, y2] = horizontal ? [sx(g.from), sy(g.pos), sx(g.to), sy(g.pos)] : [sx(g.pos), sy(g.from), sx(g.pos), sy(g.to)];
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        const label = g.gap === undefined ? null : String(Math.round(g.gap));
        const w = label ? label.length * 7 + 10 : 0;
        return (
          <g key={i} stroke="var(--color-selection)" strokeWidth={1} fill="none">
            <line x1={x1} y1={y1} x2={x2} y2={y2} />
            {label ? (
              <>
                {horizontal ? (
                  <>
                    <line x1={x1} y1={y1 - TICK} x2={x1} y2={y1 + TICK} />
                    <line x1={x2} y1={y2 - TICK} x2={x2} y2={y2 + TICK} />
                  </>
                ) : (
                  <>
                    <line x1={x1 - TICK} y1={y1} x2={x1 + TICK} y2={y1} />
                    <line x1={x2 - TICK} y1={y2} x2={x2 + TICK} y2={y2} />
                  </>
                )}
                <rect x={mx - w / 2} y={my - 9} width={w} height={18} rx={4} fill="var(--color-selection)" stroke="none" />
                <text
                  x={mx}
                  y={my + 4}
                  textAnchor="middle"
                  fill="var(--color-on-accent)"
                  stroke="none"
                  style={{ fontSize: "var(--text-xs)", fontFamily: "var(--font-ui)" }}
                >
                  {label}
                </text>
              </>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
