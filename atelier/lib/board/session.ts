import { deleteLocalBoardDoc } from "@/components/home/board-docs";
import { folderPath } from "@/components/home/library";
import { getAssetResolver } from "@/lib/assets/resolver";
import { AssetUploader, type AssetUploaderOptions } from "@/lib/assets/upload-queue";
import type { BoardDoc } from "@/lib/engine/doc/board-doc";
import { firstFrameName } from "@/lib/engine/model/templates";
import { createBrowserClient } from "@/lib/supabase/client";
import { patchBoard, putBoard, readBoardList, removeBoard } from "@/lib/sync/board-list-cache";
import { createHttpSyncApi } from "@/lib/sync/http-api";
import { openLocalBoard } from "@/lib/sync/local-store";
import { createRealtimeLink } from "@/lib/sync/realtime";
import { SyncClient, type RealtimeLink, type SyncApi, type SyncClientOptions } from "@/lib/sync/sync-client";

export type OpenedBoard = {
  doc: BoardDoc;
  /** Null in local-only mode: there is no server to sync with. */
  sync: SyncClient | null;
  uploader: AssetUploader;
  /** The stored copy was unreadable and is being rebuilt from the server. */
  rebuilt: boolean;
  /** Push what is queued, then stop everything and release the document. */
  dispose(): Promise<void>;
};

export type OpenResult = { status: "ready"; board: OpenedBoard } | { status: "not-found" };

export type OpenBoardOptions = {
  boardId: string;
  /** `ATELIER_LOCAL_ONLY` as the server saw it: no sync, no uploads, no server calls. */
  localOnly: boolean;
  fetchFn?: typeof fetch;
  createSyncApi?: () => SyncApi;
  /** Default: the Supabase realtime channel, when a client is configured. */
  createRealtime?: (boardId: string) => RealtimeLink | undefined;
  syncOptions?: SyncClientOptions;
  resolver?: AssetUploaderOptions["resolver"];
  uploaderOptions?: Partial<AssetUploaderOptions>;
};

const UNSEEN_AFTER_SEQ = 999_999_999_999_999; // 15 digits: the largest the updates route accepts, so the answer is empty

/**
 * Does the server know this board (for this owner)? "not-found" only on a clear 404; anything else (offline, a server
 * hiccup, a login redirect) is "unknown", and the board opens from what this device has.
 */
export async function probeBoard(boardId: string, fetchFn: typeof fetch = (...a) => globalThis.fetch(...a)): Promise<"found" | "not-found" | "unknown"> {
  try {
    const res = await fetchFn(`/api/boards/${encodeURIComponent(boardId)}/updates?after=${UNSEEN_AFTER_SEQ}`, { cache: "no-store" });
    if (res.ok) return "found";
    return res.status === 404 ? "not-found" : "unknown";
  } catch {
    return "unknown";
  }
}

function defaultRealtime(boardId: string): RealtimeLink | undefined {
  const client = createBrowserClient();
  return client ? createRealtimeLink(client, boardId) : undefined;
}

/**
 * Opens a board for editing: its document from IndexedDB, then (signed in) the sync client with its realtime link, and
 * the image uploader. Local-only: no SyncClient, and the uploader never touches `/api/assets` (images stay local blobs);
 * an unknown id becomes an empty board that is listed on the home screen. Signed in, an id that is not in the home list
 * and has nothing on this device is checked with the server first: a clear 404 gives `not-found` and nothing is kept.
 */
export async function openBoardSession(opts: OpenBoardOptions): Promise<OpenResult> {
  const { boardId, localOnly } = opts;
  const { doc, persistence, rebuilt } = await openLocalBoard(boardId);

  const list = await readBoardList();
  const listed = [...list.boards, ...list.trash].some((b) => b.id === boardId);
  const hasContent = doc.all().length > 0;

  if (!localOnly && !listed && !hasContent) {
    if ((await probeBoard(boardId, opts.fetchFn)) === "not-found") {
      doc.destroy();
      await persistence.destroy();
      await deleteLocalBoardDoc(boardId);
      return { status: "not-found" };
    }
  }

  if (localOnly && !listed) {
    const now = new Date().toISOString();
    await putBoard({
      id: boardId,
      title: doc.meta.title,
      folderId: null,
      starred: false,
      updatedAt: now,
      lastOpenedAt: null,
      deletedAt: null,
      preview: [],
      firstFrameName: firstFrameName(doc),
    });
  }

  // Opening counts as "recent" on this device right away (leaving also records it, and tells the server).
  if (listed) void patchBoard(boardId, { lastOpenedAt: new Date().toISOString() });

  let sync: SyncClient | null = null;
  if (!localOnly) {
    const api = opts.createSyncApi ? opts.createSyncApi() : createHttpSyncApi(opts.fetchFn);
    const realtime = opts.createRealtime ? opts.createRealtime(boardId) : defaultRealtime(boardId);
    sync = new SyncClient(boardId, doc, api, { ...opts.syncOptions, realtime });
    sync.start();
  }

  const uploader = new AssetUploader({ doc, resolver: opts.resolver ?? getAssetResolver(), localOnly, ...opts.uploaderOptions });

  let disposed = false;
  return {
    status: "ready",
    board: {
      doc,
      sync,
      uploader,
      rebuilt,
      async dispose() {
        if (disposed) return;
        disposed = true;
        try {
          await sync?.flush();
        } catch {
          /* flush never rejects; belt and braces */
        }
        sync?.stop();
        uploader.dispose();
        doc.destroy();
        await persistence.destroy();
      },
    },
  };
}

/** Title and folder breadcrumb for the top bar: the home list is the source of truth, the document's own title the fallback. */
export async function loadBoardMeta(boardId: string, doc: BoardDoc): Promise<{ title: string; breadcrumb: string[] }> {
  const list = await readBoardList();
  const board = [...list.boards, ...list.trash].find((b) => b.id === boardId);
  if (!board) return { title: doc.meta.title || "Untitled", breadcrumb: [] };
  const path = board.folderId ? folderPath(list.folders, board.folderId) : "";
  return { title: board.title || "Untitled", breadcrumb: path ? path.split(" / ") : [] };
}

export type RenameResult = { ok: true } | { ok: false; reason: "offline" | "rejected" };

/**
 * Rename a board from the editor. The home list on this device changes first (it is the source of truth for titles);
 * signed in, the server is told next, and a refusal or a missing connection puts the old title back.
 */
export async function renameBoard(opts: { boardId: string; title: string; localOnly: boolean; fetchFn?: typeof fetch; now?: number }): Promise<RenameResult> {
  const { boardId, title, localOnly } = opts;
  const updatedAt = new Date(opts.now ?? Date.now()).toISOString();
  const list = await readBoardList();
  const existing = [...list.boards, ...list.trash].find((b) => b.id === boardId);
  const previous = existing?.title ?? null;
  const write = (t: string) =>
    existing
      ? patchBoard(boardId, { title: t, updatedAt })
      : putBoard({ id: boardId, title: t, folderId: null, starred: false, updatedAt, lastOpenedAt: null, deletedAt: null, preview: [] });
  await write(title);
  if (localOnly) return { ok: true };
  const f = opts.fetchFn ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a));
  let res: Response | null = null;
  try {
    res = await f(`/api/boards/${encodeURIComponent(boardId)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ title }) });
  } catch {
    res = null;
  }
  if (res?.ok) return { ok: true };
  if (previous !== null) await patchBoard(boardId, { title: previous });
  else await removeBoard(boardId);
  return { ok: false, reason: res ? "rejected" : "offline" };
}
