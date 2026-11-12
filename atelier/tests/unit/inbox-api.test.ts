import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakePg, type FakePg } from "./helpers/fake-pg";

let pg: FakePg;
let claims: Record<string, unknown> | null;
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => pg.client(claims)),
}));

import { DELETE as deleteMany, GET as list, POST as create } from "@/app/api/inbox/route";
import { DELETE as deleteOne, PATCH as patchOne } from "@/app/api/inbox/[id]/route";
import { INBOX_LIMIT } from "@/lib/server/inbox";

const OWNER = "11111111-1111-4111-8111-111111111111";
const STRANGER = "22222222-2222-4222-8222-222222222222";
const A = "6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e01";
const THEIRS = "6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4eff";
const ITEM = "c0000000-0000-4000-8000-000000000001";
const THEIR_ITEM = "c0000000-0000-4000-8000-0000000000ff";

const json = (method: string, body: unknown) => new Request("http://atelier.test/api/inbox", { method, headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });
const post = (body: unknown) => create(json("POST", body) as never);
const get = (qs = "") => list(new Request(`http://atelier.test/api/inbox${qs}`) as never);
const items = async (qs = "") => ((await (await get(qs)).json()) as { items: Array<Record<string, unknown>>; unplaced: number });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const patch = (id: string, body: unknown) => patchOne(json("PATCH", body) as never, ctx(id));
const del = (id: string) => deleteOne(new Request("http://atelier.test/x", { method: "DELETE" }) as never, ctx(id));

const seedAsset = (id: string, owner = OWNER) => pg.tables.assets.push({ id, owner_id: owner, kind: "image", mime: "image/jpeg", width: 10, height: 10, bytes: 1, variants: {}, palette: [], hidden: false });
const seedItem = (over: Record<string, unknown> = {}, owner = OWNER) =>
  pg.tables.inbox_items.push({ id: ITEM, owner_id: owner, kind: "url", asset_id: null, url: "https://example.com", text_body: null, title: null, source_url: null, credit: null, created_at: "2026-01-01T00:00:00.000Z", placed_at: null, ...over });

beforeEach(() => {
  pg = createFakePg();
  claims = { sub: OWNER, aal: "aal2" };
  vi.stubEnv("ATELIER_OWNER_ID", OWNER);
  vi.stubEnv("ATELIER_LOCAL_ONLY", "");
  seedAsset(A);
  seedAsset(THEIRS, STRANGER);
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/inbox", () => {
  it("is owner-only: 401 without a session, 403 for another user or an anonymous identity", async () => {
    claims = null;
    expect((await post({ kind: "url", url: "https://example.com" })).status).toBe(401);
    claims = { sub: STRANGER, aal: "aal2" };
    expect((await post({ kind: "url", url: "https://example.com" })).status).toBe(403);
    claims = { sub: OWNER, is_anonymous: true, aal: "aal2" };
    expect((await post({ kind: "url", url: "https://example.com" })).status).toBe(403);
    expect(pg.tables.inbox_items).toHaveLength(0);
  });

  it("answers 503 in local-only mode (the Inbox lives on the device there)", async () => {
    vi.stubEnv("ATELIER_LOCAL_ONLY", "1");
    expect((await post({ kind: "url", url: "https://example.com" })).status).toBe(503);
  });

  it("stores a url item and returns its id", async () => {
    const res = await post({ kind: "url", url: "https://example.com/a", title: "A page", sourceUrl: "https://example.com/a" });
    expect(res.status).toBe(200);
    const { id } = (await res.json()) as { id: string };
    expect(pg.tables.inbox_items[0]).toMatchObject({ id, owner_id: OWNER, kind: "url", url: "https://example.com/a", title: "A page", source_url: "https://example.com/a", asset_id: null });
    expect(pg.tables.inbox_items[0].placed_at ?? null).toBeNull();
  });

  it("stores a text item and an image item that points at the owner's asset", async () => {
    expect((await post({ kind: "text", text: "A note to self" })).status).toBe(200);
    expect((await post({ kind: "image", assetId: A, title: "Harbour", credit: "Jane" })).status).toBe(200);
    expect(pg.tables.inbox_items.map((r) => r.kind)).toEqual(["text", "image"]);
    expect(pg.tables.inbox_items[0].text_body).toBe("A note to self");
    expect(pg.tables.inbox_items[1]).toMatchObject({ asset_id: A, credit: "Jane" });
  });

  it("rejects text over 10,000 characters, a title over 300, a url over 2,048", async () => {
    expect((await post({ kind: "text", text: "x".repeat(10_001) })).status).toBe(400);
    expect((await post({ kind: "text", text: "x".repeat(10_000) })).status).toBe(200);
    expect((await post({ kind: "text", text: "ok", title: "t".repeat(301) })).status).toBe(400);
    expect((await post({ kind: "url", url: "https://example.com/" + "a".repeat(2040) })).status).toBe(400);
  });

  it("rejects an image or video without an assetId, and a url or text item without its payload", async () => {
    expect((await post({ kind: "image" })).status).toBe(400);
    expect((await post({ kind: "video" })).status).toBe(400);
    expect((await post({ kind: "url" })).status).toBe(400);
    expect((await post({ kind: "text" })).status).toBe(400);
    expect((await post({ kind: "text", text: "   " })).status).toBe(400);
  });

  it("rejects an assetId that is someone else's, does not exist, or is malformed", async () => {
    expect((await post({ kind: "image", assetId: THEIRS })).status).toBe(400);
    expect((await post({ kind: "image", assetId: "6f1c2d3e-4b5a-4c6d-8e7f-000000000000" })).status).toBe(400);
    expect((await post({ kind: "image", assetId: "nope" })).status).toBe(400);
    expect(pg.tables.inbox_items).toHaveLength(0);
  });

  it("rejects urls that are not http(s): javascript:, data:, file:, and garbage", async () => {
    for (const url of ["javascript:alert(1)", "data:text/html,<script>1</script>", "file:///etc/passwd", "ftp://example.com", "not a url", "//example.com"]) {
      expect((await post({ kind: "url", url })).status, url).toBe(400);
    }
    expect((await post({ kind: "url", url: "https://example.com", sourceUrl: "javascript:alert(1)" })).status).toBe(400);
  });

  it("rejects unknown kinds, unknown fields, and a malformed body", async () => {
    expect((await post({ kind: "file", url: "https://example.com" })).status).toBe(400);
    expect((await post({ kind: "url", url: "https://example.com", owner_id: STRANGER })).status).toBe(400);
    expect((await post("not json")).status).toBe(400);
    expect((await post([])).status).toBe(400);
  });

  it("files the item under the caller, whatever the body says", async () => {
    await post({ kind: "text", text: "x" });
    expect(pg.tables.inbox_items[0].owner_id).toBe(OWNER);
  });

  it("refuses the 201st unplaced item with a clear message, but placed items do not count", async () => {
    for (let i = 0; i < INBOX_LIMIT; i++) seedItem({ id: `c0000000-0000-4000-8000-${String(i + 100).padStart(12, "0")}` });
    const res = await post({ kind: "text", text: "one too many" });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string; limit: number; message: string };
    expect(body).toMatchObject({ error: "inbox-full", limit: INBOX_LIMIT });
    expect(body.message).toMatch(/200/);
    pg.tables.inbox_items[0].placed_at = "2026-02-01T00:00:00.000Z";
    expect((await post({ kind: "text", text: "now it fits" })).status).toBe(200);
  });
});

