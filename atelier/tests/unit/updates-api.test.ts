import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { createFakePg, type FakePg } from "./helpers/fake-pg";

let pg: FakePg;
let claims: Record<string, unknown> | null;
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => pg.client(claims)),
}));

import { GET, POST } from "@/app/api/boards/[id]/updates/route";
import { bytesToBase64 } from "@/lib/sync/bytes";

const OWNER = "11111111-1111-4111-8111-111111111111";
const STRANGER = "22222222-2222-4222-8222-222222222222";
const BOARD = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const THEIRS = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function edit(i: number): Uint8Array {
  const d = new Y.Doc();
  d.getMap("objects").set(`k${i}`, i);
  return Y.encodeStateAsUpdate(d);
}
function post(id: string, body: BodyInit | null, headers: Record<string, string> = {}) {
  const req = new Request(`http://atelier.test/api/boards/${id}/updates`, {
    method: "POST",
    headers: { "content-type": "application/octet-stream", "x-atelier-device": "phone-1", ...headers },
    body,
  });
  return POST(req as never, { params: Promise.resolve({ id }) });
}
function get(id: string, after?: string) {
  const url = `http://atelier.test/api/boards/${id}/updates${after === undefined ? "" : `?after=${after}`}`;
  return GET(new Request(url) as never, { params: Promise.resolve({ id }) });
}
const b64 = (u: Uint8Array) => bytesToBase64(u);

