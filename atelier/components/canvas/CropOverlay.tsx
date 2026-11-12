"use client";

import { useId, useSyncExternalStore } from "react";
import type { AssetResolver } from "@/lib/assets/resolver-types";
import type { BoardDoc } from "@/lib/engine/doc/board-doc";
import type { CameraStore } from "@/lib/engine/input/camera-store";
import { HANDLES, HANDLE_UNIT } from "@/lib/engine/input/handles";
import type { CropTool } from "@/lib/engine/input/tools/crop";
import { useCamera, useCoarsePointer } from "./useStores";
import { useValueCheck } from "./useValueCheck";

const HANDLE_PX = 9;

/**
 * The crop UI, drawn in screen space above the objects: the whole picture dimmed, the crop window at full strength
 * with a rule-of-thirds grid and eight handles. Only draws; the CropTool owns every gesture.
 */
export function CropOverlay({ tool, camera, doc, assets }: { tool: CropTool | undefined; camera: CameraStore; doc: BoardDoc; assets: AssetResolver }) {
  const clipId = useId();
  const cam = useCamera(camera);
  const coarse = useCoarsePointer();
  const valueCheck = useValueCheck(doc);
  const state = useSyncExternalStore(
    (cb) => (tool ? tool.subscribe(cb) : () => {}),
    () => tool?.state ?? null,
    () => null,
  );
  if (!tool || !state) return null;
  const obj = doc.get(state.id);
  if (!obj || obj.type !== "image") return null;
  const href = assets.url(obj.assetId, "w1024");

  const z = cam.z;
  const cx = (state.centre.x - cam.x) * z;
  const cy = (state.centre.y - cam.y) * z;
  // Everything below is in px relative to the object's centre, in its own (rotated) frame.
  const fx = (state.frame.x - state.centre.x) * z;
  const fy = (state.frame.y - state.centre.y) * z;
  const fw = state.frame.w * z;
  const fh = state.frame.h * z;
  const wx = fx + state.win.x * fw;
  const wy = fy + state.win.y * fh;
  const ww = state.win.w * fw;
  const wh = state.win.h * fh;
  const hit = coarse ? 44 : 22;
  const px = Math.round(state.win.w * state.src.w);
  const py = Math.round(state.win.h * state.src.h);
  const gray = obj.grayscale || valueCheck ? "grayscale(1)" : undefined;
  const picture = (
    <g transform={`translate(${fx + fw / 2} ${fy + fh / 2}) scale(${state.flipX ? -1 : 1} ${state.flipY ? -1 : 1})`}>
      {href ? (
        <image href={href} x={-fw / 2} y={-fh / 2} width={fw} height={fh} preserveAspectRatio="none" style={{ filter: gray }} />
      ) : (
        <rect x={-fw / 2} y={-fh / 2} width={fw} height={fh} fill="var(--color-border)" />
      )}
    </g>
  );

  return (
    <svg
      aria-hidden="true"
      data-crop-overlay=""
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "hidden", pointerEvents: "none" }}
    >
      <g transform={`translate(${cx} ${cy}) rotate(${(state.rotation * 180) / Math.PI})`}>
        <rect x={fx} y={fy} width={fw} height={fh} fill="var(--color-bg)" />
        <g opacity={0.42}>{picture}</g>
        <clipPath id={clipId}>
          <rect x={wx} y={wy} width={ww} height={wh} />
        </clipPath>
        <g clipPath={`url(#${clipId})`}>{picture}</g>
        <rect x={fx} y={fy} width={fw} height={fh} fill="none" stroke="var(--color-border)" strokeWidth={1} />
        {[1, 2].map((i) => (
          <g key={i} stroke="var(--color-surface)" strokeOpacity={0.7} strokeWidth={1}>
            <line x1={wx + (ww * i) / 3} y1={wy} x2={wx + (ww * i) / 3} y2={wy + wh} />
            <line x1={wx} y1={wy + (wh * i) / 3} x2={wx + ww} y2={wy + (wh * i) / 3} />
          </g>
        ))}
        <rect data-crop-window="" x={wx} y={wy} width={ww} height={wh} fill="none" stroke="var(--color-selection)" strokeWidth={1.5} />
        {HANDLES.map((h) => {
          const u = HANDLE_UNIT[h];
          return (
            <g key={h} data-crop-handle={h} transform={`translate(${wx + u.x * ww} ${wy + u.y * wh})`}>
              <rect x={-hit / 2} y={-hit / 2} width={hit} height={hit} fill="transparent" />
              <rect x={-HANDLE_PX / 2} y={-HANDLE_PX / 2} width={HANDLE_PX} height={HANDLE_PX} rx={1.5} fill="var(--color-surface)" stroke="var(--color-selection)" strokeWidth={1.5} />
            </g>
          );
        })}
        <g transform={`translate(${wx + ww / 2} ${wy + wh + 18})`}>
          <rect x={-44} y={-10} width={88} height={20} rx={4} fill="var(--color-surface)" stroke="var(--color-border)" />
          <text textAnchor="middle" dominantBaseline="central" fontSize={11} fill="var(--color-ink)" style={{ fontVariantNumeric: "tabular-nums" }}>
            {px} × {py} px
          </text>
        </g>
      </g>
    </svg>
  );
}
