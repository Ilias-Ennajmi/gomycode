import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { newId } from "@/lib/ids";
import { idbDone, idbOpen, idbRequest } from "./idb-util";

export const localBoardDbName = (boardId: string) => `atelier-board-${boardId}`;
export const syncDbName = (boardId: string) => `atelier-sync-${boardId}`;

// ---- sync bookkeeping (lastSeq, baseline flag, unsent updates) ---------------------------------------------

const META = "meta";
const UNSENT = "unsent";

export type UnsentRow = { key: number; update: Uint8Array };

/**
 * Per-board sync state in IndexedDB, next to (not inside) the y-indexeddb store: the last server seq applied, whether
 * the board's existing content was queued once, and the local updates not yet accepted by the server. Falls back to
 * memory when IndexedDB is unavailable (the app keeps working, a reload just loses the queue).
 */
export class SyncStore {
  private db: IDBDatabase | null = null;
  private opened: Promise<void> | null = null;
  private mem = { lastSeq: 0, baselined: false, unsent: new Map<number, Uint8Array>(), nextKey: 1 };

  constructor(readonly name: string) {}

  /** Idempotent. Never rejects: on failure the store runs in memory. */
  open(): Promise<void> {
    this.opened ??= idbOpen(this.name, (db) => {
      db.createObjectStore(META);
      db.createObjectStore(UNSENT, { autoIncrement: true });
    })
      .then((db) => {
        this.db = db;
      })
      .catch(() => {
        this.db = null;
      });
    return this.opened;
  }

  close(): void {
    this.db?.close();
    this.db = null;
    this.opened = null;
  }

  private async meta<T>(key: string): Promise<T | undefined> {
    await this.open();
    if (!this.db) return (this.mem as Record<string, unknown>)[key] as T | undefined;
    return idbRequest(this.db.transaction(META, "readonly").objectStore(META).get(key)) as Promise<T | undefined>;
  }

  private async setMeta(key: string, value: unknown): Promise<void> {
    await this.open();
    if (!this.db) {
      (this.mem as Record<string, unknown>)[key] = value;
      return;
    }
    const tx = this.db.transaction(META, "readwrite");
    tx.objectStore(META).put(value, key);
    await idbDone(tx);
  }

  async getLastSeq(): Promise<number> {
    const v = await this.meta<number>("lastSeq");
    return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
  }
  setLastSeq(seq: number): Promise<void> {
    return this.setMeta("lastSeq", seq);
  }
  async isBaselined(): Promise<boolean> {
    return (await this.meta<boolean>("baselined")) === true;
  }
  setBaselined(): Promise<void> {
    return this.setMeta("baselined", true);
  }

  /** Append an update; resolves once it is durable. */
  async addUnsent(update: Uint8Array): Promise<number> {
    await this.open();
    if (!this.db) {
      const key = this.mem.nextKey++;
      this.mem.unsent.set(key, update);
      return key;
    }
    const tx = this.db.transaction(UNSENT, "readwrite");
    const req = tx.objectStore(UNSENT).add(update);
    await idbDone(tx);
    return req.result as number;
  }

  async listUnsent(): Promise<UnsentRow[]> {
    await this.open();
    if (!this.db) return [...this.mem.unsent].map(([key, update]) => ({ key, update }));
    const store = this.db.transaction(UNSENT, "readonly").objectStore(UNSENT);
    const [keys, values] = await Promise.all([idbRequest(store.getAllKeys()), idbRequest(store.getAll())]);
    return keys.map((k, i) => ({ key: k as number, update: values[i] as Uint8Array }));
  }

  async countUnsent(): Promise<number> {
    await this.open();
    if (!this.db) return this.mem.unsent.size;
    return idbRequest(this.db.transaction(UNSENT, "readonly").objectStore(UNSENT).count());
  }

