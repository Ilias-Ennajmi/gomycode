import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { defaultsFor } from "@/lib/engine/model/defaults";
import type { NewObject } from "@/lib/engine/model/types";
import { appendUpdate, readUpdates, supabaseUpdatesDb } from "@/lib/server/updates";
import { compact } from "@/lib/server/compaction";
import { backoffDelay } from "@/lib/sync/backoff";
import { createHttpSyncApi, SyncHttpError } from "@/lib/sync/http-api";
import { openLocalBoard, SyncStore } from "@/lib/sync/local-store";
import { createRealtimeLink } from "@/lib/sync/realtime";
import { statusLabel } from "@/lib/sync/status";
import { REMOTE_ORIGIN, SyncClient, type RealtimeLink, type SyncApi } from "@/lib/sync/sync-client";
import { bytesToBase64 } from "@/lib/sync/bytes";
import type { AtelierClient } from "@/lib/supabase/client";
import { createFakePg, type FakePg } from "./helpers/fake-pg";

const OWNER = "11111111-1111-4111-8111-111111111111";
const BOARD = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

let pg: FakePg;
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  pg = createFakePg();
  pg.tables.boards.push({ id: BOARD, owner_id: OWNER });
});

/** The real server logic over an in-memory database, as one device sees it through its own (switchable) connection. */
function serverFor(deviceId: string) {
  const db = supabaseUpdatesDb(pg.client({ sub: OWNER }) as never);
  const state = { online: true, pushes: [] as Uint8Array[], pulls: 0, failWith: null as Error | null };
  const check = () => {
    if (!state.online) throw new TypeError("Failed to fetch");
    if (state.failWith) throw state.failWith;
  };
  const api: SyncApi = {
    async push(boardId, update) {
      check();
      state.pushes.push(update);
      return { seq: await appendUpdate(db, boardId, update, deviceId) };
    },
    async pull(boardId, afterSeq) {
      check();
      state.pulls++;
      return readUpdates(db, boardId, afterSeq);
    },
  };
  return { api, state, db };
}

type Device = ReturnType<typeof makeDevice>;
function makeDevice(name: string, opts: { doc?: BoardDoc; storeName?: string; realtime?: RealtimeLink; batchMs?: number } = {}) {
  const server = serverFor(name);
  const doc = opts.doc ?? new BoardDoc();
  const timers: { fn: () => void; ms: number; cleared: boolean }[] = [];
  const client = new SyncClient(BOARD, doc, server.api, {
    deviceId: name,
    storeName: opts.storeName ?? `sync-${name}`,
    batchMs: opts.batchMs ?? 5,
    realtime: opts.realtime,
    isOnline: () => server.state.online,
    target: null,
    timers: {
      set: (fn, ms) => {
        // Retries (backoff) are captured so a test can step them; batching timers run for real.
        if (ms >= 1000) {
          const t = { fn, ms, cleared: false };
          timers.push(t);
          return t;
        }
        return setTimeout(fn, ms);
      },
      clear: (h) => {
        if (h && typeof h === "object" && "cleared" in h) (h as { cleared: boolean }).cleared = true;
        else clearTimeout(h as ReturnType<typeof setTimeout>);
      },
    },
  });
  return { name, doc, client, ...server, timers };
}
const sticky = (over: Partial<NewObject> = {}) => ({ ...defaultsFor("sticky"), ...over }) as NewObject;
const shape = (over: Partial<NewObject> = {}) => ({ ...defaultsFor("shape"), ...over }) as NewObject;
const ids = (d: { doc: BoardDoc }) => d.doc.all().map((o) => o.id).sort();
const stateOf = (d: { doc: BoardDoc }) => d.doc.ydoc.getMap("objects").toJSON();
const serverRows = () => pg.tables.board_updates.length;
async function settle(...devices: Device[]) {
  // two rounds: everybody pushes, then everybody pulls what the others pushed
  for (let i = 0; i < 2; i++) for (const d of devices) await d.client.flush();
}
function writeText(d: BoardDoc, id: string, text: string) {
  d.transact(() => d.content(id)!.insert(d.content(id)!.length, [new Y.XmlText(text)]));
}

