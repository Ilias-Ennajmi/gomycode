"use client";

import { useEffect } from "react";
import { AnalysisScheduler } from "@/lib/assets/analysis-scheduler";
import { getAssetMetaStore, type AssetMetaStore } from "@/lib/assets/meta-store";
import { getAssetResolver } from "@/lib/assets/resolver";
import type { AssetResolver } from "@/lib/assets/resolver-types";
import { bindHighlight, getHighlightStore } from "@/lib/engine/color/highlight";
import { PaletteController } from "@/lib/engine/color/palette-controller";
import { useEditor } from "./EditorContext";

/**
 * The colour machinery of an open board, with no UI of its own: the live palette objects follow the pictures
 * (PaletteController), a highlighted colour dims the pictures without it (bindHighlight), and pictures that never had
 * their colours worked out get analysed when the browser is idle (AnalysisScheduler). Mount once inside <EditorProvider>.
 */
export function ColorServices({ meta: metaProp, resolver: resolverProp }: { meta?: AssetMetaStore; resolver?: Pick<AssetResolver, "url"> } = {}) {
  const { handle } = useEditor();
  const { doc, selection, images } = handle;
  const container = handle.container();

  useEffect(() => {
    const controller = new PaletteController({ doc, meta: metaProp ?? getAssetMetaStore() });
    controller.start();
    return () => controller.stop();
  }, [doc, metaProp]);

  useEffect(() => {
    const store = getHighlightStore();
    store.set(null);
    const off = bindHighlight({ doc, meta: metaProp ?? getAssetMetaStore(), images, store, selection, container });
    return () => {
      off();
      store.set(null);
    };
  }, [doc, selection, images, container, metaProp]);

  useEffect(() => {
    const scheduler = new AnalysisScheduler({ doc, meta: metaProp ?? getAssetMetaStore(), resolver: resolverProp ?? getAssetResolver() });
    scheduler.start();
    return () => scheduler.stop();
  }, [doc, metaProp, resolverProp]);

  return null;
}