  async deleteUnsent(keys: number[]): Promise<void> {
    await this.open();
    if (!this.db) {
      for (const k of keys) this.mem.unsent.delete(k);
      return;
    }
    const tx = this.db.transaction(UNSENT, "readwrite");
    for (const k of keys) tx.objectStore(UNSENT).delete(k);
    await idbDone(tx);
  }

  /** Forget the server position (the local document was lost); unsent updates are kept. */
  async resetPosition(): Promise<void> {
    await this.setMeta("lastSeq", 0);
  }
}

// ---- the board document on this device ---------------------------------------------------------------------

function deleteDb(name: string): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

/**
 * "ok" when the stored document replays cleanly, "empty" when there is none, "corrupt" when it cannot be read.
 * y-indexeddb applies stored updates inside a promise callback, so damaged data would hang whenSynced forever;
 * looking first lets us rebuild from the server instead.
 */
async function inspectStoredBoard(name: string): Promise<"ok" | "empty" | "corrupt"> {
  if (typeof indexedDB === "undefined") return "empty";
  const db = await new Promise<IDBDatabase | null | "corrupt">((resolve) => {
    let created = false;
    const req = indexedDB.open(name);
    req.onupgradeneeded = () => {
      created = true;
      req.transaction?.abort(); // it did not exist: do not leave an empty shell behind
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(created ? null : "corrupt");
    req.onblocked = () => resolve("corrupt");
  });
  if (db === null) return "empty";
  if (db === "corrupt") return "corrupt";
  try {
    if (!db.objectStoreNames.contains("updates")) return "corrupt";
    const values = (await idbRequest(db.transaction("updates", "readonly").objectStore("updates").getAll())) as unknown[];
    if (values.length === 0) return "empty";
    const scratch = new Y.Doc();
    for (const v of values) {
      if (!(v instanceof Uint8Array)) return "corrupt";
      Y.applyUpdate(scratch, v);
    }
    return "ok";
  } catch {
    return "corrupt";
  } finally {
    db.close();
  }
}

let persistAsked = false;
/** Ask the browser not to evict this site's storage. Once per page load, failure ignored (SPEC §3.4). */
export async function requestPersistentStorage(): Promise<void> {
  if (persistAsked) return;
  persistAsked = true;
  try {
    const key = "atelier-persist-requested";
    if (localStorage.getItem(key)) return;
    if (typeof navigator !== "undefined" && navigator.storage?.persist) {
      await navigator.storage.persist();
      localStorage.setItem(key, "1");
    }
  } catch {
    /* not supported or blocked */
  }
}

/**
 * Open a board's Yjs document from IndexedDB (db `atelier-board-{id}`). If the stored copy is unreadable it is
 * deleted and `rebuilt` is true: the document starts empty and the SyncClient refills it from the server.
 */
export async function openLocalBoard(
  boardId: string,
): Promise<{ doc: BoardDoc; persistence: IndexeddbPersistence; rebuilt: boolean }> {
  const name = localBoardDbName(boardId);
  let rebuilt = false;
  if ((await inspectStoredBoard(name)) === "corrupt") {
    console.warn(`atelier: the stored copy of board ${boardId} is unreadable; rebuilding it from the server`);
    await deleteDb(name);
    const store = new SyncStore(syncDbName(boardId));
    await store.resetPosition().catch(() => {});
    store.close();
    rebuilt = true;
  }
  const ydoc = new Y.Doc();
  const persistence = new IndexeddbPersistence(name, ydoc);
  await persistence.whenSynced;
  void requestPersistentStorage();
  return { doc: new BoardDoc(ydoc), persistence, rebuilt };
}

let memoryDeviceId: string | null = null;
/** A stable id for this browser profile, sent with every update so history can say which device wrote it. */
export function getDeviceId(): string {
  try {
    const existing = localStorage.getItem("atelier-device-id");
    if (existing) return existing;
    const id = newId();
    localStorage.setItem("atelier-device-id", id);
    return id;
  } catch {
    return (memoryDeviceId ??= newId());
  }
}
