"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { BoardDoc } from "@/lib/engine/doc/board-doc";
import type { CanvasObject } from "@/lib/engine/model/types";

/**
 * Per-object subscriptions on top of BoardDoc.onChange: one doc listener fans out to the components that watch the
 * ids that actually changed, so an edit re-renders only the objects it touched.
 */
class Dispatcher {
  private readonly byId = new Map<string, Set<() => void>>();
  private off: (() => void) | null = null;

  constructor(private readonly doc: BoardDoc) {}

  subscribe(id: string, cb: () => void): () => void {
    let set = this.byId.get(id);
    if (!set) {
      set = new Set();
      this.byId.set(id, set);
    }
    set.add(cb);
    this.off ??= this.doc.onChange((ids) => this.dispatch(ids));
    return () => {
      const s = this.byId.get(id);
      if (!s) return;
      s.delete(cb);
      if (s.size === 0) this.byId.delete(id);
      if (this.byId.size === 0) {
        this.off?.();
        this.off = null;
      }
    };
  }

  private dispatch(ids: Set<string>): void {
    for (const id of ids) {
      const set = this.byId.get(id);
      if (set) for (const cb of [...set]) cb();
    }
  }
}

const dispatchers = new WeakMap<BoardDoc, Dispatcher>();

function dispatcherFor(doc: BoardDoc): Dispatcher {
  let d = dispatchers.get(doc);
  if (!d) {
    d = new Dispatcher(doc);
    dispatchers.set(doc, d);
  }
  return d;
}

const NOTHING = () => undefined;

/** The current immutable snapshot of one object (undefined when missing or invalid); re-renders when it changes. */
export function useDocObject(doc: BoardDoc, id: string | null): CanvasObject | undefined {
  const subscribe = useCallback(
    (cb: () => void) => (id ? dispatcherFor(doc).subscribe(id, cb) : NOTHING),
    [doc, id],
  );
  const get = useCallback(() => (id ? doc.get(id) : undefined), [doc, id]);
  return useSyncExternalStore(subscribe, get, NOTHING);
}
