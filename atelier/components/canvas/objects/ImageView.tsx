"use client";

import type { AssetResolver } from "@/lib/assets/resolver-types";
import type { BoardDoc } from "@/lib/engine/doc/board-doc";
import { imageClip, imageStyle } from "@/lib/engine/model/image-style";
import type { ImageObj } from "@/lib/engine/model/types";
import { useLod, W1024_LIMIT } from "../lod";
import { useValueCheck } from "../useValueCheck";

/**
 * `crop` is normalised (0..1) to the source image. The w1024 variant is used while the image is at most 1024 device
 * pixels wide on screen, the original above that. A missing URL (asset not available yet) shows a quiet placeholder.
 */
export function ImageView({ obj, assets, doc }: { obj: ImageObj; assets: AssetResolver; doc?: BoardDoc }) {
  const { zoom, dpr } = useLod();
  const valueCheck = useValueCheck(doc);
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

  return (
    <div style={{ position: "absolute", inset: 0, ...imageClip(obj) }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- canvas bitmaps come from the asset resolver, already sized */}
      <img
        src={src}
        alt=""
        decoding="async"
        draggable={false}
        style={imageStyle(obj, valueCheck)}
      />
    </div>
  );
}
