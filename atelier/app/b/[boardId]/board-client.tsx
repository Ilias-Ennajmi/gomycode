"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import { useRouter } from "next/navigation";
import { getAssetResolver } from "@/lib/assets/resolver";
import { AssetUploader } from "@/lib/assets/upload-queue";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import type { Camera } from "@/lib/engine/geometry/camera";
import { SpatialIndex } from "@/lib/engine/spatial/spatial-index";
import { CanvasView, type CanvasHandle } from "@/components/canvas/CanvasView";
import { EditorProvider } from "@/components/editor/EditorContext";
import { EditorOverlays } from "@/components/editor/EditorOverlays";
import { SETTINGS_KEY, loadSettings, saveSettings, type NavSettings } from "@/lib/settings";

type Session = { doc: BoardDoc; index: SpatialIndex; uploader: AssetUploader; camera: Camera | undefined };

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
  const handle = useRef<CanvasHandle | null>(null);
  // The canvas handle as state: the editor (commands, panels, clipboard) mounts once the canvas exists.
  const [canvas, setCanvas] = useState<CanvasHandle | null>(null);
  const canvasRef = useCallback((h: CanvasHandle | null) => {
    handle.current = h;
    setCanvas(h);
  }, []);
  const router = useRouter();
  const [settings, setSettings] = useState<NavSettings>(() => loadSettings());

  useEffect(() => {
    let cancelled = false;
    const ydoc = new Y.Doc();
    const persistence = new IndexeddbPersistence(`atelier-board-${boardId}`, ydoc);
    let opened: { doc: BoardDoc; index: SpatialIndex; uploader: AssetUploader } | null = null;
    void persistence.whenSynced.then(() => {
      if (cancelled) return;
      const doc = new BoardDoc(ydoc);
      const index = new SpatialIndex(doc);
      const uploader = new AssetUploader({ doc, resolver: getAssetResolver() });
      opened = { doc, index, uploader };
      setSession({ doc, index, uploader, camera: loadCamera(boardId) });
    });
    return () => {
      cancelled = true;
      opened?.uploader.dispose();
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

  // Navigation settings (snapping, wheel) live here so the snap command can change them for this tab right away;
  // another tab or the settings page changing them arrives as a storage event.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === SETTINGS_KEY) setSettings(loadSettings());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  const toggleSnap = () =>
    setSettings((cur) => {
      const next = { ...cur, snap: !cur.snap };
      saveSettings(next);
      return next;
    });

  return (
    <main style={{ position: "fixed", inset: 0, background: "var(--color-bg)" }}>
      {session ? (
        <CanvasView
          ref={canvasRef}
          doc={session.doc}
          index={session.index}
          assets={getAssetResolver()}
          initialCamera={session.camera}
          settings={settings}
          cameraShortcuts={false /* the command registry binds Shift+1/2 and Mod +/-/0 */}
        />
      ) : null}
      {session && canvas ? (
        <EditorProvider handle={canvas} uploader={session.uploader} onToggleSnap={toggleSnap} navigate={(href) => router.push(href)}>
          <EditorOverlays />
        </EditorProvider>
      ) : null}
    </main>
  );
}
