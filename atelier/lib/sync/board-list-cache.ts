/*
 * The board list kept in IndexedDB, so the home screen opens offline. Two jobs:
 *   - signed in: a mirror of the last list the server sent (read-only while offline);
 *   - local-only mode: the list itself (there is no server).
 *
 * Every function is fail-soft: when IndexedDB is missing or blocked (private windows, some
 * previews) reads are empty and writes do nothing, and the app still works from memory.
 */

export type BoardSummary = {
  id: string;
  title: string;
  folderId: string | null;
  starred: boolean;
  updatedAt: string;
  lastOpenedAt: string | null;
  /** Set while the board is in the trash. */
  deletedAt: string | null;
  /** Up to four image asset ids shown as the card's mosaic. */
  preview: string[];
  /**
   * Known only on this device (the server does not store it): name of the board's first frame,
   * shown on cards that have no images yet. Kept across server refreshes.
   */
  firstFrameName?: string | null;
};

export type Folder = { id: string; name: string; parentId: string | null; sort: number };

export type BoardList = { boards: BoardSummary[]; trash: BoardSummary[]; folders: Folder[] };

export const TRASH_DAYS = 30;
const DAY_MS = 86_400_000;

const DB_NAME = "atelier-board-list";
const BOARDS = "boards";
const FOLDERS = "folders";

const emptyList = (): BoardList => ({ boards: [], trash: [], folders: [] });

/** Live boards, and boards deleted within the last 30 days (the trash). Older deletions are dropped. */
export function splitBoards(all: BoardSummary[], now: number = Date.now()): { boards: BoardSummary[]; trash: BoardSummary[] } {
  const boards: BoardSummary[] = [];
  const trash: BoardSummary[] = [];
  for (const b of all) {
    if (!b.deletedAt) boards.push(b);
    else if (isInTrash(b.deletedAt, now)) trash.push(b);
  }
  return { boards, trash };
}

export function isInTrash(deletedAt: string, now: number = Date.now()): boolean {
  const t = Date.parse(deletedAt);
  return Number.isFinite(t) && now - t <= TRASH_DAYS * DAY_MS;
}

// ---- IndexedDB plumbing --------------------------------------------------------------------------------

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(BOARDS)) db.createObjectStore(BOARDS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(FOLDERS)) db.createObjectStore(FOLDERS, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("blocked"));
  });
}

/** Runs `fn` in one transaction and resolves with its result once the transaction has committed. */
async function withStores<T>(mode: IDBTransactionMode, fn: (boards: IDBObjectStore, folders: IDBObjectStore) => Promise<T> | T): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction([BOARDS, FOLDERS], mode);
      let result: T;
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error("aborted"));
      Promise.resolve(fn(tx.objectStore(BOARDS), tx.objectStore(FOLDERS))).then(
        (r) => {
          result = r;
        },
        (e) => {
          reject(e);
          try {
            tx.abort();
          } catch {
            /* already finished */
          }
        },
      );
    });
  } finally {
    db.close();
  }
}

const request = <T>(r: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

/** Never throws: a failed write is only a missed cache. */
async function quietly(run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch {
    /* IndexedDB unavailable */
  }
}

// ---- reads ---------------------------------------------------------------------------------------------

export async function readBoardList(now: number = Date.now()): Promise<BoardList> {
  try {
    const [all, folders] = await withStores("readonly", async (b, f) => [
      (await request(b.getAll())) as BoardSummary[],
      (await request(f.getAll())) as Folder[],
    ]);
    return { ...splitBoards(all, now), folders };
  } catch {
    return emptyList();
  }
}

// ---- writes --------------------------------------------------------------------------------------------

/** Mirror the server's answer. Keeps facts only this device knows (first frame names). */
export function replaceBoardList(list: BoardList): Promise<void> {
  return quietly(() =>
    withStores("readwrite", async (b, f) => {
      const old = new Map(((await request(b.getAll())) as BoardSummary[]).map((x) => [x.id, x]));
      b.clear();
      f.clear();
      for (const x of [...list.boards, ...list.trash]) {
        const local = old.get(x.id);
        b.put(local?.firstFrameName !== undefined && x.firstFrameName === undefined ? { ...x, firstFrameName: local.firstFrameName } : x);
      }
      for (const x of list.folders) f.put(x);
    }),
  );
}

export function putBoard(board: BoardSummary): Promise<void> {
  return quietly(() => withStores("readwrite", (b) => void b.put(board)));
}

/** Merge `patch` into a stored board; does nothing when the board is not stored. */
export function patchBoard(id: string, patch: Partial<BoardSummary>): Promise<void> {
  return quietly(() =>
    withStores("readwrite", async (b) => {
      const cur = (await request(b.get(id))) as BoardSummary | undefined;
      if (cur) b.put({ ...cur, ...patch, id });
    }),
  );
}

export function removeBoard(id: string): Promise<void> {
  return quietly(() => withStores("readwrite", (b) => void b.delete(id)));
}

export function putFolder(folder: Folder): Promise<void> {
  return quietly(() => withStores("readwrite", (_b, f) => void f.put(folder)));
}

export function removeFolder(id: string): Promise<void> {
  return quietly(() => withStores("readwrite", (_b, f) => void f.delete(id)));
}

/** Forget boards that have been in the trash for more than 30 days; returns the ids removed. */
export async function purgeExpiredTrash(now: number = Date.now()): Promise<string[]> {
  const removed: string[] = [];
  await quietly(() =>
    withStores("readwrite", async (b) => {
      for (const x of (await request(b.getAll())) as BoardSummary[]) {
        if (x.deletedAt && !isInTrash(x.deletedAt, now)) {
          b.delete(x.id);
          removed.push(x.id);
        }
      }
    }),
  );
  return removed;
}
