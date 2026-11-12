"use client";

import { memo, useMemo, useRef, useSyncExternalStore, type KeyboardEvent, type PointerEvent } from "react";
import { useDocTick } from "@/components/panels/doc-hooks";
import { useEditor } from "@/components/editor/EditorContext";
import { boundsOf, unionRects } from "@/lib/engine/geometry/rect";
import type { CanvasObject, Rect } from "@/lib/engine/model/types";

const WIDTH = 200;
const HEIGHT = 140;
/** World margin around the content, as a share of its size. */
const MARGIN = 0.08;
/** More objects than this are drawn as a sample, so a huge board still maps cheaply. */
const MAX_DRAWN = 3000;

type MiniObject = { id: string; r: Rect; kind: "frame" | "other" };

const MiniObjects = memo(function MiniObjects({ objects }: { objects: MiniObject[] }) {
  return (
    <g>
      {objects.map((o) =>
        o.kind === "frame" ? (
          <rect key={o.id} data-mini-object="" x={o.r.x} y={o.r.y} width={o.r.w} height={o.r.h} fill="none" stroke="var(--color-muted)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        ) : (
          <rect key={o.id} data-mini-object="" x={o.r.x} y={o.r.y} width={o.r.w} height={o.r.h} fill="var(--color-muted)" opacity={0.55} />
        ),
      )}
    </g>
  );
});

/**
 * A map of the board: a plain rectangle per object (never the images) and the visible area. Press or drag on it to move
 * the camera there; arrow keys pan. Hidden below 768 px (it would cover the board on a phone).
 */
export function Minimap({ open }: { open: boolean }) {
  const { handle } = useEditor();
  const { doc } = handle;
  const tick = useDocTick(doc);
  const cam = useSyncExternalStore(handle.subscribeCamera, handle.getCamera, handle.getCamera);
  const el = useRef<HTMLDivElement>(null);
  const dragging = useRef<number | null>(null);
  const vp = handle.viewport();
  const viewW = vp.w > 0 ? vp.w : WIDTH;
  const viewH = vp.h > 0 ? vp.h : HEIGHT;

  const objects = useMemo<MiniObject[]>(() => {
    void tick;
    const all = doc.all().filter((o: CanvasObject) => o.type !== "group");
    const stride = all.length > MAX_DRAWN ? Math.ceil(all.length / MAX_DRAWN) : 1;
    return all.filter((_, i) => i % stride === 0).map((o) => ({ id: o.id, r: boundsOf(o), kind: o.type === "frame" ? "frame" : "other" }));
  }, [doc, tick]);

  const content = useMemo(() => unionRects(objects.map((o) => o.r)), [objects]);

  if (!open) return null;

  const view: Rect = { x: cam.x, y: cam.y, w: viewW / cam.z, h: viewH / cam.z };
  const box = content ? unionRects([content, view])! : view;
  const mx = box.w * MARGIN;
  const my = box.h * MARGIN;
  const world: Rect = { x: box.x - mx, y: box.y - my, w: box.w + mx * 2, h: box.h + my * 2 };
  // Fit the world box into the map, keeping its aspect ratio, centred.
  const scale = Math.min(WIDTH / world.w, HEIGHT / world.h);
  const offX = (WIDTH - world.w * scale) / 2;
  const offY = (HEIGHT - world.h * scale) / 2;

  const moveTo = (clientX: number, clientY: number) => {
    const r = el.current?.getBoundingClientRect();
    if (!r || r.width === 0 || r.height === 0) return;
    // the map's pixels are scaled to its CSS size (it may be rendered smaller)
    const kx = WIDTH / r.width;
    const ky = HEIGHT / r.height;
    const wx = world.x + ((clientX - r.left) * kx - offX) / scale;
    const wy = world.y + ((clientY - r.top) * ky - offY) / scale;
    const z = handle.getCamera().z;
    handle.cancelCameraAnimation();
    handle.setCamera({ x: wx - viewW / 2 / z, y: wy - viewH / 2 / z, z });
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    dragging.current = e.pointerId;
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      /* the pointer is gone */
    }
    moveTo(e.clientX, e.clientY);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragging.current === e.pointerId) moveTo(e.clientX, e.clientY);
  };
  const end = (e: PointerEvent<HTMLDivElement>) => {
    if (dragging.current !== e.pointerId) return;
    dragging.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = 0.2;
    const c = handle.getCamera();
    const dx = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
    const dy = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
    if (!dx && !dy) return;
    e.preventDefault();
    handle.cancelCameraAnimation();
    handle.setCamera({ ...c, x: c.x + (dx * step * viewW) / c.z, y: c.y + (dy * step * viewH) / c.z });
  };

  const sx = (x: number) => (x - world.x) * scale + offX;
  const sy = (y: number) => (y - world.y) * scale + offY;

  return (
    <div data-minimap="" className="hidden md:block">
      <div
        ref={el}
        role="button"
        tabIndex={0}
        aria-label="Minimap. Click or drag to move the view, arrow keys to pan."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={end}
        onPointerCancel={end}
        onKeyDown={onKeyDown}
        style={{ width: WIDTH, height: HEIGHT, touchAction: "none" }}
        className="cursor-pointer overflow-hidden rounded-lg border border-line bg-panel shadow-2"
      >
        <svg aria-hidden="true" width="100%" height="100%" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="block">
          <g transform={`translate(${offX - world.x * scale} ${offY - world.y * scale}) scale(${scale})`}>
            <MiniObjects objects={objects} />
          </g>
          <rect
            data-mini-viewport=""
            x={sx(view.x)}
            y={sy(view.y)}
            width={view.w * scale}
            height={view.h * scale}
            fill="var(--color-selection-fill)"
            stroke="var(--color-selection)"
            strokeWidth={1.5}
          />
        </svg>
      </div>
    </div>
  );
}
