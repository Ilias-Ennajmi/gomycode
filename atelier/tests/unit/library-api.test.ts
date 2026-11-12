import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakePg, type FakePg } from "./helpers/fake-pg";

let pg: FakePg;
let claims: Record<string, unknown> | null;
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => pg.client(claims)),
}));

import { GET as listAssets } from "@/app/api/assets/route";
import { DELETE as deleteAsset, GET as getAsset } from "@/app/api/assets/[id]/route";
import { GET as getDuplicates } from "@/app/api/assets/duplicates/route";
import { PUT as putUsage } from "@/app/api/boards/[id]/assets/route";

const OWNER = "11111111-1111-4111-8111-111111111111";
const STRANGER = "22222222-2222-4222-8222-222222222222";
const id = (n: number) => `6f1c2d3e-4b5a-4c6d-8e7f-${String(n).padStart(12, "0")}`;
const A = id(1);
const B = id(2);
const C = id(3);
const D = id(4);
const THEIRS = id(99);
const BOARD1 = "b0000000-0000-4000-8000-000000000001";
const BOARD2 = "b0000000-0000-4000-8000-000000000002";
const THEIR_BOARD = "b0000000-0000-4000-8000-0000000000ff";

const ctx = (i: string) => ({ params: Promise.resolve({ id: i }) });
const put = (boardId: string, body: unknown) =>
  putUsage(new Request("http://atelier.test/x", { method: "PUT", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) }) as never, ctx(boardId));
const list = (qs = "") => listAssets(new Request(`http://atelier.test/api/assets${qs}`) as never);
const assetsOf = async (qs = "") => ((await (await list(qs)).json()) as { assets: Array<Record<string, unknown> & { id: string; usedIn: number; boards: unknown[]; similarTo: string[]; createdAt: string }> }).assets;
const usages = (board?: string) => pg.tables.asset_usages.filter((u) => !board || u.board_id === board).map((u) => u.asset_id).sort();

const seed = (assetId: string, over: Record<string, unknown> = {}, owner = OWNER) =>
  pg.tables.assets.push({
    id: assetId, owner_id: owner, kind: "image", mime: "image/jpeg", width: 4000, height: 3000, bytes: 1000,
    variants: { w256: true, w1024: true, original: { bytes: 1000 } }, palette: [], phash: null, title: null, credit: null, source_url: null, licence: null,
    captured_at: null, analysis_version: 0, hidden: false, created_at: "2026-01-01T00:00:00.000Z", ...over,
  });
const board = (boardId: string, title: string, over: Record<string, unknown> = {}, owner = OWNER) =>
  pg.tables.boards.push({ id: boardId, owner_id: owner, title, deleted_at: null, created_at: "2026-01-01T00:00:00.000Z", ...over });
const use = (assetId: string, boardId: string) => pg.tables.asset_usages.push({ asset_id: assetId, board_id: boardId });

