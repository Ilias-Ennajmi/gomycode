"use client";

import { useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import type { AssetResolver } from "@/lib/assets/resolver-types";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import type { Camera } from "@/lib/engine/geometry/camera";
import { SpatialIndex } from "@/lib/engine/spatial/spatial-index";
import { CanvasView, type CanvasHandle } from "@/components/canvas/CanvasView";

// Until the asset pipeline lands (Task 17) every image shows its placeholder.
const stubAssets: AssetResolver = { url: () => null };

type Session = { doc: BoardDoc; index: SpatialIndex; camera: Camera | undefined };

const cameraKey = (boardId: string) => `atelier-camera-${boardId}`;

function loadCamera(boardId: string): Camera | undefined {
  try {
    const raw = localStorage.getItem(cameraKey(boardId));
    if (!raw) return undefined;
    const c = JSON.parse(raw) as Partial<Camera>;
    return typeof c.x === "number" && typeof c.y === "number" && typeof c.z === "number" ? (c as Camera) : undefined;
  } catch {
    return undefined;
  }
}

function saveCamera(boardId: string, c: Camera): void {
  try {
    localStorage.setItem(cameraKey(boardId), JSON.stringify(c));
  } catch {
    // private mode or storage full: the camera simply is not remembered
  }
}

/**
 * Local-only board: the Yjs document lives in IndexedDB (`atelier-board-{id}`). Server sync replaces the opening
 * code in a later task; the canvas itself does not change.
 */
export function BoardClient({ boardId }: { boardId: string }) {
  const [session, setSession] = useState<Session | null>(null);
  const handle = useRef<CanvasHandle>(null);

  useEffect(() => {
    let cancelled = false;
    const ydoc = new Y.Doc();
    const persistence = new IndexeddbPersistence(`atelier-board-${boardId}`, ydoc);
    let opened: { doc: BoardDoc; index: SpatialIndex } | null = null;
    void persistence.whenSynced.then(() => {
      if (cancelled) return;
      const doc = new BoardDoc(ydoc);
      const index = new SpatialIndex(doc);
      opened = { doc, index };
      setSession({ doc, index, camera: loadCamera(boardId) });
    });
    return () => {
      cancelled = true;
      opened?.index.destroy();
      opened?.doc.destroy();
      void persistence.destroy();
      ydoc.destroy();
      setSession(null);
    };
  }, [boardId]);

  // Remember where the view was, per board, on this device.
  useEffect(() => {
    if (!session) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = handle.current?.subscribeCamera((c) => {
      clearTimeout(timer);
      timer = setTimeout(() => saveCamera(boardId, c), 500);
    });
    return () => {
      clearTimeout(timer);
      off?.();
    };
  }, [session, boardId]);

  // Development and test hook: `localStorage["atelier:expose"] = "1"` publishes the live board on `window.__atelier`.
  useEffect(() => {
    if (!session) return;
    try {
      if (localStorage.getItem("atelier:expose") !== "1") return;
    } catch {
      return;
    }
    const w = window as unknown as { __atelier?: unknown };
    w.__atelier = { doc: session.doc, index: session.index, canvas: handle.current };
    return () => {
      delete w.__atelier;
    };
  }, [session]);

  return (
    <main style={{ position: "fixed", inset: 0, background: "var(--color-bg)" }}>
      {session ? (
        <CanvasView
          ref={handle}
          doc={session.doc}
          index={session.index}
          assets={stubAssets}
          initialCamera={session.camera}
        />
      ) : null}
    </main>
  );
}
