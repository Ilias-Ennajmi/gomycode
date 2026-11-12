import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import type { BoardDoc } from "@/lib/engine/doc/board-doc";
import { backoffDelay } from "./backoff";
import { getDeviceId, SyncStore, syncDbName } from "./local-store";
import type { SyncStatus } from "./status";

export type { SyncStatus } from "./status";

/** Origin of every change that came from the server, so it is never sent back. */
export const REMOTE_ORIGIN = Symbol("atelier.remote");

export type PullResult = {
  updates: { seq: number; update: Uint8Array }[];
  snapshot?: { state: Uint8Array; uptoSeq: number };
  /** True when the server has more rows beyond this page. */
  more?: boolean;
};

export type SyncApi = {
  push(boardId: string, update: Uint8Array, deviceId: string): Promise<{ seq: number }>;
  pull(boardId: string, afterSeq: number): Promise<PullResult>;
};

/** Cross-device "something changed" ping (see realtime.ts). */
export interface RealtimeLink {
  notify(): void;
  onRemoteChange(cb: () => void): () => void;
  close(): void;
}

export type Timers = { set(fn: () => void, ms: number): unknown; clear(handle: unknown): void };

export type SyncClientOptions = {
  /** Wait this long after the first edit of a batch before pushing. Default 1000. */
  batchMs?: number;
  deviceId?: string;
  /** IndexedDB name of the sync bookkeeping store. Default `atelier-sync-{boardId}`. */
  storeName?: string;
  realtime?: RealtimeLink;
  /** Defaults to `navigator.onLine !== false`. */
  isOnline?: () => boolean;
  /** Where online/offline/focus/visibilitychange are heard. Defaults to `window`; null for none. */
  target?: EventTarget | null;
  isHidden?: () => boolean;
  timers?: Timers;
  /** Largest merged push, in bytes (the server rejects bodies over 1 MB). Default 900 000. */
  maxBatchBytes?: number;
};

const realTimers: Timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) };

function isEmptyDoc(ydoc: Y.Doc): boolean {
  return ydoc.store.clients.size === 0 && ydoc.store.pendingStructs === null;
}

/** Network failures (fetch throws a TypeError, no HTTP status) and server hiccups count as "offline"; other refusals as "error". */
function classify(e: unknown): "offline" | "error" {
  const status = (e as { status?: unknown } | null)?.status;
  if (typeof status !== "number") return "offline";
  return status >= 500 || status === 408 || status === 429 ? "offline" : "error";
}

/**
 * Keeps one board's Yjs document in step with the server.
 *
 * Local edits are queued in IndexedDB first (the `unsent` list) and pushed in batches (merged with Y.mergeUpdates);
 * a push that succeeds removes them from the list, one that fails leaves them for the next attempt, including after
 * a reload. Changes from the server are applied with REMOTE_ORIGIN, so they are neither re-sent nor undoable.
 * Pulls happen on start, after the realtime ping, on focus and when the network returns. Failures retry with
 * exponential backoff (1 s, 2 s, 4 s ... 60 s). Yjs makes every apply idempotent, so a repeated or overlapping update
 * can never duplicate content.
 */
export class SyncClient {
  private _status: SyncStatus = "saved";
  private readonly statusListeners = new Set<(s: SyncStatus) => void>();

  private readonly ydoc: Y.Doc;
  private readonly store: SyncStore;
  private readonly deviceId: string;
  private readonly timers: Timers;
  private readonly batchMs: number;
  private readonly maxBatch: number;

  private ready: Promise<void> = Promise.resolve();
  private writes: Promise<void> = Promise.resolve();
  private running: Promise<void> | null = null;
  private again = false;
  private lastSeq = 0;
  private attempt = 0;
  private batchTimer: unknown = null;
  private retryTimer: unknown = null;
  private started = false;
  private stopped = false;
  private offs: (() => void)[] = [];

