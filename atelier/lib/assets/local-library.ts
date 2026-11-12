import * as Y from "yjs";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { clusterByHash, similarMap } from "@/lib/assets/library-cluster";
import { readBoardList } from "@/lib/sync/board-list-cache";
import { idbDone, idbOpen, idbRequest } from "@/lib/sync/idb-util";
import { filterAndSort } from "./library-query";
import type { LibraryApi, RemoveResult } from "./library-client";
import type { DuplicateGroup, LibraryAsset } from "./library-types";
import { UPLOADS_DB } from "./upload-queue";
import { collectAssetIds } from "./usage-tracker";
import { isVariantName } from "./variants";

/*
 * The library in local-only mode (no account, no server, no R2): the assets are the blobs this device keeps in
 * IndexedDB (`atelier-uploads`), the boards are the ones in the local board list, and "used in" is read from each board's
 * own document on this device. Nothing here touches the network.
 */

type Board = { id: string; title: string };

export type LocalLibraryDeps = {
  /** Boards on this device that are not in the trash. Default: the local board list. */
  boards?: () => Promise<Board[]>;
  /** Asset ids a board uses. Default: read the board's document from IndexedDB; null when this device has no copy. */
  boardAssets?: (boardId: string) => Promise<string[] | null>;
  dbName?: string;
};

type StoredMeta = {
  assetId: string;
  name?: string;
  mime: string;
  bytes: number;
  width: number;
  height: number;
  kind?: "image" | "gif" | "video";
  variants?: string[];
  hash?: string | null;
  phash?: string | null;
  palette?: { hex: string; weight: number }[] | null;
  provenance?: { sourceUrl: string | null; credit: string; licence: string; capturedAt: string | null } | null;
  createdAt: number;
};

async function defaultBoards(): Promise<Board[]> {
  const list = await readBoardList();
  return list.boards.map((b) => ({ id: b.id, title: b.title }));
}

async function defaultBoardAssets(boardId: string): Promise<string[] | null> {
  const { readLocalBoardState } = await import("@/components/home/board-docs");
  const state = await readLocalBoardState(boardId);
  if (!state) return null;
  const ydoc = new Y.Doc();
  try {
    Y.applyUpdate(ydoc, state);
    const doc = new BoardDoc(ydoc);
    const ids = collectAssetIds(doc);
    doc.destroy();
    return ids;
  } finally {
    ydoc.destroy();
  }
}

async function openUploads(dbName: string): Promise<IDBDatabase | null> {
  return idbOpen(dbName, (d) => {
    d.createObjectStore(UPLOADS_DB.meta, { keyPath: "assetId" });
    d.createObjectStore(UPLOADS_DB.blobs);
  }).catch(() => null);
}

/** Which of the given assets each local board uses. */
async function localUsage(deps: LocalLibraryDeps): Promise<Map<string, Board[]>> {
  const boards = await (deps.boards ?? defaultBoards)().catch(() => []);
  const used = new Map<string, Board[]>();
  for (const b of boards) {
    const ids = await (deps.boardAssets ?? defaultBoardAssets)(b.id).catch(() => null);
    for (const id of ids ?? []) (used.get(id) ?? used.set(id, []).get(id)!).push(b);
  }
  return used;
}

async function readLocalAssets(deps: LocalLibraryDeps): Promise<LibraryAsset[]> {
  const db = await openUploads(deps.dbName ?? UPLOADS_DB.name);
  if (!db) return [];
  let metas: StoredMeta[] = [];
  try {
    metas = (await idbRequest(db.transaction(UPLOADS_DB.meta, "readonly").objectStore(UPLOADS_DB.meta).getAll())) as StoredMeta[];
  } catch {
    /* unreadable: show an empty library rather than an error */
  } finally {
    db.close();
  }
  const usage = await localUsage(deps);
  const hashed = metas.map((m) => ({ id: m.assetId, phash: m.hash ?? m.phash ?? null }));
  const similar = similarMap(hashed);
  const out: LibraryAsset[] = [];
  for (const m of metas) {
    if (!(m.width > 0) || !(m.height > 0)) continue;
    const boards = usage.get(m.assetId) ?? [];
    out.push({
      id: m.assetId,
      kind: m.kind ?? "image",
      width: m.width,
      height: m.height,
      bytes: m.bytes,
      variants: (m.variants ?? []).filter(isVariantName),
      palette: m.palette ?? null,
      phash: m.hash ?? m.phash ?? null,
      title: m.name ?? "",
      provenance: m.provenance ?? null,
      analysisVersion: m.palette ? 1 : 0,
      usedIn: boards.length,
      boards: boards.slice(0, 5),
      createdAt: new Date(m.createdAt).toISOString(),
      similarTo: similar.get(m.assetId) ?? [],
    });
  }
  return out;
}

export function createLocalLibraryApi(deps: LocalLibraryDeps = {}): LibraryApi {
  return {
    async list(filter) {
      return filterAndSort(await readLocalAssets(deps), filter).slice(0, 200);
    },
    async duplicates(): Promise<DuplicateGroup[]> {
      const assets = await readLocalAssets(deps);
      return clusterByHash(assets.map((a) => ({ id: a.id, phash: a.phash })));
    },
    async remove(assetId): Promise<RemoveResult> {
      const usage = await localUsage(deps);
      const boards = usage.get(assetId) ?? [];
      if (boards.length > 0) return { ok: false, reason: "in-use", message: "A board still uses this picture. Take it off those boards first." };
      const db = await openUploads(deps.dbName ?? UPLOADS_DB.name);
      if (!db) return { ok: false, reason: "failed", message: "Couldn't reach this device's storage. Nothing was removed." };
      try {
        const tx = db.transaction([UPLOADS_DB.meta, UPLOADS_DB.blobs], "readwrite");
        tx.objectStore(UPLOADS_DB.meta).delete(assetId);
        tx.objectStore(UPLOADS_DB.blobs).delete(assetId);
        await idbDone(tx);
        return { ok: true };
      } catch {
        return { ok: false, reason: "failed", message: "Couldn't delete it from this device. Nothing was removed." };
      } finally {
        db.close();
      }
    },
  };
}