beforeEach(() => {
  pg = createFakePg();
  claims = { sub: OWNER, aal: "aal2" };
  vi.stubEnv("ATELIER_OWNER_ID", OWNER);
  vi.stubEnv("ATELIER_LOCAL_ONLY", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("PUT /api/boards/:id/assets", () => {
  beforeEach(() => {
    board(BOARD1, "One");
    board(THEIR_BOARD, "Theirs", {}, STRANGER);
    seed(A);
    seed(B);
    seed(THEIRS, {}, STRANGER);
  });

  it("is owner-only: 401 without a session, 403 for someone else", async () => {
    claims = null;
    expect((await put(BOARD1, { assetIds: [A] })).status).toBe(401);
    claims = { sub: STRANGER, aal: "aal2" };
    expect((await put(BOARD1, { assetIds: [A] })).status).toBe(403);
    expect(usages()).toEqual([]);
  });

  it("records the board's assets and answers with the count", async () => {
    const res = await put(BOARD1, { assetIds: [A, B, A] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ count: 2 });
    expect(usages(BOARD1)).toEqual([A, B]);
  });

  it("replaces the previous set: an asset taken off the board loses its row", async () => {
    await put(BOARD1, { assetIds: [A, B] });
    expect((await put(BOARD1, { assetIds: [B] })).status).toBe(200);
    expect(usages(BOARD1)).toEqual([B]);
    expect((await put(BOARD1, { assetIds: [] })).status).toBe(200);
    expect(usages(BOARD1)).toEqual([]);
  });

  it("is idempotent", async () => {
    await put(BOARD1, { assetIds: [A, B] });
    await put(BOARD1, { assetIds: [A, B] });
    expect(usages(BOARD1)).toEqual([A, B]);
    expect(pg.tables.asset_usages).toHaveLength(2);
  });

  it("leaves other boards' rows alone", async () => {
    board(BOARD2, "Two");
    await put(BOARD2, { assetIds: [A] });
    await put(BOARD1, { assetIds: [B] });
    expect(usages(BOARD2)).toEqual([A]);
  });

  it("ignores an asset id that is someone else's", async () => {
    const res = await put(BOARD1, { assetIds: [A, THEIRS] });
    expect(await res.json()).toEqual({ count: 1 });
    expect(usages(BOARD1)).toEqual([A]);
  });

  it("ignores an asset that does not exist", async () => {
    const res = await put(BOARD1, { assetIds: [A, C] });
    expect(res.status).toBe(200);
    expect(usages(BOARD1)).toEqual([A]);
  });

  it("answers 400 for more than 5,000 ids, a malformed id, or a bad body", async () => {
    const many = Array.from({ length: 5001 }, (_, i) => id(i + 1000));
    expect((await put(BOARD1, { assetIds: many })).status).toBe(400);
    expect((await put(BOARD1, { assetIds: [A, "nope"] })).status).toBe(400);
    expect((await put(BOARD1, { assetIds: "x" })).status).toBe(400);
    expect((await put(BOARD1, {})).status).toBe(400);
    expect((await put(BOARD1, "not json")).status).toBe(400);
    expect(usages()).toEqual([]);
  });

  it("accepts exactly 5,000 ids", async () => {
    const many = Array.from({ length: 5000 }, (_, i) => id(i + 1000));
    expect((await put(BOARD1, { assetIds: many })).status).toBe(200);
  });

  it("answers 404 for another owner's board and for an unknown or malformed board id", async () => {
    expect((await put(THEIR_BOARD, { assetIds: [A] })).status).toBe(404);
    expect((await put(BOARD2, { assetIds: [A] })).status).toBe(404);
    expect((await put("nope", { assetIds: [A] })).status).toBe(404);
    expect(usages()).toEqual([]);
  });
});

describe("GET /api/assets (the library)", () => {
  it("is owner-only", async () => {
    claims = null;
    expect((await list()).status).toBe(401);
    claims = { sub: STRANGER, aal: "aal2" };
    expect((await list()).status).toBe(403);
  });

  it("lists the owner's visible assets, newest first, never another owner's and never hidden ones", async () => {
    seed(A, { created_at: "2026-01-01T00:00:00.000Z" });
    seed(B, { created_at: "2026-03-01T00:00:00.000Z" });
    seed(C, { hidden: true });
    seed(THEIRS, {}, STRANGER);
    const assets = await assetsOf();
    expect(assets.map((a) => a.id)).toEqual([B, A]);
    expect(assets[0]).toMatchObject({ kind: "image", width: 4000, height: 3000, bytes: 1000, variants: ["w256", "w1024"], usedIn: 0, boards: [], similarTo: [], createdAt: "2026-03-01T00:00:00.000Z" });
  });

  it("counts the boards that use an asset but not boards in the trash", async () => {
    board(BOARD1, "Harbour");
    board(BOARD2, "Gone", { deleted_at: "2026-02-01T00:00:00.000Z" });
    seed(A);
    seed(B);
    use(A, BOARD1);
    use(A, BOARD2);
    use(B, BOARD2);
    const assets = await assetsOf();
    const a = assets.find((x) => x.id === A)!;
    expect(a.usedIn).toBe(1);
    expect(a.boards).toEqual([{ id: BOARD1, title: "Harbour" }]);
    expect(assets.find((x) => x.id === B)!.usedIn).toBe(0);
  });

  it("names at most five boards but counts them all", async () => {
    seed(A);
    for (let i = 1; i <= 7; i++) {
      const b = `b0000000-0000-4000-8000-00000000010${i}`;
      board(b, `Board ${i}`);
      use(A, b);
    }
    const [a] = await assetsOf();
    expect(a.usedIn).toBe(7);
    expect(a.boards).toHaveLength(5);
  });

  it("unused=1 keeps only assets no live board uses", async () => {
    board(BOARD1, "One");
    seed(A);
    seed(B);
    use(A, BOARD1);
    expect((await assetsOf("?unused=1")).map((a) => a.id)).toEqual([B]);
  });

  it("sorts by use (most used first) and by size (largest first)", async () => {
    board(BOARD1, "One");
    board(BOARD2, "Two");
    seed(A, { bytes: 10, created_at: "2026-01-01T00:00:00.000Z" });
    seed(B, { bytes: 5000, created_at: "2026-01-02T00:00:00.000Z" });
    seed(C, { bytes: 300, created_at: "2026-01-03T00:00:00.000Z" });
    use(C, BOARD1);
    use(C, BOARD2);
    use(A, BOARD1);
    expect((await assetsOf("?sort=used")).map((a) => a.id)).toEqual([C, A, B]);
    expect((await assetsOf("?sort=size")).map((a) => a.id)).toEqual([B, C, A]);
    expect((await assetsOf("?sort=recent")).map((a) => a.id)).toEqual([C, B, A]);
  });

  it("filters by kind", async () => {
    seed(A, { kind: "image" });
    seed(B, { kind: "gif" });
    seed(C, { kind: "video", mime: "video/mp4" });
    expect((await assetsOf("?kind=gif")).map((a) => a.id)).toEqual([B]);
    expect((await assetsOf("?kind=video")).map((a) => a.id)).toEqual([C]);
  });

  it("searches title, credit and source, ignoring case", async () => {
    seed(A, { title: "Harbour at dawn" });
    seed(B, { credit: "Jane HARBOUR Doe" });
    seed(C, { source_url: "https://example.com/harbour.jpg" });
    seed(D, { title: "Mountain" });
    expect((await assetsOf("?query=harbour")).map((a) => a.id).sort()).toEqual([A, B, C].sort());
    expect(await assetsOf("?query=nothing-here")).toEqual([]);
  });

  it("treats a search containing wildcard characters as plain text", async () => {
    seed(A, { title: "50% off" });
    seed(B, { title: "something" });
    expect((await assetsOf(`?query=${encodeURIComponent("%")}`)).map((a) => a.id)).toEqual([A]);
  });

  it("limits and pages with `before` on the recent sort", async () => {
    for (let i = 1; i <= 5; i++) seed(id(i), { created_at: `2026-01-0${i}T00:00:00.000Z` });
    const first = await assetsOf("?limit=2");
    expect(first.map((a) => a.id)).toEqual([id(5), id(4)]);
    const second = await assetsOf(`?limit=2&before=${encodeURIComponent(first[1].createdAt)}`);
    expect(second.map((a) => a.id)).toEqual([id(3), id(2)]);
  });

  it("rejects a bad sort, kind, limit or cursor with 400", async () => {
    for (const qs of ["?sort=random", "?kind=pdf", "?limit=0", "?limit=abc", "?limit=1000", "?before=yesterday"]) {
      expect((await list(qs)).status, qs).toBe(400);
    }
  });

  it("lists near-duplicates in similarTo (hamming <= 6)", async () => {
    seed(A, { phash: "0000000000000000" });
    seed(B, { phash: "000000000000000f" }); // 4 bits away
    seed(C, { phash: "00000000003fffff" }); // 20 bits from A, 18 from B
    seed(D, { phash: "ffffffffffffffff" });
    const assets = await assetsOf();
    expect(assets.find((a) => a.id === A)!.similarTo).toEqual([B]);
    expect(assets.find((a) => a.id === B)!.similarTo).toEqual([A]);
    expect(assets.find((a) => a.id === C)!.similarTo).toEqual([]);
    expect(assets.find((a) => a.id === D)!.similarTo).toEqual([]);
  });

  it("still answers ?ids= with the canvas's metadata", async () => {
    seed(A);
    const res = await list(`?ids=${A}`);
    const { assets } = (await res.json()) as { assets: Array<Record<string, unknown>> };
    expect(assets).toHaveLength(1);
    expect(assets[0].analysisVersion).toBe(0);
  });

  it("pages past PostgREST's 1,000-row default", async () => {
    for (let i = 0; i < 1100; i++) seed(id(i + 10_000), { created_at: new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString() });
    expect(((await (await list("?limit=200")).json()) as { assets: unknown[] }).assets).toHaveLength(200);
    const bySize = await assetsOf("?sort=size&limit=200");
    expect(bySize).toHaveLength(200);
  });
});

describe("GET /api/assets/:id", () => {
  it("returns one library asset, 404 for someone else's or an unknown one, 400 for a malformed id", async () => {
    board(BOARD1, "One");
    seed(A, { title: "Pier", credit: "Jane", licence: "CC0", source_url: "https://example.com/p" });
    seed(THEIRS, {}, STRANGER);
    use(A, BOARD1);
    const res = await getAsset(new Request("http://atelier.test/x") as never, ctx(A));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: A, title: "Pier", usedIn: 1, boards: [{ id: BOARD1, title: "One" }], provenance: { credit: "Jane", licence: "CC0", sourceUrl: "https://example.com/p" } });
    expect((await getAsset(new Request("http://atelier.test/x") as never, ctx(THEIRS))).status).toBe(404);
    expect((await getAsset(new Request("http://atelier.test/x") as never, ctx(B))).status).toBe(404);
    expect((await getAsset(new Request("http://atelier.test/x") as never, ctx("nope"))).status).toBe(400);
  });
});

describe("DELETE /api/assets/:id", () => {
  let r2: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.stubEnv("R2_ACCOUNT_ID", "0123456789abcdef0123456789abcdef");
    vi.stubEnv("R2_ACCESS_KEY_ID", "AKIDEXAMPLE");
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "super-secret-value");
    vi.stubEnv("R2_BUCKET", "atelier-assets");
    r2 = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", r2);
    board(BOARD1, "One");
    seed(A);
    seed(B);
    use(A, BOARD1);
  });
  const del = (i: string) => deleteAsset(new Request("http://atelier.test/x", { method: "DELETE" }) as never, ctx(i));
  const keys = () => r2.mock.calls.map((c) => new URL(String(c[0])).pathname.replace("/atelier-assets/", "")).sort();

  it("is owner-only", async () => {
    claims = null;
    expect((await del(B)).status).toBe(401);
    claims = { sub: STRANGER, aal: "aal2" };
    expect((await del(B)).status).toBe(403);
    expect(pg.tables.assets).toHaveLength(2);
  });

  it("refuses an asset a board uses: 409 in-use, nothing removed, nothing sent to R2", async () => {
    const res = await del(A);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "in-use" });
    expect(pg.tables.assets.map((a) => a.id)).toContain(A);
    expect(r2).not.toHaveBeenCalled();
  });

  it("refuses an asset that only a trashed board still uses (restoring the board would break it)", async () => {
    board(BOARD2, "Gone", { deleted_at: "2026-02-01T00:00:00.000Z" });
    use(B, BOARD2);
    const res = await del(B);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "in-trashed-board" });
    expect(pg.tables.assets.map((a) => a.id)).toContain(B);
    expect(r2).not.toHaveBeenCalled();
  });

  it("removes the R2 objects first, then the row, for an unused asset", async () => {
    const res = await del(B);
    expect(res.status).toBe(204);
    expect(pg.tables.assets.map((a) => a.id)).toEqual([A]);
    expect(keys()).toEqual([`a/${B}/original`, `a/${B}/w1024.webp`, `a/${B}/w2048.webp`, `a/${B}/w256.webp`].sort());
    for (const call of r2.mock.calls) expect((call[1] as RequestInit).method).toBe("DELETE");
  });

  it("keeps the row (so it can be retried) when R2 refuses, and says so", async () => {
    r2.mockResolvedValue(new Response("nope", { status: 500 }));
    const res = await del(B);
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ error: "storage-delete-failed" });
    expect(pg.tables.assets.map((a) => a.id)).toContain(B);
  });

  it("treats an object that is already gone (404) as deleted", async () => {
    r2.mockResolvedValue(new Response(null, { status: 404 }));
    expect((await del(B)).status).toBe(204);
    expect(pg.tables.assets.map((a) => a.id)).toEqual([A]);
  });

  it("keeps the row and answers 503 when storage is not configured", async () => {
    vi.stubEnv("R2_BUCKET", "");
    const res = await del(B);
    expect(res.status).toBe(503);
    expect(pg.tables.assets.map((a) => a.id)).toContain(B);
  });

  it("answers 404 for someone else's asset and an unknown one, 400 for a malformed id", async () => {
    seed(THEIRS, {}, STRANGER);
    expect((await del(THEIRS)).status).toBe(404);
    expect((await del(C)).status).toBe(404);
    expect((await del("nope")).status).toBe(400);
    expect(pg.tables.assets.map((a) => a.id)).toContain(THEIRS);
    expect(r2).not.toHaveBeenCalled();
  });
});

