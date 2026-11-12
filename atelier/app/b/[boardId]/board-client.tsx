"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { getAssetResolver } from "@/lib/assets/resolver";
import { AssetUploader } from "@/lib/assets/upload-queue";
import { BoardMessage, BoardOpening } from "@/components/board/BoardMessage";
import { useAddRequest } from "@/components/board/useAddRequest";
import { createInboxClient } from "@/lib/inbox/client-factory";
import type { InboxClient } from "@/lib/inbox/inbox-client";
import { loadBoardMeta, openBoardSession, renameBoard, type OpenedBoard } from "@/lib/board/session";
import { recordLeave } from "@/lib/board/leave";
import { markBoardReady } from "@/lib/board/ready";
import type { BoardDoc } from "@/lib/engine/doc/board-doc";
import type { Camera } from "@/lib/engine/geometry/camera";
import { SpatialIndex } from "@/lib/engine/spatial/spatial-index";
import { CanvasView, type CanvasHandle } from "@/components/canvas/CanvasView";
import { toast } from "@/components/chrome/Toast";
import { EditorChrome } from "@/components/chrome/EditorChrome";
import { ColorServices } from "@/components/editor/ColorServices";
import { EditorProvider } from "@/components/editor/EditorContext";
import { EditorOverlays } from "@/components/editor/EditorOverlays";
import { SETTINGS_KEY, loadSettings, saveSettings, type NavSettings } from "@/lib/settings";
import type { SyncStatus } from "@/lib/sync/status";

type Session = {
  doc: BoardDoc;
  index: SpatialIndex;
  uploader: AssetUploader;
  inbox: InboxClient;
  sync: OpenedBoard["sync"];
  camera: Camera | undefined;
  title: string;
  breadcrumb: string[];
};

type Phase = { kind: "opening" } | { kind: "not-found" } | { kind: "ready"; session: Session };

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

const noop = () => {};

/** The sync client's status as React state; local-only boards have no client and are always "saved". */
function useSyncStatus(sync: OpenedBoard["sync"]): SyncStatus {
  return useSyncExternalStore(
    (cb) => (sync ? sync.onStatus(cb) : noop),
    () => sync?.status ?? "saved",
    () => "saved",
  );
}

/**
 * The board editor. The Yjs document lives in IndexedDB (`atelier-board-{id}`); signed in, a SyncClient keeps it in step
 * with the server (and a realtime ping from other devices), in local-only mode (decided on the server, passed as a prop)
 * nothing leaves the device. Leaving the board records when it was opened and which images preview it.
 */
