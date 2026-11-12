"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { Camera } from "@/lib/engine/geometry/camera";
import type { CameraStore } from "@/lib/engine/input/camera-store";
import type { OverlayState, OverlayStore } from "@/lib/engine/input/tool-machine";
import type { SelectionStore } from "@/lib/engine/input/selection-store";

/** The live camera as a React value: re-renders on every camera change (overlays need that, objects do not). */
export function useCamera(store: CameraStore): Camera {
  const subscribe = useCallback((cb: () => void) => store.subscribe(cb), [store]);
  return useSyncExternalStore(subscribe, () => store.get(), () => store.get());
}

export function useSelectionIds(selection: SelectionStore): ReadonlySet<string> {
  const subscribe = useCallback((cb: () => void) => selection.subscribe(cb), [selection]);
  return useSyncExternalStore(subscribe, () => selection.ids, () => selection.ids);
}

export function useOverlayState(overlays: OverlayStore): OverlayState {
  const subscribe = useCallback((cb: () => void) => overlays.subscribe(cb), [overlays]);
  return useSyncExternalStore(subscribe, () => overlays.state, () => overlays.state);
}

function subscribeCoarse(cb: () => void): () => void {
  const mq = typeof matchMedia === "function" ? matchMedia("(pointer: coarse)") : null;
  mq?.addEventListener("change", cb);
  return () => mq?.removeEventListener("change", cb);
}

/** True on devices whose primary pointer is coarse (touch): handles get 44 px hit areas. */
export function useCoarsePointer(): boolean {
  return useSyncExternalStore(
    subscribeCoarse,
    () => (typeof matchMedia === "function" ? matchMedia("(pointer: coarse)").matches : false),
    () => false,
  );
}