describe("two devices edit offline and reconnect (Review Focus 1)", () => {
  it("keeps both sets of edits, converges to identical state and duplicates nothing", async () => {
    const a = makeDevice("A");
    const b = makeDevice("B");
    a.client.start();
    b.client.start();

    // A shared object everybody has.
    const shared = a.doc.create(sticky({ x: 0, y: 0 }));
    await settle(a, b);
    expect(ids(b)).toEqual([shared]);

    // Both go offline and edit, including the same object's position, a different property and its text.
    a.state.online = false;
    b.state.online = false;
    const a1 = a.doc.create(shape({ x: 100 }));
    a.doc.update(shared, { x: 500 });
    writeText(a.doc, shared, "from A");
    const b1 = b.doc.create(sticky({ x: 200 }));
    b.doc.update(shared, { opacity: 0.5 });
    writeText(b.doc, shared, "from B");
    await a.client.flush();
    await b.client.flush();
    expect(a.client.status).toBe("offline");
    expect(b.client.status).toBe("offline");
    expect(ids(a)).not.toEqual(ids(b));

    // Back online.
    a.state.online = true;
    b.state.online = true;
    await settle(a, b);

    expect(ids(a)).toEqual([shared, a1, b1].sort());
    expect(ids(b)).toEqual(ids(a));
    expect(a.doc.all()).toHaveLength(3); // nothing duplicated
    expect(a.doc.get(shared)).toMatchObject({ x: 500, opacity: 0.5 });
    const text = a.doc.content(shared)!.toString();
    expect(text.match(/from A/g)).toHaveLength(1);
    expect(text.match(/from B/g)).toHaveLength(1);
    expect(stateOf(a)).toEqual(stateOf(b));
    // same set of changes (byte layout may differ with arrival order, the state vector may not)
    expect(Y.encodeStateVector(a.doc.ydoc)).toEqual(Y.encodeStateVector(b.doc.ydoc));
    expect(a.client.status).toBe("saved");
    expect(b.client.status).toBe("saved");

    // And a device that was never online at all gets the same board from the server alone.
    const c = makeDevice("C");
    c.client.start();
    await c.client.flush();
    expect(stateOf(c)).toEqual(stateOf(a));
    a.client.stop();
    b.client.stop();
    c.client.stop();
  });

  it("re-sends unsent edits exactly once after a reload", async () => {
    const first = await openLocalBoard(BOARD);
    const a = makeDevice("A", { doc: first.doc, storeName: "sync-A" });
    a.client.start();
    await a.client.flush(); // baseline: nothing to send yet
    expect(serverRows()).toBe(0);

    a.state.online = false;
    const o1 = a.doc.create(sticky({ x: 1 }));
    const o2 = a.doc.create(sticky({ x: 2 }));
    await a.client.flush();
    expect(a.client.status).toBe("offline");
    expect(serverRows()).toBe(0);
    await new Promise((r) => setTimeout(r, 30)); // let y-indexeddb write
    a.client.stop();
    await first.persistence.destroy();

    // "Reload": new document from IndexedDB, new client, connection is back.
    const second = await openLocalBoard(BOARD);
    expect(ids({ doc: second.doc })).toEqual([o1, o2].sort());
    const a2 = makeDevice("A", { doc: second.doc, storeName: "sync-A" });
    a2.client.start();
    await a2.client.flush();
    expect(a2.state.pushes).toHaveLength(1); // both edits in one merged push
    expect(serverRows()).toBe(1);

    // Another reload sends nothing more.
    a2.client.stop();
    await second.persistence.destroy();
    const third = await openLocalBoard(BOARD);
    const a3 = makeDevice("A", { doc: third.doc, storeName: "sync-A" });
    a3.client.start();
    await a3.client.flush();
    expect(a3.state.pushes).toHaveLength(0);
    expect(serverRows()).toBe(1);

    // The server holds exactly what the device holds.
    const check = new Y.Doc();
    for (const r of await a3.db.updatesAfter(BOARD, 0, 100)) Y.applyUpdate(check, r.update);
    expect(check.getMap("objects").toJSON()).toEqual(stateOf({ doc: third.doc }));
    a3.client.stop();
  });
});

