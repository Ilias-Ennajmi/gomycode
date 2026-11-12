"use client";

import { useSyncExternalStore } from "react";
import type { BoardDoc } from "@/lib/engine/doc/board-doc";

/** The credits overlay switch (`meta.showCredits`), live. Without a doc it is off. */
export function useShowCredits(doc: BoardDoc | undefined): boolean {
  return useSyncExternalStore(
    (cb) => (doc ? doc.onMetaChange((keys) => keys.has("showCredits") && cb()) : () => {}),
    () => (doc ? doc.meta.showCredits : false),
    () => false,
  );
}
