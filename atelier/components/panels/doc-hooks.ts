"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { BoardDoc } from "@/lib/engine/doc/board-doc";
import type { SelectionStore } from "@/lib/engine/input/selection-store";
import { MEDIA_DESKTOP } from "./layout";

/** The current selection (a new Set whenever it changes). */
export function useSelectionIds(selection: SelectionStore): ReadonlySet<string> {
  return useSyncExternalStore(
    (cb) => selection.subscribe(cb),
    () => selection.ids,
    () => selection.ids,
  );
}

const frame = (cb: () => void): (() => void) => {
  if (typeof requestAnimationFrame === "function") {
    const h = requestAnimationFrame(cb);
    return () => cancelAnimationFrame(h);
  }
  const h = setTimeout(cb, 16);
  return () => clearTimeout(h);
};

/**
 * A counter that goes up (at most once per animation frame) when the document changes in a way `relevant` cares about.
 * Use it as a dependency to recompute things derived from the document. Without `relevant` every change counts.
 */
export function useDocTick(doc: BoardDoc, relevant?: (changed: Set<string>) => boolean): number {
  const [tick, setTick] = useState(0);
  const filter = useRef(relevant);
  useEffect(() => {
    filter.current = relevant;
  });
  useEffect(() => {
    let cancel: (() => void) | null = null;
    const off = doc.onChange((changed) => {
      if (filter.current && !filter.current(changed)) return;
      if (cancel) return;
      cancel = frame(() => {
        cancel = null;
        setTick((t) => t + 1);
      });
    });
    return () => {
      off();
      cancel?.();
    };
  }, [doc]);
  return tick;
}

function subscribeQuery(query: string, cb: () => void): () => void {
  if (typeof matchMedia !== "function") return () => {};
  const mq = matchMedia(query);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

/** Whether a media query matches. `fallback` is used on the server and where matchMedia does not exist. */
export function useMediaQuery(query: string, fallback: boolean): boolean {
  return useSyncExternalStore(
    (cb) => subscribeQuery(query, cb),
    () => (typeof matchMedia === "function" ? matchMedia(query).matches : fallback),
    () => fallback,
  );
}

/** True at 768 px and wider: panels dock on the right instead of rising as a bottom sheet. */
export function useIsDesktop(): boolean {
  return useMediaQuery(MEDIA_DESKTOP, true);
}
