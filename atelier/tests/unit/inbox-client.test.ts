// @vitest-environment jsdom
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalInboxApi, InboxApiError, InboxClient, type InboxApi } from "@/lib/inbox/inbox-client";
import { INBOX_LIMIT, type InboxItem, type NewInboxItem } from "@/lib/inbox/types";

const A = "6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e01";
const text = (t: string): NewInboxItem => ({ kind: "text", assetId: null, url: null, text: t, title: null, sourceUrl: null, credit: null });
const link = (url: string): NewInboxItem => ({ kind: "url", assetId: null, url, text: null, title: null, sourceUrl: url, credit: null });
const image = (assetId: string): NewInboxItem => ({ kind: "image", assetId, url: null, text: null, title: "pic", sourceUrl: null, credit: null });

/** An in-memory server with switches for "offline" and "signed out". */
function fakeServer() {
  const rows: InboxItem[] = [];
  const s = {
    rows,
    offline: false,
    status: 0 as number, // forced HTTP status for the next calls (0 = none)
    calls: [] as string[],
    api: {
      async create(item: NewInboxItem) {
        s.calls.push("create");
        if (s.offline) throw new InboxApiError(0, "offline", "offline");
        if (s.status) throw new InboxApiError(s.status, "x", "x");
        const row: InboxItem = { ...item, id: `srv-${rows.length + 1}`, createdAt: new Date(1_700_000_000_000 + rows.length * 1000).toISOString(), placedAt: null };
        rows.push(row);
        return { id: row.id };
      },
      async list(q: { placed?: boolean }) {
        s.calls.push("list");
        if (s.offline) throw new InboxApiError(0, "offline", "offline");
        if (s.status) throw new InboxApiError(s.status, "x", "x");
        const items = rows.filter((r) => (q.placed === undefined ? true : q.placed ? r.placedAt !== null : r.placedAt === null)).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
        return { items, unplaced: rows.filter((r) => r.placedAt === null).length };
      },
      async setPlaced(id: string, placed: boolean) {
        s.calls.push(`place:${id}`);
        if (s.offline) throw new InboxApiError(0, "offline", "offline");
        const r = rows.find((x) => x.id === id);
        if (!r) throw new InboxApiError(404, "not-found", "gone");
        r.placedAt = placed ? "2026-01-01T00:00:00.000Z" : null;
      },
      async remove(id: string) {
        s.calls.push(`remove:${id}`);
        if (s.offline) throw new InboxApiError(0, "offline", "offline");
        const i = rows.findIndex((x) => x.id === id);
        if (i < 0) throw new InboxApiError(404, "not-found", "gone");
        rows.splice(i, 1);
      },
    } satisfies InboxApi,
  };
  return s;
}

let idb: IDBFactory;
beforeEach(() => {
  idb = new IDBFactory();
});

const quiet = () => ({ delay: () => new Promise<void>(() => {}) }); // retries never fire unless the test says so
const settle = () => new Promise((r) => setTimeout(r, 20));