beforeEach(() => {
  pg = createFakePg();
  pg.tables.boards.push({ id: BOARD, owner_id: OWNER }, { id: THEIRS, owner_id: STRANGER });
  claims = { sub: OWNER, aal: "aal2" };
  vi.stubEnv("ATELIER_OWNER_ID", OWNER);
  vi.stubEnv("ATELIER_LOCAL_ONLY", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/boards/:id/updates", () => {
  it("stores an update and returns its seq; seqs increase", async () => {
    const a = await post(BOARD, edit(1) as BodyInit);
    expect(a.status).toBe(200);
    expect(a.headers.get("cache-control")).toBe("no-store");
    const b = await post(BOARD, edit(2) as BodyInit);
    const { seq: s1 } = await a.json();
    const { seq: s2 } = await b.json();
    expect(s2).toBeGreaterThan(s1);
    expect(pg.tables.board_updates).toHaveLength(2);
    expect(pg.tables.board_updates[0]).toMatchObject({ board_id: BOARD, device_id: "phone-1" });
    // bytea goes over PostgREST as a \x hex string
    expect(String(pg.tables.board_updates[0].update).startsWith("\\x")).toBe(true);
  });

  it("answers 401 without a session and 403 for another user, an anonymous one included", async () => {
    claims = null;
    expect((await post(BOARD, edit(1) as BodyInit)).status).toBe(401);
    claims = { sub: STRANGER, aal: "aal2" };
    expect((await post(BOARD, edit(1) as BodyInit)).status).toBe(403);
    claims = { sub: OWNER, is_anonymous: true, aal: "aal2" };
    expect((await post(BOARD, edit(1) as BodyInit)).status).toBe(403);
    expect(pg.tables.board_updates).toHaveLength(0);
  });

  it("answers 404 for a board somebody else owns, and for one that does not exist", async () => {
    expect((await post(THEIRS, edit(1) as BodyInit)).status).toBe(404);
    expect((await post("cccccccc-cccc-4ccc-8ccc-cccccccccccc", edit(1) as BodyInit)).status).toBe(404);
    expect((await post("not-a-uuid", edit(1) as BodyInit)).status).toBe(404);
    expect(pg.tables.board_updates).toHaveLength(0);
  });

  it("answers 413 above 1 MB, by declared length and by actual size", async () => {
    const big = new Uint8Array(1024 * 1024 + 1).fill(1);
    expect((await post(BOARD, big as BodyInit)).status).toBe(413);
    // a declared length over the limit is refused without reading the body
    const declared = {
      headers: new Headers({ "content-type": "application/octet-stream", "content-length": "5000000" }),
      body: null,
      arrayBuffer: async () => {
        throw new Error("must not be read");
      },
    };
    const res = await POST(declared as never, { params: Promise.resolve({ id: BOARD }) });
    expect(res.status).toBe(413);
    expect(pg.tables.board_updates).toHaveLength(0);
  });

  it("accepts exactly 1 MB of valid update", async () => {
    const d = new Y.Doc();
    d.getMap("objects").set("blob", "x".repeat(1024 * 1024 - 64));
    const u = Y.encodeStateAsUpdate(d);
    expect(u.length).toBeLessThanOrEqual(1024 * 1024);
    expect((await post(BOARD, u as BodyInit)).status).toBe(200);
  });

  it("rejects an empty body, garbage that is not a Yjs update, and the wrong content type", async () => {
    expect((await post(BOARD, null)).status).toBe(400);
    expect((await post(BOARD, new Uint8Array([255, 255, 255, 255, 255, 255, 255]) as BodyInit)).status).toBe(400);
    expect((await post(BOARD, JSON.stringify({ a: 1 }), { "content-type": "application/json" })).status).toBe(415);
    expect(pg.tables.board_updates).toHaveLength(0);
  });

  it("replaces an odd device id with a placeholder instead of storing it", async () => {
    await post(BOARD, edit(1) as BodyInit, { "x-atelier-device": "x".repeat(500) });
    expect(pg.tables.board_updates[0].device_id).toBe("unknown");
  });

  it("compacts in the background once there are more than 200 rows", async () => {
    for (let i = 0; i < 200; i++) await post(BOARD, edit(i) as BodyInit);
    const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
    for (const r of pg.tables.board_updates) r.created_at = hourAgo;
    expect((await post(BOARD, edit(999) as BodyInit)).status).toBe(200);
    expect(pg.tables.board_snapshots).toHaveLength(1);
    expect(pg.tables.board_updates.length).toBeLessThan(5);
  });

  it("still succeeds when compaction itself fails (the update is already stored)", async () => {
    for (let i = 0; i < 200; i++) await post(BOARD, edit(i) as BodyInit);
    for (const r of pg.tables.board_updates) r.created_at = new Date(Date.now() - 3_600_000).toISOString();
    pg.failNext("board_snapshots", { code: "XX000", message: "boom" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await post(BOARD, edit(999) as BodyInit);
    expect(res.status).toBe(200);
    expect(pg.tables.board_updates.length).toBeGreaterThan(200);
    warn.mockRestore();
  });
});

describe("GET /api/boards/:id/updates", () => {
  let sent: Uint8Array[];
  beforeEach(async () => {
    sent = [1, 2, 3].map(edit);
    for (const u of sent) await post(BOARD, u as BodyInit);
  });

  it("returns every update after N, in order, as base64", async () => {
    const res = await get(BOARD, "1");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body.snapshot).toBeUndefined();
    expect(body.updates.map((u: { seq: number }) => u.seq)).toEqual([2, 3]);
    expect(body.updates[0].update).toBe(b64(sent[1]));
    expect(body.more).toBe(false);
  });

  it("treats a missing after as 0", async () => {
    const body = await (await get(BOARD)).json();
    expect(body.updates).toHaveLength(3);
  });

  it("falls back to the snapshot when the reader is behind it", async () => {
    for (let i = 4; i <= 205; i++) await post(BOARD, edit(i) as BodyInit); // 205 rows
    for (const r of pg.tables.board_updates) r.created_at = new Date(Date.now() - 3_600_000).toISOString();
    await post(BOARD, edit(206) as BodyInit); // triggers compaction up to seq 205
    const snap = pg.tables.board_snapshots[0];
    expect(snap).toBeTruthy();

    const behind = await (await get(BOARD, "2")).json();
    expect(behind.snapshot.uptoSeq).toBe(snap.upto_seq);
    expect(typeof behind.snapshot.state).toBe("string");
    const doc = new Y.Doc();
    Y.applyUpdate(doc, Uint8Array.from(atob(behind.snapshot.state), (c) => c.charCodeAt(0)));
    for (const u of behind.updates) Y.applyUpdate(doc, Uint8Array.from(atob(u.update), (c) => c.charCodeAt(0)));
    expect(Object.keys(doc.getMap("objects").toJSON())).toHaveLength(206);

    const current = await (await get(BOARD, String(snap.upto_seq))).json();
    expect(current.snapshot).toBeUndefined();
  });

  it("answers 400 for a bad after, 401/403/404 like POST", async () => {
    expect((await get(BOARD, "-1")).status).toBe(400);
    expect((await get(BOARD, "abc")).status).toBe(400);
    expect((await get(THEIRS, "0")).status).toBe(404);
    claims = { sub: STRANGER, aal: "aal2" };
    expect((await get(BOARD, "0")).status).toBe(403);
    claims = null;
    expect((await get(BOARD, "0")).status).toBe(401);
  });
});
