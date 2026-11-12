"use client";

import { useCallback, useLayoutEffect, useEffect, useRef } from "react";
import type { AssetResolver } from "@/lib/assets/resolver-types";
import type { BoardDoc } from "@/lib/engine/doc/board-doc";
import type { Camera } from "@/lib/engine/geometry/camera";
import type { ImageObj } from "@/lib/engine/model/types";
import type { ImageLayer, ImageLayerItem } from "@/lib/engine/render/image-layer";
import { buildImageItems } from "@/lib/engine/render/image-items";

type Latest = {
  ids: readonly string[];
  camera: Camera;
  viewport: { w: number; h: number };
  dpr: number;
  captionFor?: (obj: ImageObj) => string | null;
};

/**
 * Keeps an ImageLayer in step with the board: a full update whenever the set of visible images or the view changes,
 * and an incremental one (only the touched images are rebuilt) when the document, the asset resolver or the board-wide
 * value check changes. Everything runs synchronously with the change, so images never lag a frame behind the other
 * objects while they are dragged.
 */
export function useImageLayerFeed(opts: {
  doc: BoardDoc;
  layer: ImageLayer;
  assets: AssetResolver;
  /** Visible image ids, bottom-most first. */
  ids: readonly string[];
  camera: Camera;
  viewport: { w: number; h: number };
  dpr: number;
  captionFor?: (obj: ImageObj) => string | null;
}): void {
  const { doc, layer, assets, ids, camera, viewport, dpr, captionFor } = opts;
  const latest = useRef<Latest>({ ids, camera, viewport, dpr, captionFor });
  const items = useRef(new Map<string, ImageLayerItem>());

  const push = useCallback(() => {
    const l = latest.current;
    layer.update([...items.current.values()], { camera: l.camera, viewport: l.viewport, dpr: l.dpr });
  }, [layer]);

  const rebuild = useCallback(
    (only?: ReadonlySet<string>) => {
      const l = latest.current;
      const valueCheck = doc.meta.valueCheck;
      const fresh = buildImageItems(doc, only ? [...only].filter((id) => items.current.has(id)) : l.ids, { valueCheck, captionFor: l.captionFor });
      if (only) {
        for (const id of only) if (items.current.has(id) && !doc.get(id)) items.current.delete(id);
        for (const it of fresh) items.current.set(it.id, it);
      } else {
        items.current = new Map(fresh.map((it) => [it.id, it]));
      }
      push();
    },
    [doc, push],
  );

  // New visible set or view: everything is rebuilt.
  useLayoutEffect(() => {
    latest.current = { ids, camera, viewport, dpr, captionFor };
    rebuild();
  }, [ids, camera, viewport, dpr, captionFor, rebuild, layer]);

  useEffect(() => {
    const offDoc = doc.onChange((changed) => {
      let touched: Set<string> | null = null;
      for (const id of changed) {
        if (items.current.has(id)) (touched ??= new Set()).add(id);
      }
      if (touched) rebuild(touched);
    });
    const offMeta = doc.onMetaChange((keys) => {
      if (keys.has("valueCheck")) rebuild(new Set(items.current.keys()));
    });
    // An upload registered or metadata arrived: URLs and the variants on offer may differ now.
    const offAssets = assets.subscribe?.(() => rebuild(new Set(items.current.keys())));
    return () => {
      offDoc();
      offMeta();
      offAssets?.();
    };
  }, [doc, assets, rebuild]);
}