describe("SyncClient", () => {
  it("batches rapid edits into one merged push", async () => {
    const a = makeDevice("A", { batchMs: 40 });
    a.client.start();
    await a.client.flush();
    for (let i = 0; i < 5; i++) a.doc.create(sticky({ x: i }));
    expect(a.state.pushes).toHaveLength(0);
    await vi.waitFor(() => expect(a.state.pushes).toHaveLength(1), { timeout: 2000 });
    const merged = new Y.Doc();
    Y.applyUpdate(merged, a.state.pushes[0]);
    expect(Object.keys(merged.getMap("objects").toJSON())).toHaveLength(5);
    a.client.stop();
  });

  it("does not send what it received (only local-origin changes are pushed)", async () => {
    const a = makeDevice("A");
    const b = makeDevice("B");
    a.client.start();
    b.client.start();
    a.doc.create(sticky());
    await settle(a, b);
    expect(b.doc.all()).toHaveLength(1);
    expect(b.state.pushes).toHaveLength(0);
    a.client.stop();
    b.client.stop();
  });

  it("backs off 1 s, 2 s, 4 s ... while the network fails, then recovers and resets", async () => {
    const a = makeDevice("A");
    a.client.start();
    await a.client.flush();
    a.state.failWith = new TypeError("Failed to fetch");
    a.doc.create(sticky());
    await a.client.flush();
    expect(a.client.status).toBe("offline");
    expect(a.timers.map((t) => t.ms)).toEqual([1000]);

    for (const expected of [2000, 4000, 8000]) {
      await a.timers.filter((t) => !t.cleared).at(-1)!.fn(); // the retry timer fires
      await a.client.whenIdle();
      expect(a.timers.filter((t) => !t.cleared).at(-1)!.ms).toBe(expected);
    }
    expect(backoffDelay(10)).toBe(60_000);

    a.state.failWith = null;
    await a.client.flush();
    expect(a.client.status).toBe("saved");
    expect(a.state.pushes.length).toBe(1);
    // the next failure starts again from one second
    a.state.failWith = new TypeError("Failed to fetch");
    a.doc.create(sticky({ x: 9 }));
    await a.client.flush();
    expect(a.timers.filter((t) => !t.cleared).at(-1)!.ms).toBe(1000);
    a.client.stop();
  });

  it("reports an error (not offline) when the server refuses, and keeps the edit for later", async () => {
    const a = makeDevice("A");
    a.client.start();
    await a.client.flush();
    a.state.failWith = new SyncHttpError(403, "forbidden");
    const id = a.doc.create(sticky());
    await a.client.flush();
    expect(a.client.status).toBe("error");
    a.state.failWith = null;
    await a.client.flush();
    expect(a.client.status).toBe("saved");
    const check = new Y.Doc();
    for (const r of await a.db.updatesAfter(BOARD, 0, 10)) Y.applyUpdate(check, r.update);
    expect(Object.keys(check.getMap("objects").toJSON())).toEqual([id]);
    a.client.stop();
  });

  it("publishes status changes to subscribers", async () => {
    const a = makeDevice("A");
    const seen: string[] = [];
    a.client.onStatus((s) => seen.push(s));
    a.client.start();
    a.doc.create(sticky());
    await a.client.flush();
    expect(seen).toContain("syncing");
    expect(seen.at(-1)).toBe("saved");
    a.state.online = false;
    a.doc.create(sticky());
    await a.client.flush();
    expect(seen.at(-1)).toBe("offline");
    a.client.stop();
  });

  it("does not leak edits made before start() or while IndexedDB is still opening", async () => {
    const a = makeDevice("A");
    a.doc.create(sticky({ x: 1 })); // before start: baseline covers it
    a.client.start();
    a.doc.create(sticky({ x: 2 })); // right after start: queued behind the store opening
    await a.client.flush();
    const check = new Y.Doc();
    for (const r of await a.db.updatesAfter(BOARD, 0, 10)) Y.applyUpdate(check, r.update);
    expect(Object.keys(check.getMap("objects").toJSON())).toHaveLength(2);
    a.client.stop();
  });

  it("stops pushing after stop()", async () => {
    const a = makeDevice("A");
    a.client.start();
    await a.client.flush();
    a.client.stop();
    a.doc.create(sticky());
    await new Promise((r) => setTimeout(r, 30));
    expect(a.state.pushes).toHaveLength(0);
  });
});