describe("InboxClient", () => {
  it("sends an added item and lists it", async () => {
    const srv = fakeServer();
    const c = new InboxClient({ api: srv.api, idb, ...quiet() });
    await c.add(text("hello"));
    await settle();
    expect(srv.rows).toHaveLength(1);
    expect(c.pending()).toBe(0);
    expect(c.status).toBe("idle");
    const list = await c.list();
    expect(list.map((i) => i.text)).toEqual(["hello"]);
    expect(list[0].pending).toBeFalsy();
  });

  it("while offline, queues the item (pending() === 1), shows it as pending, and flushes on `online`", async () => {
    const srv = fakeServer();
    srv.offline = true;
    const c = new InboxClient({ api: srv.api, idb, ...quiet() });
    await c.add(text("later"));
    await settle();
    expect(c.pending()).toBe(1);
    expect(c.status).toBe("offline");
    const listed = await c.list();
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ text: "later", pending: true });
    srv.offline = false;
    window.dispatchEvent(new Event("online"));
    await settle();
    expect(srv.rows.map((r) => r.text)).toEqual(["later"]);
    expect(c.pending()).toBe(0);
    expect(c.status).toBe("idle");
  });

  it("a new instance on the same database still has the queue and sends it exactly once", async () => {
    const srv = fakeServer();
    srv.offline = true;
    const first = new InboxClient({ api: srv.api, idb, ...quiet() });
    await first.add(text("survives reload"));
    await settle();
    first.dispose();

    srv.offline = false;
    const second = new InboxClient({ api: srv.api, idb, ...quiet() });
    await second.ready;
    expect(second.pending()).toBe(1);
    await settle();
    expect(srv.rows.map((r) => r.text)).toEqual(["survives reload"]);
    expect(second.pending()).toBe(0);
    const third = new InboxClient({ api: srv.api, idb, ...quiet() });
    await third.ready;
    await settle();
    expect(srv.rows).toHaveLength(1);
    expect(third.pending()).toBe(0);
  });

  it("a 401 leaves the queue intact and sets needs-login; it sends once signed in again", async () => {
    const srv = fakeServer();
    srv.status = 401;
    const c = new InboxClient({ api: srv.api, idb, ...quiet() });
    await c.add(link("https://example.com/a"));
    await settle();
    expect(c.status).toBe("needs-login");
    expect(c.pending()).toBe(1);
    expect(srv.rows).toHaveLength(0);
    srv.status = 0;
    c.retry();
    await settle();
    expect(srv.rows).toHaveLength(1);
    expect(c.status).toBe("idle");
  });

  it("retries with growing waits after a failure (1 s, 2 s ...)", async () => {
    const srv = fakeServer();
    srv.offline = true;
    const waits: number[] = [];
    let release: (() => void) | null = null;
    const delay = (ms: number) => {
      waits.push(ms);
      return new Promise<void>((r) => (release = r));
    };
    const c = new InboxClient({ api: srv.api, idb, delay });
    await c.add(text("x"));
    await settle();
    expect(waits).toEqual([1000]);
    release!();
    await settle();
    expect(waits).toEqual([1000, 2000]);
    srv.offline = false;
    release!();
    await settle();
    expect(srv.rows).toHaveLength(1);
  });

  it("drops an item the server refuses for good (400) and says why, instead of retrying forever", async () => {
    const srv = fakeServer();
    srv.status = 400;
    const rejected: unknown[] = [];
    const c = new InboxClient({ api: srv.api, idb, ...quiet(), onRejected: (item, e) => rejected.push([item.kind, e.status]) });
    await c.add(text("bad"));
    await settle();
    expect(c.pending()).toBe(0);
    expect(rejected).toEqual([["text", 400]]);
  });

  it("reports a full Inbox (409) through onRejected with the server's message", async () => {
    const srv = fakeServer();
    srv.api.create = async () => {
      throw new InboxApiError(409, "inbox-full", "Your Inbox is full (200 items).");
    };
    const rejected: string[] = [];
    const c = new InboxClient({ api: srv.api, idb, ...quiet(), onRejected: (_i, e) => rejected.push(e.message) });
    await c.add(text("one too many"));
    await settle();
    expect(rejected[0]).toMatch(/full/);
    expect(c.pending()).toBe(0);
  });

  it("waits to send an image until its asset is ready, then sends it", async () => {
    const srv = fakeServer();
    let ready = false;
    const c = new InboxClient({ api: srv.api, idb, ...quiet(), assetReady: () => ready });
    await c.add(image(A));
    await settle();
    expect(srv.calls).not.toContain("create");
    expect(c.pending()).toBe(1);
    ready = true;
    c.retry();
    await settle();
    expect(srv.rows.map((r) => r.assetId)).toEqual([A]);
  });

  it("markPlaced and remove while offline are queued and applied later", async () => {
    const srv = fakeServer();
    const c = new InboxClient({ api: srv.api, idb, ...quiet() });
    await c.add(text("one"));
    await c.add(text("two"));
    await settle();
    srv.offline = true;
    await c.markPlaced("srv-1");
    await c.remove("srv-2");
    await settle();
    expect(c.pending()).toBe(2);
    const offlineList = await c.list();
    expect(offlineList).toEqual([]); // one is placed, two is deleted, as far as this device is concerned
    srv.offline = false;
    window.dispatchEvent(new Event("online"));
    await settle();
    expect(srv.rows.map((r) => [r.id, r.placedAt !== null])).toEqual([["srv-1", true]]);
    expect(c.pending()).toBe(0);
  });

  it("placing or deleting an item that is still only queued changes the queue, not the server", async () => {
    const srv = fakeServer();
    srv.offline = true;
    const c = new InboxClient({ api: srv.api, idb, ...quiet() });
    await c.add(text("placed while pending"));
    await c.add(text("deleted while pending"));
    await settle();
    const [a, b] = (await c.list()).map((i) => i.id);
    await c.markPlaced(b); // list is newest first: b is "placed while pending"
    await c.remove(a);
    expect(c.pending()).toBe(1);
    srv.offline = false;
    window.dispatchEvent(new Event("online"));
    await settle();
    expect(srv.rows).toHaveLength(1);
    expect(srv.rows[0].text).toBe("placed while pending");
    expect(srv.rows[0].placedAt).not.toBeNull();
  });

  it("tells subscribers when the queue or status changes", async () => {
    const srv = fakeServer();
    const c = new InboxClient({ api: srv.api, idb, ...quiet() });
    const cb = vi.fn();
    const off = c.subscribe(cb);
    await c.add(text("x"));
    await settle();
    expect(cb).toHaveBeenCalled();
    off();
    cb.mockClear();
    await c.add(text("y"));
    await settle();
    expect(cb).not.toHaveBeenCalled();
  });

  it("markPlaced(id, false) puts a placed item back among the waiting ones, offline too", async () => {
    const srv = fakeServer();
    const c = new InboxClient({ api: srv.api, idb, ...quiet() });
    await c.add(text("undo me"));
    await settle();
    expect((await c.list()).map((i) => i.text)).toEqual(["undo me"]); // what a panel shows before the person places it
    await c.markPlaced("srv-1");
    await settle();
    expect(await c.list()).toEqual([]);
    srv.offline = true;
    await c.markPlaced("srv-1", false);
    expect((await c.list()).map((i) => i.text)).toEqual(["undo me"]);
    expect(c.unplaced()).toBe(1);
    srv.offline = false;
    window.dispatchEvent(new Event("online"));
    await settle();
    expect(srv.rows[0].placedAt).toBeNull();
  });

  it("find() returns an item from the last list, pending ones too", async () => {
    const srv = fakeServer();
    srv.offline = true;
    const c = new InboxClient({ api: srv.api, idb, ...quiet() });
    await c.add(text("queued"));
    const [it] = await c.list();
    expect(c.find(it.id)).toMatchObject({ text: "queued", pending: true });
    expect(c.find("nope")).toBeUndefined();
  });

  it("list() falls back to what it knew when the server cannot be reached", async () => {
    const srv = fakeServer();
    const c = new InboxClient({ api: srv.api, idb, ...quiet() });
    await c.add(text("seen"));
    await settle();
    expect((await c.list()).map((i) => i.text)).toEqual(["seen"]);
    srv.offline = true;
    expect((await c.list()).map((i) => i.text)).toEqual(["seen"]);
  });
});

