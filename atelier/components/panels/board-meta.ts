"use client";

import { useSyncExternalStore } from "react";
import type { BoardDoc } from "@/lib/engine/doc/board-doc";

/** The board's layout gutter (`meta.gutter`, px), live. */
export function useGutter(doc: BoardDoc): number {
  return useSyncExternalStore(
    (cb) => doc.onMetaChange((keys) => keys.has("gutter") && cb()),
    () => doc.meta.gutter,
    () => 16,
  );
}

/** Board settings are written through these (plain functions: the doc is shared state, not a component's own). */
export function setGutter(doc: BoardDoc, px: number): void {
  doc.meta.gutter = px;
}

export function setValueCheck(doc: BoardDoc, on: boolean): void {
  doc.meta.valueCheck = on;
}

export function setShowCredits(doc: BoardDoc, on: boolean): void {
  doc.meta.showCredits = on;
}