describe("catching up", () => {
  it("applies the snapshot first and then later updates after the server compacted", async () => {
    const a = makeDevice("A");
    a.client.start();
    for (let i = 0; i < 6; i++) {
      a.doc.create(sticky({ x: i }));
      await a.client.flush(); // one row each
    }
    expect(serverRows()).toBe(6);
    await compact(a.db, BOARD, { now: new Date(Date.now() + 3_600_000) });
    expect(serverRows()).toBe(0);
    a.doc.create(sticky({ x: 99 }));
    await a.client.flush();

    const late = makeDevice("L");
    late.client.start();
    await late.client.flush();
    expect(late.doc.all()).toHaveLength(7);
    expect(stateOf(late)).toEqual(stateOf(a));

    // A device that was in sync before the compaction catches up through the snapshot too.
    const mid = makeDevice("M");
    mid.client.start();
    await mid.client.flush();
    a.doc.create(sticky({ x: 100 }));
    await a.client.flush();
    await compact(a.db, BOARD, { now: new Date(Date.now() + 7_200_000) });
    a.doc.create(sticky({ x: 101 }));
    await a.client.flush();
    await mid.client.flush();
    expect(stateOf(mid)).toEqual(stateOf(a));
    expect(mid.doc.all()).toHaveLength(9);
    for (const d of [a, late, mid]) d.client.stop();
  });

  it("rebuilds from the server when the local document is missing", async () => {
    const a = makeDevice("A");
    a.client.start();
    a.doc.create(sticky());
    a.doc.create(sticky({ x: 5 }));
    await a.client.flush();
    a.client.stop();

    // This device had synced before (lastSeq > 0) but its document is gone: a brand new empty doc, same sync store.
    const store = new SyncStore("sync-X");
    await store.open();
    await store.setLastSeq(2);
    await store.setBaselined();
    store.close();
    const x = makeDevice("X");
    x.client.start();
    await x.client.flush();
    expect(x.doc.all()).toHaveLength(2);
    expect(stateOf(x)).toEqual(stateOf(a));
    x.client.stop();
  });

  it("rebuilds from the server when the local store is corrupt", async () => {
    const a = makeDevice("A");
    a.client.start();
    a.doc.create(sticky());
    await a.client.flush();
    a.client.stop();

    // A healthy local copy first, then damage it.
    const ok = await openLocalBoard(BOARD);
    ok.doc.create(sticky({ x: 7 }));
    await new Promise((r) => setTimeout(r, 30));
    await ok.persistence.destroy();
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(`atelier-board-${BOARD}`);
      req.onsuccess = () => {
        const tx = req.result.transaction("updates", "readwrite");
        tx.objectStore("updates").add(new Uint8Array([255, 255, 255, 255, 255, 255, 255]));
        tx.oncomplete = () => (req.result.close(), resolve());
        tx.onerror = () => reject(tx.error);
      };
    });

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const rebuilt = await openLocalBoard(BOARD);
    expect(rebuilt.rebuilt).toBe(true);
    expect(rebuilt.doc.all()).toHaveLength(0);
    const x = makeDevice("X", { doc: rebuilt.doc, storeName: "sync-X" });
    x.client.start();
    await x.client.flush();
    expect(stateOf(x)).toEqual(stateOf(a)); // only what the server holds
    // and the new local store is healthy
    await new Promise((r) => setTimeout(r, 30));
    x.client.stop();
    await rebuilt.persistence.destroy();
    const again = await openLocalBoard(BOARD);
    expect(again.rebuilt).toBe(false);
    expect(again.doc.all()).toHaveLength(1);
    warn.mockRestore();
  });

  it("opens a board that has never been stored on this device as empty, not rebuilt", async () => {
    const fresh = await openLocalBoard(BOARD);
    expect(fresh.rebuilt).toBe(false);
    expect(fresh.doc.all()).toEqual([]);
    expect(fresh.persistence).toBeTruthy();
  });
});

