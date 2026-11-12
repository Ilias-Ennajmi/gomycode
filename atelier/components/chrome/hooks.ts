"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { Editor } from "@tiptap/core";
import type { CanvasHandle } from "@/components/canvas/CanvasView";
import type { BoardDoc } from "@/lib/engine/doc/board-doc";
import type { EditingStore } from "@/lib/engine/input/editing-store";
import type { ToolId, ToolMachine } from "@/lib/engine/input/tool-machine";

/** Zoom factor of the canvas, live. */
export function useZoom(handle: CanvasHandle): number {
  const subscribe = useCallback((cb: () => void) => handle.subscribeCamera(cb), [handle]);
  return useSyncExternalStore(
    subscribe,
    () => handle.getCamera().z,
    () => 1,
  );
}

/** What undo and redo can do right now. */
export function useUndoState(doc: BoardDoc): { canUndo: boolean; canRedo: boolean } {
  const [, bump] = useState(0);
  useEffect(() => {
    const um = doc.undoManager;
    const tick = () => bump((n) => n + 1);
    um.on("stack-item-added", tick);
    um.on("stack-item-popped", tick);
    um.on("stack-cleared", tick);
    const off = doc.onChange(tick);
    return () => {
      um.off("stack-item-added", tick);
      um.off("stack-item-popped", tick);
      um.off("stack-cleared", tick);
      off();
    };
  }, [doc]);
  return { canUndo: doc.canUndo(), canRedo: doc.canRedo() };
}

/** The active tool and whether it is locked. */
export function useActiveTool(machine: ToolMachine): { id: ToolId; locked: boolean } {
  const subscribe = useCallback((cb: () => void) => machine.subscribe(cb), [machine]);
  const key = useSyncExternalStore(
    subscribe,
    () => `${machine.id}|${machine.locked ? 1 : 0}`,
    () => "select|0",
  );
  const [id, locked] = key.split("|");
  return { id: id as ToolId, locked: locked === "1" };
}

/** The live editor of the object being edited (null when none), and re-renders when its selection or marks change. */
export function useLiveEditor(editing: EditingStore): Editor | null {
  const subscribe = useCallback((cb: () => void) => editing.subscribe(cb), [editing]);
  const editor = useSyncExternalStore(
    subscribe,
    () => editing.editor,
    () => null,
  );
  const [, bump] = useState(0);
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    let raf = 0;
    const tick = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        bump((n) => n + 1);
      });
    };
    editor.on("transaction", tick);
    editor.on("selectionUpdate", tick);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      if (!editor.isDestroyed) {
        editor.off("transaction", tick);
        editor.off("selectionUpdate", tick);
      }
    };
  }, [editor]);
  return editor;
}

/**
 * A boolean that is remembered per device (a collapsed section). Only for components that never render on the server
 * (the editor chrome mounts after the board has loaded in the browser), so reading storage while rendering is safe.
 */
export function useStoredFlag(key: string, initial: boolean): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw === "1" ? true : raw === "0" ? false : initial;
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (v: boolean) => {
      setValue(v);
      try {
        localStorage.setItem(key, v ? "1" : "0");
      } catch {
        /* not remembered */
      }
    },
    [key],
  );
  return [value, set];
}

/** The window's inner width in CSS px (1024 on the server). */
export function useViewportWidth(): number {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener("resize", cb);
      return () => window.removeEventListener("resize", cb);
    },
    () => window.innerWidth,
    () => 1024,
  );
}