  constructor(
    private readonly boardId: string,
    doc: BoardDoc,
    private readonly api: SyncApi,
    private readonly opts: SyncClientOptions = {},
  ) {
    this.ydoc = doc.ydoc;
    this.store = new SyncStore(opts.storeName ?? syncDbName(boardId));
    this.deviceId = opts.deviceId ?? getDeviceId();
    this.timers = opts.timers ?? realTimers;
    this.batchMs = opts.batchMs ?? 1000;
    this.maxBatch = opts.maxBatchBytes ?? 900_000;
  }

  get status(): SyncStatus {
    return this._status;
  }

  onStatus(cb: (s: SyncStatus) => void): () => void {
    this.statusListeners.add(cb);
    return () => {
      this.statusListeners.delete(cb);
    };
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.stopped = false;
    this.setStatus(this.online() ? "syncing" : "offline");

    // Listen before the store has opened so no edit is missed; the writes wait for it.
    const onUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin === REMOTE_ORIGIN || origin instanceof IndexeddbPersistence) return;
      this.enqueue(update);
      this.scheduleBatch();
    };
    this.ydoc.on("update", onUpdate);
    this.offs.push(() => this.ydoc.off("update", onUpdate));

    this.ready = this.init();
    void this.ready.then(() => this.requestSync());

    const target = this.opts.target === undefined ? (typeof window !== "undefined" ? window : null) : this.opts.target;
    if (target) {
      const on = (type: string, fn: () => void) => {
        target.addEventListener(type, fn);
        this.offs.push(() => target.removeEventListener(type, fn));
      };
      on("online", () => {
        this.attempt = 0;
        void this.requestSync();
      });
      on("offline", () => this.setStatus("offline"));
      on("focus", () => void this.requestSync());
      on("visibilitychange", () => {
        // Leaving the page: push what we have now. Coming back: catch up.
        if (this.hidden()) void this.flush();
        else void this.requestSync();
      });
    }
    if (this.opts.realtime) this.offs.push(this.opts.realtime.onRemoteChange(() => void this.requestSync()));
  }

  stop(): void {
    this.stopped = true;
    this.started = false;
    this.clearTimer("batchTimer");
    this.clearTimer("retryTimer");
    for (const off of this.offs.splice(0)) off();
    this.opts.realtime?.close();
    void this.writes.then(() => this.store.close());
  }

  /** Push everything queued and pull what is new, now. Never rejects; read `status` for the outcome. */
  async flush(): Promise<void> {
    if (!this.started) return;
    this.clearTimer("batchTimer");
    await this.ready;
    await this.requestSync();
  }

  /** Resolves when no sync cycle is running (used to step retries in tests and before navigating away). */
  async whenIdle(): Promise<void> {
    await this.ready;
    await this.writes;
    while (this.running) await this.running;
  }

  // ---- internals -------------------------------------------------------------------------------------------

  private online(): boolean {
    if (this.opts.isOnline) return this.opts.isOnline();
    return typeof navigator === "undefined" || navigator.onLine !== false;
  }
  private hidden(): boolean {
    if (this.opts.isHidden) return this.opts.isHidden();
    return typeof document !== "undefined" && document.visibilityState === "hidden";
  }

  private setStatus(s: SyncStatus): void {
    if (this._status === s) return;
    this._status = s;
    for (const cb of [...this.statusListeners]) cb(s);
  }

  private clearTimer(which: "batchTimer" | "retryTimer"): void {
    if (this[which] !== null) {
      this.timers.clear(this[which]);
      this[which] = null;
    }
  }

  private async init(): Promise<void> {
    await this.store.open();
    this.lastSeq = await this.store.getLastSeq();
    // Synced before, but the local document is empty: it was lost or rebuilt. Start over from the server.
    if (this.lastSeq > 0 && isEmptyDoc(this.ydoc)) {
      this.lastSeq = 0;
      await this.store.resetPosition();
    }
    // Content that predates this client (a board created before sync existed) is queued once.
    if (!(await this.store.isBaselined())) {
      if (!isEmptyDoc(this.ydoc)) await this.store.addUnsent(Y.encodeStateAsUpdate(this.ydoc));
      await this.store.setBaselined();
    }
  }

  private enqueue(update: Uint8Array): void {
    this.writes = this.writes
      .then(() => this.ready)
      .then(() => this.store.addUnsent(update))
      .then(
        () => undefined,
        (e) => console.warn("atelier: could not queue an update for sync", e),
      );
    if (this.online()) this.setStatus("syncing");
    else this.setStatus("offline");
  }

  private scheduleBatch(): void {
    if (this.batchTimer !== null || this.stopped) return;
    this.batchTimer = this.timers.set(() => {
      this.batchTimer = null;
      void this.requestSync();
    }, this.batchMs);
  }

  /** One sync cycle at a time; a request that arrives meanwhile runs one more cycle afterwards. */
  private requestSync(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = (async () => {
      try {
        do {
          this.again = false;
          await this.cycle();
        } while (this.again && !this.stopped);
      } finally {
        this.running = null;
      }
    })();
    return this.running;
  }

  private async cycle(): Promise<void> {
    await this.ready;
    if (!this.online()) {
      this.setStatus("offline");
      return;
    }
    this.setStatus("syncing");
    try {
      await this.writes;
      const pushed = await this.pushUnsent();
      await this.pullAll();
      if (pushed) this.opts.realtime?.notify();
      this.attempt = 0;
      this.clearTimer("retryTimer");
      if ((await this.store.countUnsent()) > 0) this.again = true; // edits arrived while we were busy
      else this.setStatus("saved");
    } catch (e) {
      this.fail(e);
    }
  }

  private fail(e: unknown): void {
    if (this.stopped) return;
    this.setStatus(classify(e));
    this.clearTimer("retryTimer");
    this.retryTimer = this.timers.set(() => {
      this.retryTimer = null;
      void this.requestSync();
    }, backoffDelay(this.attempt++));
  }

  /** Push the queued updates, merged per batch. Returns whether anything was pushed. */
  private async pushUnsent(): Promise<boolean> {
    let pushed = false;
    for (;;) {
      const rows = await this.store.listUnsent();
      if (rows.length === 0) return pushed;
      // Group so no merged push exceeds the size limit (a merge is never larger than the sum of its parts).
      const groups: typeof rows[] = [];
      let size = 0;
      for (const r of rows) {
        if (groups.length === 0 || size + r.update.byteLength > this.maxBatch) {
          groups.push([]);
          size = 0;
        }
        groups[groups.length - 1].push(r);
        size += r.update.byteLength;
      }
      for (const g of groups) {
        const merged = g.length === 1 ? g[0].update : Y.mergeUpdates(g.map((r) => r.update));
        const { seq } = await this.api.push(this.boardId, merged, this.deviceId);
        await this.store.deleteUnsent(g.map((r) => r.key));
        pushed = true;
        // Nothing else landed in between: no need to download our own update again.
        if (seq === this.lastSeq + 1) {
          this.lastSeq = seq;
          await this.store.setLastSeq(seq);
        }
      }
    }
  }

  private async pullAll(): Promise<void> {
    for (let page = 0; page < 1000; page++) {
      const res = await this.api.pull(this.boardId, this.lastSeq);
      let next = this.lastSeq;
      Y.transact(
        this.ydoc,
        () => {
          const apply = (bytes: Uint8Array, seq: number) => {
            try {
              Y.applyUpdate(this.ydoc, bytes, REMOTE_ORIGIN);
            } catch (e) {
              // One damaged server row must not stop the board from loading.
              console.warn(`atelier: skipped an unreadable update (seq ${seq})`, e);
            }
          };
          if (res.snapshot) {
            apply(res.snapshot.state, res.snapshot.uptoSeq);
            next = Math.max(next, res.snapshot.uptoSeq);
          }
          for (const u of res.updates) {
            apply(u.update, u.seq);
            next = Math.max(next, u.seq);
          }
        },
        REMOTE_ORIGIN,
      );
      if (next !== this.lastSeq) {
        this.lastSeq = next;
        await this.store.setLastSeq(next);
      }
      if (!res.more) return;
    }
  }
}