describe("realtime, focus and online", () => {
  function hub() {
    const listeners = new Set<() => void>();
    const link = (): RealtimeLink & { notify: ReturnType<typeof vi.fn> } => {
      const mine = new Set<() => void>();
      return {
        notify: vi.fn(() => listeners.forEach((l) => !mine.has(l) && l())),
        onRemoteChange(cb) {
          mine.add(cb);
          listeners.add(cb);
          return () => (mine.delete(cb), listeners.delete(cb));
        },
        close() {},
      };
    };
    return { link };
  }

  it("announces a successful push and pulls when another device announces one", async () => {
    const h = hub();
    const la = h.link();
    const lb = h.link();
    const a = makeDevice("A", { realtime: la });
    const b = makeDevice("B", { realtime: lb });
    a.client.start();
    b.client.start();
    await b.client.flush();
    const pullsBefore = b.state.pulls;

    a.doc.create(sticky());
    await a.client.flush();
    expect(la.notify).toHaveBeenCalledTimes(1);
    expect(lb.notify).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(b.doc.all()).toHaveLength(1));
    expect(b.state.pulls).toBeGreaterThan(pullsBefore);
    a.client.stop();
    b.client.stop();
  });

  it("does not announce when nothing was pushed", async () => {
    const la = hub().link();
    const a = makeDevice("A", { realtime: la });
    a.client.start();
    await a.client.flush();
    expect(la.notify).not.toHaveBeenCalled();
    a.client.stop();
  });

  it("pulls on window focus and visible, pushes on hidden, and retries at once when the network returns", async () => {
    const target = new EventTarget();
    let hidden = false;
    const server = serverFor("A");
    const doc = new BoardDoc();
    const client = new SyncClient(BOARD, doc, server.api, { deviceId: "A", storeName: "sync-ev", batchMs: 10_000, target, isHidden: () => hidden, isOnline: () => server.state.online });
    client.start();
    await client.flush();
    const base = server.state.pulls;

    target.dispatchEvent(new Event("focus"));
    await vi.waitFor(() => expect(server.state.pulls).toBeGreaterThan(base));

    doc.create(sticky());
    hidden = true;
    target.dispatchEvent(new Event("visibilitychange"));
    await vi.waitFor(() => expect(server.state.pushes).toHaveLength(1)); // did not wait for the 10 s batch

    server.state.online = false;
    target.dispatchEvent(new Event("offline"));
    await vi.waitFor(() => expect(client.status).toBe("offline"));
    doc.create(sticky({ x: 3 }));
    server.state.online = true;
    target.dispatchEvent(new Event("online"));
    await vi.waitFor(() => expect(server.state.pushes).toHaveLength(2));
    await vi.waitFor(() => expect(client.status).toBe("saved"));
    client.stop();
  });

  it("broadcasts and listens on channel atelier:board:{id}", async () => {
    const sent: unknown[] = [];
    const handlers: Record<string, (p: unknown) => void> = {};
    const channel = {
      on: vi.fn((_t: string, filter: { event: string }, cb: (p: unknown) => void) => ((handlers[filter.event] = cb), channel)),
      subscribe: vi.fn(() => channel),
      send: vi.fn(async (m: unknown) => void sent.push(m)),
    };
    const client = { channel: vi.fn<(name: string, opts?: unknown) => typeof channel>(() => channel), removeChannel: vi.fn() };
    // the real Atelier client is accepted where a realtime client is expected
    const accepted: Parameters<typeof createRealtimeLink>[0] = {} as AtelierClient;
    void accepted;
    const link = createRealtimeLink(client as never, BOARD);
    expect(client.channel.mock.calls[0][0]).toBe(`atelier:board:${BOARD}`);
    expect(client.channel.mock.calls[0][1]).toMatchObject({ config: { broadcast: { self: false } } });

    const cb = vi.fn();
    const off = link.onRemoteChange(cb);
    handlers.changed({ payload: { boardId: BOARD } });
    expect(cb).toHaveBeenCalledTimes(1);
    handlers.changed({ payload: { boardId: "some-other-board" } });
    expect(cb).toHaveBeenCalledTimes(1);
    off();
    handlers.changed({ payload: { boardId: BOARD } });
    expect(cb).toHaveBeenCalledTimes(1);

    link.notify();
    expect(sent).toEqual([{ type: "broadcast", event: "changed", payload: { boardId: BOARD } }]);
    link.close();
    expect(client.removeChannel).toHaveBeenCalledWith(channel);
  });
});