export function BoardClient({ boardId, localOnly }: { boardId: string; localOnly: boolean }) {
  const [phase, setPhase] = useState<Phase>({ kind: "opening" });
  const handle = useRef<CanvasHandle | null>(null);
  // The canvas handle as state: the editor (commands, panels, clipboard) mounts once the canvas exists.
  const [canvas, setCanvas] = useState<CanvasHandle | null>(null);
  const canvasRef = useCallback((h: CanvasHandle | null) => {
    handle.current = h;
    setCanvas(h);
  }, []);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const router = useRouter();
  const [settings, setSettings] = useState<NavSettings>(() => loadSettings());
  const [title, setTitle] = useState("");
  const [breadcrumb, setBreadcrumb] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    let opened: { board: OpenedBoard; index: SpatialIndex; inbox: InboxClient } | null = null;
    let left = false;

    const leave = () => {
      if (left || !opened) return;
      left = true;
      void recordLeave({ boardId, doc: opened.board.doc, localOnly });
    };
    // A page that is hidden may never come back: record now, and let a return from the back/forward cache start over.
    const onPageHide = () => {
      leave();
      void opened?.board.sync?.flush();
    };
    const onPageShow = () => {
      left = false;
    };

    void (async () => {
      const result = await openBoardSession({
        boardId,
        localOnly,
        // A dropped copy of a picture the library already has is reused, not uploaded again.
        uploaderOptions: { onDuplicate: ({ onBoard }) => toast({ message: onBoard ? "Already on this board." : "Already in your library. Reused." }) },
      });
      if (cancelled) {
        if (result.status === "ready") void result.board.dispose();
        return;
      }
      if (result.status === "not-found") {
        setPhase({ kind: "not-found" });
        return;
      }
      const board = result.board;
      const meta = await loadBoardMeta(boardId, board.doc);
      if (cancelled) {
        void board.dispose();
        return;
      }
      const index = new SpatialIndex(board.doc);
      // The Inbox: the panel, Quick capture and dropping its items on the canvas share this one client.
      const inbox = createInboxClient({ localOnly, uploader: board.uploader, onRejected: (_item, e) => toast({ message: e.message }) });
      opened = { board, index, inbox };
      window.addEventListener("pagehide", onPageHide);
      window.addEventListener("pageshow", onPageShow);
      setTitle(meta.title);
      setBreadcrumb(meta.breadcrumb);
      setPhase({ kind: "ready", session: { doc: board.doc, index, uploader: board.uploader, inbox, sync: board.sync, camera: loadCamera(boardId), title: meta.title, breadcrumb: meta.breadcrumb } });
    })();

    return () => {
      cancelled = true;
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      leave(); // reads the document now; the rest of the clean-up may destroy it
      opened?.index.destroy();
      opened?.inbox.dispose();
      void opened?.board.dispose();
      setPhase({ kind: "opening" });
    };
  }, [boardId, localOnly]);

  const session = phase.kind === "ready" ? phase.session : null;

  // Remember where the view was, per board, on this device.
  useEffect(() => {
    if (!session || !canvas) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = canvas.subscribeCamera((c) => {
      clearTimeout(timer);
      timer = setTimeout(() => saveCamera(boardId, c), 500);
    });
    return () => {
      clearTimeout(timer);
      off();
    };
  }, [session, canvas, boardId]);

  // Performance mark for the e2e budget: the first visible objects are on screen.
  useEffect(() => {
    if (!session || !canvas) return;
    return markBoardReady(canvas.container(), session.doc.all().length > 0);
  }, [session, canvas]);

  // "Add to board" from the library: place the asset it asked for in the middle of the view.
  useAddRequest(session?.doc ?? null, canvas, (message) => toast({ message }));

  // Development and test hook: `localStorage["atelier:expose"] = "1"` publishes the live board on `window.__atelier`.
  useEffect(() => {
    if (!session || !canvas) return;
    try {
      if (localStorage.getItem("atelier:expose") !== "1") return;
    } catch {
      return;
    }
    const w = window as unknown as { __atelier?: unknown };
    w.__atelier = { doc: session.doc, index: session.index, canvas, sync: session.sync, uploader: session.uploader };
    return () => {
      delete w.__atelier;
    };
  }, [session, canvas]);

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

  const status = useSyncStatus(session?.sync ?? null);

  const onTitleChange = useCallback(
    async (next: string) => {
      const previous = title;
      setTitle(next);
      const r = await renameBoard({ boardId, title: next, localOnly });
      if (!r.ok) {
        setTitle(previous);
        toast({ message: r.reason === "offline" ? "You're offline, so that change wasn't saved." : "Couldn't rename the board." });
      }
    },
    [boardId, localOnly, title],
  );

  if (phase.kind === "not-found") {
    return (
      <BoardMessage title="This board doesn't exist">
        It may have been deleted, or it belongs to a different account. Check the link, or go back to your boards.
      </BoardMessage>
    );
  }
  if (!session) return <BoardOpening />;

  return (
    <main style={{ position: "fixed", inset: 0, background: "var(--color-bg)" }}>
      <div ref={setSlot} data-chrome-slot="" />
      <CanvasView
        ref={canvasRef}
        doc={session.doc}
        index={session.index}
        assets={getAssetResolver()}
        initialCamera={session.camera}
        settings={settings}
        cameraShortcuts={false /* the command registry binds Shift+1/2 and Mod +/-/0 */}
      />
      {canvas ? (
        <EditorProvider handle={canvas} uploader={session.uploader} inbox={session.inbox} boardId={boardId} localOnly={localOnly} assets={getAssetResolver()} onToggleSnap={toggleSnap} navigate={(href) => router.push(href)}>
          <EditorChrome
            boardId={boardId}
            title={title}
            onTitleChange={(t) => void onTitleChange(t)}
            breadcrumb={breadcrumb}
            status={status}
            localOnly={localOnly}
            slot={slot}
          />
          <EditorOverlays />
          <ColorServices />
        </EditorProvider>
      ) : null}
    </main>
  );
}
