"use client";

import type { CameraStore } from "@/lib/engine/input/camera-store";
import type { OverlayStore } from "@/lib/engine/input/tool-machine";
import { StrokeView } from "./objects/StrokeView";
import { useCamera, useOverlayState } from "./useStores";

/** The stroke being drawn, shown above the objects until the pen is lifted (then it becomes a document object). */
export function DraftOverlay({ overlays, camera }: { overlays: OverlayStore; camera: CameraStore }) {
  const cam = useCamera(camera);
  const { draft } = useOverlayState(overlays);
  if (!draft) return null;
  return (
    <div
      aria-hidden="true"
      data-draft-overlay=""
      style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          transformOrigin: "0 0",
          transform: `translate(${-cam.x * cam.z}px, ${-cam.y * cam.z}px) scale(${cam.z})`,
        }}
      >
        <div style={{ position: "absolute", left: 0, top: 0, width: draft.w, height: draft.h, transform: `translate(${draft.x}px, ${draft.y}px)` }}>
          <StrokeView obj={draft} />
        </div>
      </div>
    </div>
  );
}