describe("GET /api/inbox", () => {
  it("is owner-only", async () => {
    claims = null;
    expect((await get()).status).toBe(401);
    claims = { sub: STRANGER, aal: "aal2" };
    expect((await get()).status).toBe(403);
  });

  it("lists only the owner's items, newest first, in the client's shape", async () => {
    seedItem({ id: ITEM, created_at: "2026-01-01T00:00:00.000Z", title: "Older", url: "https://example.com/1" });
    seedItem({ id: "c0000000-0000-4000-8000-000000000002", kind: "text", url: null, text_body: "Newer", created_at: "2026-02-01T00:00:00.000Z" });
    seedItem({ id: THEIR_ITEM, created_at: "2026-03-01T00:00:00.000Z" }, STRANGER);
    const { items: list, unplaced } = await items();
    expect(list.map((i) => i.id)).toEqual(["c0000000-0000-4000-8000-000000000002", ITEM]);
    expect(unplaced).toBe(2);
    expect(list[1]).toEqual({ id: ITEM, kind: "url", assetId: null, url: "https://example.com/1", text: null, title: "Older", sourceUrl: null, credit: null, createdAt: "2026-01-01T00:00:00.000Z", placedAt: null });
    expect(list[0]).toMatchObject({ kind: "text", text: "Newer", url: null });
  });

  it("placed=0 leaves out placed items, placed=1 lists only them, and `unplaced` counts only unplaced items", async () => {
    seedItem({ id: ITEM });
    seedItem({ id: "c0000000-0000-4000-8000-000000000002", placed_at: "2026-02-01T00:00:00.000Z", created_at: "2026-01-02T00:00:00.000Z" });
    seedItem({ id: "c0000000-0000-4000-8000-000000000003", placed_at: "2026-02-01T00:00:00.000Z", created_at: "2026-01-03T00:00:00.000Z" });
    const open = await items("?placed=0");
    expect(open.items.map((i) => i.id)).toEqual([ITEM]);
    expect(open.unplaced).toBe(1);
    const done = await items("?placed=1");
    expect(done.items).toHaveLength(2);
    expect(done.unplaced).toBe(1);
    expect((await items()).items).toHaveLength(3);
  });

  it("pages with `limit` and `before`", async () => {
    for (let i = 1; i <= 5; i++) seedItem({ id: `c0000000-0000-4000-8000-00000000000${i}`, created_at: `2026-01-0${i}T00:00:00.000Z` });
    const first = await items("?limit=2");
    expect(first.items.map((i) => i.createdAt)).toEqual(["2026-01-05T00:00:00.000Z", "2026-01-04T00:00:00.000Z"]);
    const next = await items(`?limit=2&before=${encodeURIComponent("2026-01-04T00:00:00.000Z")}`);
    expect(next.items.map((i) => i.createdAt)).toEqual(["2026-01-03T00:00:00.000Z", "2026-01-02T00:00:00.000Z"]);
  });

  it("rejects a bad placed flag, limit or cursor with 400", async () => {
    for (const qs of ["?placed=2", "?limit=0", "?limit=501", "?limit=x", "?before=yesterday"]) expect((await get(qs)).status, qs).toBe(400);
  });
});

