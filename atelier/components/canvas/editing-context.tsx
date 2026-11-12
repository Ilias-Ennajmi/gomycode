"use client";

import { createContext, useCallback, useContext, useSyncExternalStore } from "react";
import type { EditingStore } from "@/lib/engine/input/editing-store";

export type EditingContextValue = {
  store: EditingStore;
  /** Close the editor and give the keyboard back to the canvas. */
  done(): void;
};

export const EditingContext = createContext<EditingContextValue | null>(null);

/**
 * True while object `id` is being edited. Only the object that starts or stops editing re-renders: the snapshot is a
 * boolean per id, not the id of whatever is being edited.
 */
export function useIsEditing(id: string): boolean {
  const ctx = useContext(EditingContext);
  const store = ctx?.store;
  const subscribe = useCallback((cb: () => void) => (store ? store.subscribe(cb) : () => {}), [store]);
  return useSyncExternalStore(
    subscribe,
    () => store?.id === id,
    () => false,
  );
}

export function useEditingDone(): () => void {
  const ctx = useContext(EditingContext);
  return ctx?.done ?? (() => {});
}

/** Options the editing session was started with (initial text, select all). Read once when the editor mounts. */
export function useEditingStart(): { initialText: string; selectAll: boolean } {
  const ctx = useContext(EditingContext);
  return { initialText: ctx?.store.initialText ?? "", selectAll: ctx?.store.selectAll ?? false };
}

/** Id of the object being edited (null when none). Re-renders on every change of it: for overlays, not for objects. */
export function useEditingId(): string | null {
  const ctx = useContext(EditingContext);
  const store = ctx?.store;
  const subscribe = useCallback((cb: () => void) => (store ? store.subscribe(cb) : () => {}), [store]);
  return useSyncExternalStore(
    subscribe,
    () => store?.id ?? null,
    () => null,
  );
}
