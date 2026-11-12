"use client";

import type { AssetResolver } from "@/lib/assets/resolver-types";
import type { ImageObj } from "@/lib/engine/model/types";
import { useLod, W1024_LIMIT } from "../lod";

/**
 * `crop` is normalised (0..1) to the source image. The w1024 variant is used while the image is at most 1024 device
 * pixels wide on screen, the original above that. A missing URL (asset not available yet) shows a quiet placeholder.
 */
export function ImageView({ obj, assets }: { obj: ImageObj; assets: AssetResolver }) {
  const { zoom, dpr } = useLod();
  const fullW = obj.w / (obj.crop && obj.crop.w > 0 ? obj.crop.w : 1);
  const original = fullW * zoom * dpr > W1024_LIMIT;
  const preferred = assets.url(obj.assetId, original ? "original" : "w1024");
  const src = preferred ?? assets.url(obj.assetId, original ? "w1024" : "original");

  if (!src) {
    return (
      <div
        aria-hidden="true"
        style={{ position: "absolute", inset: 0, background: "var(--color-border)", borderRadius: "var(--radius-sm)" }}
      />
    );
  }

  const crop = obj.crop && obj.crop.w > 0 && obj.crop.h > 0 ? obj.crop : null;
  const flip = `scale(${obj.flipX ? -1 : 1}, ${obj.flipY ? -1 : 1})`;
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- canvas bitmaps come from the asset resolver, already sized */}
      <img
        src={src}
        alt=""
        decoding="async"
        draggable={false}
        style={
          crop
            ? {
                position: "absolute",
                width: obj.w / crop.w,
                height: obj.h / crop.h,
                left: (-crop.x / crop.w) * obj.w,
                top: (-crop.y / crop.h) * obj.h,
                maxWidth: "none",
                transform: flip,
                userSelect: "none",
              }
            : { width: "100%", height: "100%", objectFit: "cover", display: "block", transform: flip, userSelect: "none" }
        }
      />
    </div>
  );
}