describe("GET /api/assets/duplicates", () => {
  const dups = async () => ((await (await (getDuplicates as unknown as (r: Request) => Promise<Response>)(new Request("http://atelier.test/x"))).json()) as { groups: { assetIds: string[]; dist: number }[] }).groups;

  it("is owner-only", async () => {
    claims = null;
    expect((await (getDuplicates as unknown as (r: Request) => Promise<Response>)(new Request("http://atelier.test/x"))).status).toBe(401);
  });

  it("groups hashes within 6 bits and leaves a farther one out", async () => {
    seed(A, { phash: "0000000000000000" });
    seed(B, { phash: "000000000000000f" }); // 4
    seed(C, { phash: "00000000000003ff" }); // 10 from A, 6 from B
    seed(D, { phash: "ffffffffffffffff" });
    const groups = await dups();
    // C is 6 bits from B: it joins the cluster through B (single linkage), D stays alone and is not listed.
    expect(groups).toHaveLength(1);
    expect([...groups[0].assetIds].sort()).toEqual([A, B, C].sort());
    expect(groups[0].dist).toBe(10);
  });

  it("reports the distance within a pair, 0 for exact matches", async () => {
    seed(A, { phash: "0123456789abcdef" });
    seed(B, { phash: "0123456789abcdef" });
    seed(C, { phash: "0123456789abcdee" });
    const groups = await dups();
    expect(groups).toHaveLength(1);
    expect(groups[0].dist).toBe(1);
    seed(D, { phash: "ffffffffffffff00" });
    seed(id(5), { phash: "ffffffffffffff00" });
    const again = await dups();
    expect(again.map((g) => g.dist).sort()).toEqual([0, 1]);
  });

  it("does not group a pair 7 bits apart", async () => {
    seed(A, { phash: "0000000000000000" });
    seed(B, { phash: "000000000000007f" });
    expect(await dups()).toEqual([]);
  });

  it("never mixes owners and skips hidden assets and assets without a hash", async () => {
    seed(A, { phash: "0000000000000000" });
    seed(THEIRS, { phash: "0000000000000000" }, STRANGER);
    seed(B, { phash: "0000000000000000", hidden: true });
    seed(C, { phash: null });
    expect(await dups()).toEqual([]);
  });
});
