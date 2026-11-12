"use client";

import { useEffect, useReducer } from "react";
import type { BoardDoc } from "@/lib/engine/doc/board-doc";
import { type Camera } from "@/lib/engine/geometry/camera";
import { boundsOf } from "@/lib/engine/geometry/rect";
import type { CameraStore } from "@/lib/engine/input/camera-store";
import { HANDLE_HIT_PX, HANDLE_UNIT, ROTATE_OFFSET_PX, selectionBox, visibleHandles } from "@/lib/engine/input/handles";
import type { OverlayStore } from "@/lib/engine/input/tool-machine";
import type { SelectionStore } from "@/lib/engine/input/selection-store";
import type { CanvasObject, Rect } from "@/lib/engine/model/types";
import { useCamera, useCoarsePointer, useOverlayState, useSelectionIds } from "./useStores";

const HANDLE_PX = 8;
const DOT_R = 5;

type Props = { doc: BoardDoc; selection: SelectionStore; overlays: OverlayStore; camera: CameraStore };

const toScreen = (c: Camera, x: number, y: number) => ({ x: (x - c.x) * c.z, y: (y - c.y) * c.z });

/** `<g>` placing a rect given in canvas units (rotated about its centre) into screen space. */
function RotatedBox({ c, rect, rotation, children }: { c: Camera; rect: Rect; rotation: number; children: (w: number, h: number) => React.ReactNode }) {
  const p = toScreen(c, rect.x + rect.w / 2, rect.y + rect.h / 2);
  return (
    <g transform={`translate(${p.x} ${p.y}) rotate(${(rotation * 180) / Math.PI})`}>{children(rect.w * c.z, rect.h * c.z)}</g>
  );
}

function ownRect(o: CanvasObject): { rect: Rect; rotation: number } {
  return o.type === "arrow" || o.type === "group" ? { rect: boundsOf(o), rotation: 0 } : { rect: { x: o.x, y: o.y, w: o.w, h: o.h }, rotation: o.rotation };
}

/**
 * Selection outline, handles, rotate handle, marquee and drop-target highlight, drawn in screen space above the
 * objects so lines and handles keep a constant size at every zoom. Handle hit-testing is done by the select tool.
 */
export function SelectionOverlay({ doc, selection, overlays, camera }: Props) {
  const cam = useCamera(camera);
  const ids = useSelectionIds(selection);
  const state = useOverlayState(overlays);
  const coarse = useCoarsePointer();
  const [, bump] = useReducer((n: number) => n + 1, 0);

  // Selected objects change while they are dragged, resized or edited elsewhere.
  useEffect(
    () =>
      doc.onChange((changed) => {
        for (const id of changed) {
          if (ids.has(id) || id === state.highlight) {
            bump();
            return;
          }
        }
      }),
    [doc, ids, state.highlight],
  );

  const box = selectionBox(doc, ids);
  const objects = [...ids].flatMap((id) => {
    const o = doc.get(id);
    return o ? [o] : [];
  });
  const locked = objects.length > 0 && objects.every((o) => o.locked);
  const highlight = state.highlight ? doc.get(state.highlight) : undefined;
  const hit = (coarse ? HANDLE_HIT_PX.coarse : HANDLE_HIT_PX.fine) * 2;

  return (
    <svg
      aria-hidden="true"
      data-selection-overlay=""
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "hidden", pointerEvents: "none" }}
    >
      {highlight ? (
        <RotatedBox c={cam} {...ownRect(highlight)}>
          {(w, h) => (
            <rect x={-w / 2} y={-h / 2} width={w} height={h} fill="var(--color-selection-fill)" stroke="var(--color-selection)" strokeWidth={2} />
          )}
        </RotatedBox>
      ) : null}

      {objects.length > 1
        ? objects.map((o) => (
            <RotatedBox key={o.id} c={cam} {...ownRect(o)}>
              {(w, h) => <rect x={-w / 2} y={-h / 2} width={w} height={h} fill="none" stroke="var(--color-selection)" strokeWidth={1} opacity={0.6} />}
            </RotatedBox>
          ))
        : null}

      {box ? (
        <RotatedBox c={cam} rect={box.rect} rotation={box.rotation}>
          {(w, h) => (
            <>
              <rect
                data-selection-box=""
                x={-w / 2}
                y={-h / 2}
                width={w}
                height={h}
                fill="none"
                stroke="var(--color-selection)"
                strokeWidth={1}
                strokeDasharray={locked ? "4 3" : undefined}
              />
              {box.resizable ? (
                <>
                  <line x1={0} y1={-h / 2} x2={0} y2={-h / 2 - ROTATE_OFFSET_PX + DOT_R} stroke="var(--color-selection)" strokeWidth={1} />
                  <circle data-handle="rotate" cx={0} cy={-h / 2 - ROTATE_OFFSET_PX} r={DOT_R} fill="var(--color-selection)" stroke="var(--color-surface)" strokeWidth={1.5} />
                  {visibleHandles(box, cam.z).map(({ handle }) => {
                    const u = HANDLE_UNIT[handle];
                    const x = (u.x - 0.5) * w;
                    const y = (u.y - 0.5) * h;
                    return (
                      <g key={handle} data-handle={handle} transform={`translate(${x} ${y})`}>
                        <rect x={-hit / 2} y={-hit / 2} width={hit} height={hit} fill="transparent" />
                        <rect x={-HANDLE_PX / 2} y={-HANDLE_PX / 2} width={HANDLE_PX} height={HANDLE_PX} rx={1.5} fill="var(--color-surface)" stroke="var(--color-selection)" strokeWidth={1.5} />
                      </g>
                    );
                  })}
                </>
              ) : null}
            </>
          )}
        </RotatedBox>
      ) : null}

      {state.marquee
        ? (() => {
            const a = toScreen(cam, state.marquee.x, state.marquee.y);
            return (
              <rect
                data-marquee=""
                x={a.x}
                y={a.y}
                width={state.marquee.w * cam.z}
                height={state.marquee.h * cam.z}
                fill="var(--color-selection-fill)"
                stroke="var(--color-selection)"
                strokeWidth={1}
              />
            );
          })()
        : null}
    </svg>
  );
}
