/** Where public/sw-share.js keeps what the share sheet sent until the Inbox page takes it. */
export const SHARE_DB = "atelier-share-inbox";
export const SHARE_STORE = "shares";

export interface SharedFile {
  name: string;
  type: string;
  blob: Blob;
}

/** One share: what the OS handed over (already capped and filtered by the service worker). */
export interface SharedPayload {
  id: string;
  receivedAt: string;
  title: string;
  text: string;
  url: string;
  files: SharedFile[];
  /** Files the worker left out (too many, too large, not an allowed type). */
  skipped: number;
}

function open(idb: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = idb.open(SHARE_DB, 1);
    // Normally created by the service worker; made here too so the page can read before any share arrived.
    req.onupgradeneeded = () => req.result.createObjectStore(SHARE_STORE, { autoIncrement: true });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
    req.onblocked = () => reject(new Error("IndexedDB is blocked"));
  });
}

const request = <T>(r: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error("IndexedDB request failed"));
  });

/**
 * Hands every stored share to `handler`, oldest first, and removes one only after its handler resolved. A handler that
 * rejects leaves its payload (and everything after it) stored and ends the drain: the next call picks up from there.
 * Resolves with how many were handled; never rejects (no IndexedDB means nothing was shared).
 */
export async function drainShares(idb: IDBFactory, handler: (p: SharedPayload) => Promise<void>): Promise<number> {
  let db: IDBDatabase;
  try {
    db = await open(idb);
  } catch {
    return 0;
  }
  let done = 0;
  try {
    const store = () => db.transaction(SHARE_STORE, "readonly").objectStore(SHARE_STORE);
    const keys = await request(store().getAllKeys());
    for (const key of keys) {
      const payload = (await request(store().get(key))) as SharedPayload | undefined;
      if (payload) {
        try {
          await handler(payload);
        } catch {
          break;
        }
      }
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(SHARE_STORE, "readwrite");
        tx.objectStore(SHARE_STORE).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = tx.onabort = () => reject(tx.error ?? new Error("IndexedDB delete failed"));
      });
      done++;
    }
  } catch {
    /* a storage error: what was handled stays handled; the rest is retried next time */
  } finally {
    db.close();
  }
  return done;
}