describe("PATCH and DELETE /api/inbox/:id", () => {
  beforeEach(() => {
    seedItem({ id: ITEM });
    seedItem({ id: THEIR_ITEM }, STRANGER);
  });

  it("marks an item placed and unplaced", async () => {
    expect((await patch(ITEM, { placed: true })).status).toBe(200);
    expect(pg.tables.inbox_items.find((r) => r.id === ITEM)!.placed_at).toEqual(expect.any(String));
    expect((await patch(ITEM, { placed: false })).status).toBe(200);
    expect(pg.tables.inbox_items.find((r) => r.id === ITEM)!.placed_at).toBeNull();
  });

  it("keeps the first placed time when placed again", async () => {
    await patch(ITEM, { placed: true });
    const first = pg.tables.inbox_items.find((r) => r.id === ITEM)!.placed_at;
    await new Promise((r) => setTimeout(r, 5));
    await patch(ITEM, { placed: true });
    expect(pg.tables.inbox_items.find((r) => r.id === ITEM)!.placed_at).toBe(first);
  });

  it("answers 404 for another owner's item and an unknown one, and changes nothing", async () => {
    expect((await patch(THEIR_ITEM, { placed: true })).status).toBe(404);
    expect((await del(THEIR_ITEM)).status).toBe(404);
    expect((await patch("c0000000-0000-4000-8000-0000000000aa", { placed: true })).status).toBe(404);
    expect((await del("c0000000-0000-4000-8000-0000000000aa")).status).toBe(404);
    expect(pg.tables.inbox_items.find((r) => r.id === THEIR_ITEM)!.placed_at).toBeNull();
    expect(pg.tables.inbox_items).toHaveLength(2);
  });

  it("answers 400 for a malformed id or body", async () => {
    expect((await patch("nope", { placed: true })).status).toBe(400);
    expect((await patch(ITEM, { placed: "yes" })).status).toBe(400);
    expect((await patch(ITEM, {})).status).toBe(400);
    expect((await del("nope")).status).toBe(400);
  });

  it("deletes an item", async () => {
    expect((await del(ITEM)).status).toBe(204);
    expect(pg.tables.inbox_items.map((r) => r.id)).toEqual([THEIR_ITEM]);
  });

  it("is owner-only", async () => {
    claims = null;
    expect((await patch(ITEM, { placed: true })).status).toBe(401);
    expect((await del(ITEM)).status).toBe(401);
  });
});

describe("DELETE /api/inbox (several at once)", () => {
  const many = (body: unknown) => deleteMany(json("DELETE", body) as never);
  beforeEach(() => {
    seedItem({ id: ITEM });
    seedItem({ id: "c0000000-0000-4000-8000-000000000002" });
    seedItem({ id: THEIR_ITEM }, STRANGER);
  });

  it("deletes the owner's items by id and never someone else's", async () => {
    const res = await many({ ids: [ITEM, "c0000000-0000-4000-8000-000000000002", THEIR_ITEM] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: 2 });
    expect(pg.tables.inbox_items.map((r) => r.id)).toEqual([THEIR_ITEM]);
  });

  it("deletes every placed item with { placed: true }", async () => {
    pg.tables.inbox_items.find((r) => r.id === ITEM)!.placed_at = "2026-02-01T00:00:00.000Z";
    const res = await many({ placed: true });
    expect(await res.json()).toEqual({ deleted: 1 });
    expect(pg.tables.inbox_items).toHaveLength(2);
  });

  it("rejects an empty or oversized id list, a malformed id, and an empty request", async () => {
    expect((await many({ ids: [] })).status).toBe(400);
    expect((await many({ ids: ["nope"] })).status).toBe(400);
    expect((await many({ ids: Array.from({ length: 201 }, (_, i) => `c0000000-0000-4000-8000-${String(i).padStart(12, "0")}`) })).status).toBe(400);
    expect((await many({})).status).toBe(400);
  });

  it("is owner-only", async () => {
    claims = { sub: STRANGER, aal: "aal2" };
    expect((await many({ ids: [ITEM] })).status).toBe(403);
  });
});