describe("http api", () => {
  it("pushes octet-stream with the device header and pulls JSON", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const update = new Uint8Array([1, 2, 3]);
    const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      if (init?.method === "POST") return Response.json({ seq: 7 });
      return Response.json({
        snapshot: { state: bytesToBase64(new Uint8Array([9, 9])), uptoSeq: 4 },
        updates: [{ seq: 5, update: bytesToBase64(update) }],
        more: true,
      });
    }) as unknown as typeof fetch;
    const api = createHttpSyncApi(fetchFn);

    expect(await api.push(BOARD, update, "dev-1")).toEqual({ seq: 7 });
    expect(calls[0].url).toBe(`/api/boards/${BOARD}/updates`);
    expect((calls[0].init!.headers as Record<string, string>)["Content-Type"]).toBe("application/octet-stream");
    expect((calls[0].init!.headers as Record<string, string>)["x-atelier-device"]).toBe("dev-1");

    const pulled = await api.pull(BOARD, 3);
    expect(calls[1].url).toBe(`/api/boards/${BOARD}/updates?after=3`);
    expect(pulled.snapshot).toEqual({ state: new Uint8Array([9, 9]), uptoSeq: 4 });
    expect(pulled.updates).toEqual([{ seq: 5, update }]);
    expect(pulled.more).toBe(true);
  });

  it("throws SyncHttpError with the status for non-2xx answers", async () => {
    const api = createHttpSyncApi((async () => new Response("no", { status: 404 })) as unknown as typeof fetch);
    await expect(api.pull(BOARD, 0)).rejects.toMatchObject({ status: 404 });
    await expect(api.push(BOARD, new Uint8Array([1, 2]), "d")).rejects.toBeInstanceOf(SyncHttpError);
  });
});

describe("misc", () => {
  it("labels every status in plain words", () => {
    expect(statusLabel("saved")).toBe("Saved");
    expect(statusLabel("syncing")).toBe("Saving…");
    expect(statusLabel("offline")).toBe("Saved on this device");
    expect(statusLabel("error")).toBe("Saved on this device. Sync is having trouble");
  });

  it("uses a distinct origin for received changes", () => {
    expect(typeof REMOTE_ORIGIN).toBe("symbol");
  });
});
