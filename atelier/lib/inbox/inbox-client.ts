import { backoffDelay } from "@/lib/sync/backoff";
import { INBOX_FULL_MESSAGE, INBOX_LIMIT, type InboxItem, type NewInboxItem } from "./types";

export type { InboxItem, InboxKind, NewInboxItem } from "./types";

/*
 * The Inbox as the browser sees it. One InboxClient serves the Inbox page, the editor's Inbox panel and Quick capture:
 *
 *   - every change (add, place, delete) is written to an IndexedDB queue FIRST and sent after, so capturing works offline
 *     and survives a reload; a send is retried 1 s, 2 s, 4 s ... up to 60 s and on `online`;
 *   - signed in, the items live on the server (/api/inbox); in local-only mode they live in IndexedDB too (createLocalInboxApi),
 *     through the very same client.
 */

export class InboxApiError extends Error {
  constructor(
    /** HTTP status; 0 = the server could not be reached. */
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface InboxListQuery {
  placed?: boolean;
  limit?: number;
  before?: string;
}

export interface InboxApi {
  create(item: NewInboxItem): Promise<{ id: string }>;
  list(q: InboxListQuery): Promise<{ items: InboxItem[]; unplaced: number }>;
  setPlaced(id: string, placed: boolean): Promise<void>;
  remove(id: string): Promise<void>;
  /** Several at once (the page's multi-select); optional so a small fake need not have it. */
  removeMany?(ids: string[]): Promise<void>;
}

export type InboxStatus = "idle" | "syncing" | "offline" | "needs-login";
export type ListedItem = InboxItem & { pending?: boolean };

type Op =
  | { op: "add"; localId: string; item: NewInboxItem; createdAt: string; placed?: boolean }
  | { op: "place"; id: string; /** false = take it back out of "placed" (an undo). Default true. */ placed?: boolean }
  | { op: "remove"; id: string };
type Queued = { key: number; op: Op };

const QUEUE_DB = "atelier-inbox-queue";
const OPS = "ops";

function openDb(idb: IDBFactory, name: string, upgrade: (db: IDBDatabase) => void): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let req: IDBOpenDBRequest;
    try {
      req = idb.open(name, 1);
    } catch (e) {
      reject(e);
      return;
    }
    req.onupgradeneeded = () => upgrade(req.result);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
    req.onblocked = () => reject(new Error("IndexedDB is blocked"));
  });
}
const req = <T>(r: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error("IndexedDB request failed"));
  });
const done = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
  });

const globalIdb = (): IDBFactory | undefined => (typeof indexedDB === "undefined" ? undefined : indexedDB);

export type InboxClientDeps = {
  api: InboxApi;
  idb?: IDBFactory;
  /** Waits between retries; the default is a timer that an `online` event cuts short. */
  delay?: (ms: number) => Promise<void>;
  /**
   * Whether an image or video item's asset has finished uploading (the server only accepts an item for an asset it has).
   * Items whose asset is not ready stay queued and are sent when `retry()` is called after the upload finished.
   */
  assetReady?: (assetId: string) => boolean;
  /** An item the server refused for good (too long, Inbox full ...): it is dropped from the queue and reported here. */
  onRejected?: (item: NewInboxItem, error: InboxApiError) => void;
};

const newLocalId = () => `local-${crypto.randomUUID()}`;

export class InboxClient {
  /** Resolves once the queue has been read back from IndexedDB. */
  readonly ready: Promise<void>;
  status: InboxStatus = "idle";

  private readonly d: InboxClientDeps;
  private ops: Queued[] = [];
  private db: Promise<IDBDatabase | null>;
  private memoryKey = 0;
  private cache: { items: InboxItem[]; unplaced: number } = { items: [], unplaced: 0 };
  private lastListed: ListedItem[] = [];
  private retriedFromList = 0;
  /** Items this client placed, so an undo can bring them back even though the server no longer lists them as waiting. */
  private readonly placedMemory = new Map<string, InboxItem>();
  private readonly listeners = new Set<() => void>();
  private running = false;
  private again = false;
  private attempt = 0;
  private timer = false;
  private disposed = false;
  private readonly wakers = new Set<() => void>();
  private readonly onOnline = () => {
    for (const w of [...this.wakers]) w();
    this.retry();
  };