describe("the local-only Inbox (kept in IndexedDB)", () => {
  it("stores, lists newest first, marks placed and deletes, with no server", async () => {
    const api = createLocalInboxApi(idb);
    const c = new InboxClient({ api, idb, ...quiet() });
    await c.add(text("first"));
    await new Promise((r) => setTimeout(r, 5));
    await c.add(link("https://example.com/b"));
    await settle();
    expect((await c.list()).map((i) => i.kind)).toEqual(["url", "text"]);
    const [u] = await c.list();
    await c.markPlaced(u.id);
    await settle();
    expect((await c.list()).map((i) => i.kind)).toEqual(["text"]);
    expect((await api.list({ placed: true })).items.map((i) => i.kind)).toEqual(["url"]);
    await c.remove((await c.list())[0].id);
    await settle();
    expect(await c.list()).toEqual([]);
  });

  it("survives a reload: a new client on the same database sees the items", async () => {
    const one = new InboxClient({ api: createLocalInboxApi(idb), idb, ...quiet() });
    await one.add(text("kept"));
    await settle();
    one.dispose();
    const two = new InboxClient({ api: createLocalInboxApi(idb), idb, ...quiet() });
    expect((await two.list()).map((i) => i.text)).toEqual(["kept"]);
  });

  it("refuses the 201st unplaced item with the full-Inbox message", async () => {
    const api = createLocalInboxApi(idb);
    for (let i = 0; i < INBOX_LIMIT; i++) await api.create(text(`n${i}`));
    await expect(api.create(text("too many"))).rejects.toMatchObject({ status: 409, code: "inbox-full" });
    const { items } = await api.list({ placed: false });
    await api.setPlaced(items[0].id, true);
    await expect(api.create(text("fits now"))).resolves.toBeTruthy();
  });

  it("counts only unplaced items in `unplaced`", async () => {
    const api = createLocalInboxApi(idb);
    const { id } = await api.create(text("a"));
    await api.create(text("b"));
    await api.setPlaced(id, true);
    expect((await api.list({})).unplaced).toBe(1);
  });
});
