"use client";

import { useSyncExternalStore } from "react";
import type { BoardDoc } from "@/lib/engine/doc/board-doc";

/** The board-wide grayscale preview (`meta.valueCheck`), live. Without a doc it is off. */
export function useValueCheck(doc: BoardDoc | undefined): boolean {
  return useSyncExternalStore(
    (cb) => (doc ? doc.onMetaChange((keys) => keys.has("valueCheck") && cb()) : () => {}),
    () => (doc ? doc.meta.valueCheck : false),
    () => false,
  );
}