  constructor(deps: InboxClientDeps) {
    this.d = deps;
    const idb = deps.idb ?? globalIdb();
    this.db = idb ? openDb(idb, QUEUE_DB, (db) => void db.createObjectStore(OPS, { autoIncrement: true })).catch(() => null) : Promise.resolve(null);
    if (typeof window !== "undefined") window.addEventListener("online", this.onOnline);
    this.ready = this.load();
  }

  /** Queued changes that have not reached the server (or the local store) yet. */
  pending(): number {
    return this.ops.length;
  }

  /** Items waiting to be placed, as far as this device knows (server count plus what is still queued). */
  unplaced(): number {
    let n = this.cache.unplaced;
    for (const { op } of this.ops) {
      if (op.op === "add" && !op.placed) n++;
      else if (op.op === "place" && op.placed !== false && this.cache.items.some((i) => i.id === op.id && !i.placedAt)) n--;
      else if (op.op === "place" && op.placed === false && (this.placedMemory.has(op.id) || this.cache.items.some((i) => i.id === op.id && !!i.placedAt))) n++;
      else if (op.op === "remove" && this.cache.items.some((i) => i.id === op.id && !i.placedAt)) n--;
    }
    return Math.max(0, n);
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  /** Persist the item in the queue, then send it. Resolves once it is safe on this device. */
  async add(item: NewInboxItem): Promise<void> {
    await this.ready;
    const op: Op = { op: "add", localId: newLocalId(), item, createdAt: new Date().toISOString() };
    await this.push(op);
    this.pump();
  }

  /** Unplaced items (pending ones first, newest first). Falls back to what it knew when the server cannot be reached. */
  async list(opts: { placed?: boolean; limit?: number } = {}): Promise<ListedItem[]> {
    await this.ready;
    const placed = opts.placed ?? false;
    try {
      const r = await this.d.api.list({ placed, limit: opts.limit ?? 100 });
      if (!placed) this.cache = { items: r.items, unplaced: r.unplaced };
      else this.cache = { items: [...this.cache.items.filter((i) => !i.placedAt), ...r.items], unplaced: this.cache.unplaced };
      if (this.status === "needs-login" || this.status === "offline") {
        // The server answered, so reading works. Queued changes get another try; with none, there is nothing to be offline about.
        if (this.ops.length === 0) this.setStatus("idle");
        else if (Date.now() - this.retriedFromList > 5000) {
          this.retriedFromList = Date.now(); // at most every 5 s: a send that keeps failing must not turn into a loop
          this.retry();
        }
      }
    } catch (e) {
      if (e instanceof InboxApiError && (e.status === 401 || e.status === 403)) this.setStatus("needs-login");
      else this.setStatus("offline");
    }
    this.lastListed = this.merged(placed);
    return this.lastListed;
  }

  /** An item from the last list() (what a panel is showing), by id; undefined when it is not there any more. */
  find(id: string): ListedItem | undefined {
    return this.lastListed.find((i) => i.id === id);
  }

  /** Mark an item placed on a board (or, with `false`, back to waiting: an undo). Queued when offline. */
  async markPlaced(id: string, placed = true): Promise<void> {
    await this.ready;
    const add = this.ops.find((o) => o.op.op === "add" && o.op.localId === id);
    if (add && add.op.op === "add") {
      add.op.placed = placed;
      await this.update(add);
    } else {
      const known = this.cache.items.find((i) => i.id === id) ?? this.lastListed.find((i) => i.id === id);
      if (placed && known && !(known as ListedItem).pending) this.placedMemory.set(id, { ...known });
      for (const o of this.ops.filter((x) => x.op.op === "place" && x.op.id === id)) await this.drop(o);
      await this.push({ op: "place", id, placed });
    }
    this.cache = { ...this.cache, items: this.cache.items.map((i) => (i.id === id ? { ...i, placedAt: placed ? (i.placedAt ?? new Date().toISOString()) : null } : i)) };
    this.emit();
    this.pump();
  }

  async remove(id: string): Promise<void> {
    await this.ready;
    const add = this.ops.find((o) => o.op.op === "add" && o.op.localId === id);
    if (add) {
      await this.drop(add);
    } else {
      for (const o of this.ops.filter((x) => x.op.op === "place" && x.op.id === id)) await this.drop(o);
      if (!this.ops.some((o) => o.op.op === "remove" && o.op.id === id)) await this.push({ op: "remove", id });
    }
    this.placedMemory.delete(id);
    this.cache = { ...this.cache, items: this.cache.items.filter((i) => i.id !== id) };
    this.emit();
    this.pump();
  }

  /** Try again now (back online, signed in again, an upload finished). */
  retry(): void {
    this.attempt = 0;
    this.pump();
  }

  dispose(): void {
    this.disposed = true;
    if (typeof window !== "undefined") window.removeEventListener("online", this.onOnline);
    for (const w of [...this.wakers]) w();
    this.listeners.clear();
    void this.db.then((db) => db?.close());
  }

  // ---- internals ---------------------------------------------------------------------------------------

  private emit(): void {
    for (const cb of [...this.listeners]) cb();
  }

  private setStatus(s: InboxStatus): void {
    if (this.status === s) return;
    this.status = s;
    this.emit();
  }

  private merged(placed: boolean): ListedItem[] {
    const removed = new Set(this.ops.filter((o) => o.op.op === "remove").map((o) => (o.op as { id: string }).id));
    const placedIds = new Set(this.ops.filter((o) => o.op.op === "place" && o.op.placed !== false).map((o) => (o.op as { id: string }).id));
    const waitingIds = new Set(this.ops.filter((o) => o.op.op === "place" && o.op.placed === false).map((o) => (o.op as { id: string }).id));
    const isPlaced = (i: InboxItem) => (placedIds.has(i.id) ? true : waitingIds.has(i.id) ? false : !!i.placedAt);
    const server = this.cache.items.filter((i) => !removed.has(i.id) && isPlaced(i) === placed);
    if (!placed) {
      // An undone placement: the server's list may not have it yet, this client remembers it.
      for (const id of waitingIds) {
        const back = this.placedMemory.get(id);
        if (back && !removed.has(id) && !server.some((i) => i.id === id)) server.push({ ...back, placedAt: null });
      }
      server.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
    }
    const pending: ListedItem[] = [];
    for (const { op } of this.ops) {
      if (op.op !== "add" || !!op.placed !== placed) continue;
      pending.push({ ...op.item, id: op.localId, createdAt: op.createdAt, placedAt: op.placed ? op.createdAt : null, pending: true });
    }
    pending.reverse();
    return [...pending, ...server];
  }

  private async load(): Promise<void> {
    const db = await this.db;
    if (!db) return;
    try {
      const store = () => db.transaction(OPS, "readonly").objectStore(OPS);
      const keys = (await req(store().getAllKeys())) as number[];
      const values = (await req(store().getAll())) as Op[];
      this.ops = keys.map((key, i) => ({ key, op: values[i] }));
    } catch {
      /* unreadable queue: start empty */
    }
    if (this.ops.length) {
      this.emit();
      this.pump();
    }
  }

  private async push(op: Op): Promise<void> {
    const db = await this.db;
    let key = ++this.memoryKey + 1e9;
    if (db) {
      try {
        const tx = db.transaction(OPS, "readwrite");
        key = (await req(tx.objectStore(OPS).add(op))) as number;
        await done(tx);
      } catch {
        /* IndexedDB refused: the change still goes out from memory */
      }
    }
    this.ops.push({ key, op });
    this.emit();
  }

  private async update(q: Queued): Promise<void> {
    const db = await this.db;
    if (!db) return;
    try {
      const tx = db.transaction(OPS, "readwrite");
      tx.objectStore(OPS).put(q.op, q.key);
      await done(tx);
    } catch {
      /* in memory only */
    }
  }

  private async drop(q: Queued): Promise<void> {
    this.ops = this.ops.filter((o) => o !== q);
    const db = await this.db;
    if (db) {
      try {
        const tx = db.transaction(OPS, "readwrite");
        tx.objectStore(OPS).delete(q.key);
        await done(tx);
      } catch {
        /* the entry is retried after a reload and found already applied (404) */
      }
    }
    this.emit();
  }

  private sleep(ms: number): Promise<void> {
    if (this.d.delay) return this.d.delay(ms);
    return new Promise((resolve) => {
      const wake = () => {
        clearTimeout(t);
        this.wakers.delete(wake);
        resolve();
      };
      const t = setTimeout(wake, ms);
      this.wakers.add(wake);
    });
  }

  private pump(): void {
    if (this.disposed) return;
    if (this.running) {
      this.again = true;
      return;
    }
    this.running = true;
    void this.run().finally(() => {
      this.running = false;
      if (this.again && !this.disposed) {
        this.again = false;
        this.pump();
      }
    });
  }

  private async run(): Promise<void> {
    await this.ready;
    const skipped = new Set<Queued>();
    for (;;) {
      if (this.disposed) return;
      const next = this.ops.find((q) => !skipped.has(q) && (q.op.op !== "add" || !q.op.item.assetId || !this.d.assetReady || this.d.assetReady(q.op.item.assetId)));
      if (!next) break;
      this.setStatus("syncing");
      try {
        await this.send(next);
        this.attempt = 0;
      } catch (e) {
        const err = e instanceof InboxApiError ? e : new InboxApiError(0, "offline", "offline");
        if (err.status === 401 || err.status === 403) {
          this.setStatus("needs-login");
          return;
        }
        if (err.status === 0 || err.status >= 500) {
          this.setStatus("offline");
          this.scheduleRetry();
          return;
        }
        // A request the server will never accept: drop it, and say so for an item the person added.
        await this.drop(next);
        if (next.op.op === "add") this.d.onRejected?.(next.op.item, err);
        continue;
      }
    }
    // Nothing left to send now. Items waiting for an upload to finish do not make this "offline".
    this.setStatus("idle");
  }

  private async send(q: Queued): Promise<void> {
    const { api } = this.d;
    const op = q.op;
    if (op.op === "add") {
      const { id } = await api.create(op.item);
      if (op.placed) {
        // Placed while it was still queued: from here on it is an ordinary server item that needs marking.
        q.op = { op: "place", id, placed: true };
        await this.update(q);
        try {
          await api.setPlaced(id, true);
        } catch (e) {
          if (e instanceof InboxApiError && e.status === 404) {
            await this.drop(q);
            return;
          }
          throw e;
        }
      }
      await this.drop(q);
      return;
    }
    try {
      if (op.op === "place") await api.setPlaced(op.id, op.placed !== false);
      else await api.remove(op.id);
    } catch (e) {
      if (!(e instanceof InboxApiError && e.status === 404)) throw e; // already gone: the change is moot
    }
    await this.drop(q);
  }

  private scheduleRetry(): void {
    if (this.timer || this.disposed) return;
    this.timer = true;
    const wait = backoffDelay(this.attempt++);
    void this.sleep(wait).then(() => {
      this.timer = false;
      this.pump();
    });
  }
}

// ---- the server's API ------------------------------------------------------------------------------------

const asError = async (res: Response): Promise<InboxApiError> => {
  let code = "error";
  let message = `The server answered ${res.status}.`;
  try {
    const body = (await res.json()) as { error?: unknown; message?: unknown };
    if (typeof body.error === "string") code = body.error;
    if (typeof body.message === "string") message = body.message;
    else if (code === "inbox-full") message = INBOX_FULL_MESSAGE;
  } catch {
    /* no body */
  }
  return new InboxApiError(res.status, code, message);
};

/** The browser's side of /api/inbox. A network failure is an InboxApiError with status 0. */
export function createHttpInboxApi(fetchFn?: typeof fetch): InboxApi {
  const f = fetchFn ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a));
  async function call(url: string, init?: RequestInit): Promise<Response> {
    let res: Response;
    try {
      res = await f(url, init);
    } catch {
      throw new InboxApiError(0, "offline", "You're offline.");
    }
    if (!res.ok) throw await asError(res);
    return res;
  }
  const json = (method: string, body: unknown): RequestInit => ({ method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return {
    async create(item) {
      const res = await call("/api/inbox", json("POST", { kind: item.kind, assetId: item.assetId, url: item.url, text: item.text, title: item.title, sourceUrl: item.sourceUrl, credit: item.credit }));
      return (await res.json()) as { id: string };
    },
    async list(q) {
      const p = new URLSearchParams();
      if (q.placed !== undefined) p.set("placed", q.placed ? "1" : "0");
      if (q.limit) p.set("limit", String(q.limit));
      if (q.before) p.set("before", q.before);
      const res = await call(`/api/inbox?${p}`, { cache: "no-store" });
      return (await res.json()) as { items: InboxItem[]; unplaced: number };
    },
    async setPlaced(id, placed) {
      await call(`/api/inbox/${encodeURIComponent(id)}`, json("PATCH", { placed }));
    },
    async remove(id) {
      await call(`/api/inbox/${encodeURIComponent(id)}`, { method: "DELETE" });
    },
    async removeMany(ids) {
      for (let i = 0; i < ids.length; i += 200) await call("/api/inbox", json("DELETE", { ids: ids.slice(i, i + 200) }));
    },
  };
}

// ---- local-only mode ---------------------------------------------------------------------------------------

const LOCAL_DB = "atelier-inbox-local";
const ITEMS = "items";

/** The Inbox kept in this browser's IndexedDB (local-only mode has no server). Same rules as the server: 200 unplaced items. */
export function createLocalInboxApi(idb: IDBFactory | undefined = globalIdb()): InboxApi {
  const open = () => {
    if (!idb) return Promise.reject(new InboxApiError(0, "no-storage", "This browser can't store the Inbox."));
    return openDb(idb, LOCAL_DB, (db) => void db.createObjectStore(ITEMS, { keyPath: "id" })).catch(() => {
      throw new InboxApiError(0, "no-storage", "This browser can't store the Inbox.");
    });
  };
  async function all(db: IDBDatabase): Promise<InboxItem[]> {
    return (await req(db.transaction(ITEMS, "readonly").objectStore(ITEMS).getAll())) as InboxItem[];
  }
  async function withDb<T>(fn: (db: IDBDatabase) => Promise<T>): Promise<T> {
    const db = await open();
    try {
      return await fn(db);
    } finally {
      db.close();
    }
  }
  return {
    create: (item) =>
      withDb(async (db) => {
        const rows = await all(db);
        if (rows.filter((r) => !r.placedAt).length >= INBOX_LIMIT) throw new InboxApiError(409, "inbox-full", INBOX_FULL_MESSAGE);
        const row: InboxItem = { ...item, id: crypto.randomUUID(), createdAt: new Date().toISOString(), placedAt: null };
        const tx = db.transaction(ITEMS, "readwrite");
        tx.objectStore(ITEMS).add(row);
        await done(tx);
        return { id: row.id };
      }),
    list: (q) =>
      withDb(async (db) => {
        const rows = (await all(db)).sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
        const items = rows.filter((r) => (q.placed === undefined ? true : q.placed ? !!r.placedAt : !r.placedAt) && (!q.before || r.createdAt < q.before)).slice(0, q.limit ?? 100);
        return { items, unplaced: rows.filter((r) => !r.placedAt).length };
      }),
    setPlaced: (id, placed) =>
      withDb(async (db) => {
        const row = (await req(db.transaction(ITEMS, "readonly").objectStore(ITEMS).get(id))) as InboxItem | undefined;
        if (!row) throw new InboxApiError(404, "not-found", "That item is gone.");
        const tx = db.transaction(ITEMS, "readwrite");
        tx.objectStore(ITEMS).put({ ...row, placedAt: placed ? (row.placedAt ?? new Date().toISOString()) : null });
        await done(tx);
      }),
    remove: (id) =>
      withDb(async (db) => {
        const tx = db.transaction(ITEMS, "readwrite");
        tx.objectStore(ITEMS).delete(id);
        await done(tx);
      }),
    removeMany: (ids) =>
      withDb(async (db) => {
        const tx = db.transaction(ITEMS, "readwrite");
        for (const id of ids) tx.objectStore(ITEMS).delete(id);
        await done(tx);
      }),
  };
}
