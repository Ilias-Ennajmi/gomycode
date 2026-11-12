import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeClient, newDb, type FakeDb } from "./helpers/fake-supabase";

const OWNER = "11111111-1111-4111-8111-111111111111";
const STRANGER = "22222222-2222-4222-8222-222222222222";
const FOLDER = "33333333-3333-4333-8333-333333333333";
const OTHERS_FOLDER = "44444444-4444-4444-8444-444444444444";
const BOARD = "55555555-5555-4555-8555-555555555555";
const OTHERS_BOARD = "66666666-6666-4666-8666-666666666666";

let db: FakeDb;
let claims: Record<string, unknown> | null;
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => fakeClient(db, claims)),
}));

import { GET, POST } from "@/app/api/boards/route";
import { DELETE, PATCH } from "@/app/api/boards/[id]/route";
import { GET as GET_FOLDERS, POST as POST_FOLDER } from "@/app/api/folders/route";
import { DELETE as DELETE_FOLDER, PATCH as PATCH_FOLDER } from "@/app/api/folders/[id]/route";

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

const req = (method: string, body?: unknown, url = "http://localhost/api/boards") =>
  new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

function seed() {
  db = newDb();
  db.tables.folders.push(
    { id: FOLDER, owner_id: OWNER, name: "Clients", parent_id: null, sort: 0 },
    { id: OTHERS_FOLDER, owner_id: STRANGER, name: "Secret", parent_id: null, sort: 0 },
  );
  db.tables.boards.push(
    { id: BOARD, owner_id: OWNER, folder_id: null, title: "Brand refresh", starred: false, preview: [], last_opened_at: null, deleted_at: null, created_at: ago(9), updated_at: ago(2) },
    { id: OTHERS_BOARD, owner_id: STRANGER, folder_id: null, title: "Not yours", starred: false, preview: [], last_opened_at: null, deleted_at: null, created_at: ago(9), updated_at: ago(2) },
  );
}

beforeEach(() => {
  vi.stubEnv("ATELIER_OWNER_ID", OWNER);
  vi.stubEnv("ATELIER_LOCAL_ONLY", "");
  claims = { sub: OWNER, aal: "aal2" };
  seed();
});
afterEach(() => vi.unstubAllEnvs());

describe("owner checks", () => {
  const calls: Array<[string, () => Promise<Response>]> = [
    ["GET /api/boards", () => GET()],
    ["POST /api/boards", () => POST(req("POST", { title: "x" }))],
    ["PATCH /api/boards/:id", () => PATCH(req("PATCH", { title: "x" }), ctx(BOARD))],
    ["DELETE /api/boards/:id", () => DELETE(req("DELETE"), ctx(BOARD))],
    ["POST /api/folders", () => POST_FOLDER(req("POST", { name: "x" }))],
    ["DELETE /api/folders/:id", () => DELETE_FOLDER(req("DELETE"), ctx(FOLDER))],
  ];

  it.each(calls)("%s: 401 without a session", async (_n, call) => {
    claims = null;
    const res = await call();
    expect(res.status).toBe(401);
  });

  it.each(calls)("%s: 403 for another identity, and nothing changes", async (_n, call) => {
    claims = { sub: STRANGER, aal: "aal2" };
    const before = JSON.stringify(db);
    const res = await call();
    expect(res.status).toBe(403);
    expect(JSON.stringify(db)).toBe(before);
  });

  it.each(calls)("%s: 403 for an anonymous identity even with the owner's id", async (_n, call) => {
    claims = { sub: OWNER, aal: "aal2", is_anonymous: true };
    expect((await call()).status).toBe(403);
  });

  it.each(calls)("%s: 503 in local-only mode (the browser keeps boards itself)", async (_n, call) => {
    vi.stubEnv("ATELIER_LOCAL_ONLY", "1");
    expect((await call()).status).toBe(503);
  });
});

describe("GET /api/boards", () => {
  it("returns the owner's live boards, trash and folders only, as summaries", async () => {
    db.tables.boards.push(
      { id: "a1111111-1111-4111-8111-111111111111", owner_id: OWNER, title: "Deleted lately", starred: true, folder_id: FOLDER, preview: ["x"], last_opened_at: ago(1), deleted_at: ago(5), updated_at: ago(5) },
      { id: "b1111111-1111-4111-8111-111111111111", owner_id: OWNER, title: "Deleted long ago", deleted_at: ago(31), updated_at: ago(40) },
    );
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    const body = await res.json();
    expect(body.boards.map((b: { id: string }) => b.id)).toEqual([BOARD]);
    expect(body.trash.map((b: { title: string }) => b.title)).toEqual(["Deleted lately"]);
    expect(body.folders).toEqual([{ id: FOLDER, name: "Clients", parentId: null, sort: 0 }]);
    expect(body.boards[0]).toEqual({
      id: BOARD,
      title: "Brand refresh",
      folderId: null,
      starred: false,
      updatedAt: expect.any(String),
      lastOpenedAt: null,
      deletedAt: null,
      preview: [],
    });
    expect(body.trash[0]).toMatchObject({ folderId: FOLDER, starred: true, preview: ["x"], deletedAt: expect.any(String) });
    expect(JSON.stringify(body)).not.toContain("owner_id");
    expect(JSON.stringify(body)).not.toContain("Not yours");
  });
});

describe("POST /api/boards", () => {
  it("creates a board and returns its id", async () => {
    const res = await POST(req("POST", { title: "  Spring campaign ", folderId: FOLDER, templateId: "moodboard" }));
    expect(res.status).toBe(201);
    const { id } = await res.json();
    const row = db.tables.boards.find((b) => b.id === id)!;
    expect(row).toMatchObject({ title: "Spring campaign", folder_id: FOLDER, owner_id: OWNER });
  });

  it("defaults the title to Untitled and accepts no body fields at all", async () => {
    const res = await POST(req("POST", {}));
    expect(res.status).toBe(201);
    const { id } = await res.json();
    expect(db.tables.boards.find((b) => b.id === id)!.title).toBe("Untitled");
  });

  it.each([
    ["unknown template", { templateId: "poster" }],
    ["title too long", { title: "x".repeat(301) }],
    ["blank title", { title: "   " }],
    ["not a folder id", { folderId: "nope" }],
    ["extra keys", { ownerId: STRANGER }],
  ])("400 for %s", async (_n, body) => {
    const before = db.tables.boards.length;
    expect((await POST(req("POST", body))).status).toBe(400);
    expect(db.tables.boards.length).toBe(before);
  });

  it("400 for malformed JSON", async () => {
    expect((await POST(req("POST", "{nope"))).status).toBe(400);
  });

  it("404 when the folder belongs to someone else (and nothing is created)", async () => {
    const before = db.tables.boards.length;
    const res = await POST(req("POST", { folderId: OTHERS_FOLDER }));
    expect(res.status).toBe(404);
    expect(db.tables.boards.length).toBe(before);
  });

  it("keeps markup in a title as plain text", async () => {
    const { id } = await (await POST(req("POST", { title: "<img src=x onerror=alert(1)>" }))).json();
    expect(db.tables.boards.find((b) => b.id === id)!.title).toBe("<img src=x onerror=alert(1)>");
  });
});

describe("PATCH /api/boards/:id", () => {
  it("renames, stars and moves", async () => {
    const res = await PATCH(req("PATCH", { title: "Renamed", starred: true, folderId: FOLDER }), ctx(BOARD));
    expect(res.status).toBe(200);
    expect(db.tables.boards.find((b) => b.id === BOARD)).toMatchObject({ title: "Renamed", starred: true, folder_id: FOLDER });
    expect(await res.json()).toMatchObject({ id: BOARD, title: "Renamed", starred: true, folderId: FOLDER });
  });

  it("can take a board out of its folder", async () => {
    await PATCH(req("PATCH", { folderId: FOLDER }), ctx(BOARD));
    await PATCH(req("PATCH", { folderId: null }), ctx(BOARD));
    expect(db.tables.boards.find((b) => b.id === BOARD)!.folder_id).toBeNull();
  });

  it("stores up to four preview asset ids", async () => {
    const ids = [1, 2, 3, 4].map((n) => `aaaaaaa${n}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`);
    expect((await PATCH(req("PATCH", { preview: ids }), ctx(BOARD))).status).toBe(200);
    expect(db.tables.boards.find((b) => b.id === BOARD)!.preview).toEqual(ids);
    const five = [...ids, "aaaaaaa5-aaaa-4aaa-8aaa-aaaaaaaaaaaa"];
    expect((await PATCH(req("PATCH", { preview: five }), ctx(BOARD))).status).toBe(400);
  });

  it("records an open as the server's clock, not the client's", async () => {
    await PATCH(req("PATCH", { lastOpenedAt: "1999-01-01T00:00:00Z" }), ctx(BOARD));
    const opened = new Date(db.tables.boards.find((b) => b.id === BOARD)!.last_opened_at as string).getTime();
    expect(Math.abs(Date.now() - opened)).toBeLessThan(5000);
  });

  it("does not touch another owner's board: 404 and unchanged", async () => {
    const before = JSON.stringify(db.tables.boards.find((b) => b.id === OTHERS_BOARD));
    const res = await PATCH(req("PATCH", { title: "Mine now", starred: true }), ctx(OTHERS_BOARD));
    expect(res.status).toBe(404);
    expect(JSON.stringify(db.tables.boards.find((b) => b.id === OTHERS_BOARD))).toBe(before);
  });

  it("404 when moving into someone else's folder", async () => {
    expect((await PATCH(req("PATCH", { folderId: OTHERS_FOLDER }), ctx(BOARD))).status).toBe(404);
    expect(db.tables.boards.find((b) => b.id === BOARD)!.folder_id).toBeNull();
  });

  it("404 for ids that are not uuids, 400 for bad bodies", async () => {
    expect((await PATCH(req("PATCH", { title: "x" }), ctx("../etc"))).status).toBe(404);
    expect((await PATCH(req("PATCH", { title: "" }), ctx(BOARD))).status).toBe(400);
    expect((await PATCH(req("PATCH", { starred: "yes" }), ctx(BOARD))).status).toBe(400);
    expect((await PATCH(req("PATCH", { owner_id: STRANGER }), ctx(BOARD))).status).toBe(400);
    expect((await PATCH(req("PATCH", {}), ctx(BOARD))).status).toBe(400);
  });
});

describe("soft delete and restore", () => {
  it("DELETE hides the board from the list and puts it in the trash", async () => {
    const res = await DELETE(req("DELETE"), ctx(BOARD));
    expect(res.status).toBe(200);
    expect(db.tables.boards.find((b) => b.id === BOARD)).toBeDefined(); // soft: the row stays
    const body = await (await GET()).json();
    expect(body.boards).toEqual([]);
    expect(body.trash.map((b: { id: string }) => b.id)).toEqual([BOARD]);
  });

  it("PATCH deletedAt: null restores within 30 days", async () => {
    await DELETE(req("DELETE"), ctx(BOARD));
    const res = await PATCH(req("PATCH", { deletedAt: null }), ctx(BOARD));
    expect(res.status).toBe(200);
    const body = await (await GET()).json();
    expect(body.boards.map((b: { id: string }) => b.id)).toEqual([BOARD]);
    expect(body.trash).toEqual([]);
  });

  it("PATCH with a deletedAt timestamp trashes (using the server clock)", async () => {
    await PATCH(req("PATCH", { deletedAt: "2001-01-01T00:00:00Z" }), ctx(BOARD));
    const at = new Date(db.tables.boards.find((b) => b.id === BOARD)!.deleted_at as string).getTime();
    expect(Math.abs(Date.now() - at)).toBeLessThan(5000);
  });

  it("410 when restoring after the 30 days are over, and the row stays deleted", async () => {
    db.tables.boards.find((b) => b.id === BOARD)!.deleted_at = ago(31);
    const res = await PATCH(req("PATCH", { deletedAt: null }), ctx(BOARD));
    expect(res.status).toBe(410);
    expect(db.tables.boards.find((b) => b.id === BOARD)!.deleted_at).not.toBeNull();
  });

  it("DELETE by the owner of someone else's board changes nothing", async () => {
    expect((await DELETE(req("DELETE"), ctx(OTHERS_BOARD))).status).toBe(404);
    expect(db.tables.boards.find((b) => b.id === OTHERS_BOARD)!.deleted_at).toBeNull();
  });

  it("deleting twice keeps the first deletion time", async () => {
    await DELETE(req("DELETE"), ctx(BOARD));
    const first = db.tables.boards.find((b) => b.id === BOARD)!.deleted_at;
    await DELETE(req("DELETE"), ctx(BOARD));
    expect(db.tables.boards.find((b) => b.id === BOARD)!.deleted_at).toBe(first);
  });
});

describe("folders API", () => {
  it("creates, lists, renames and nests folders", async () => {
    const created = await POST_FOLDER(req("POST", { name: " Moodboards ", parentId: FOLDER }, "http://localhost/api/folders"));
    expect(created.status).toBe(201);
    const { id } = await created.json();
    expect(db.tables.folders.find((f) => f.id === id)).toMatchObject({ name: "Moodboards", parent_id: FOLDER, owner_id: OWNER });

    expect((await PATCH_FOLDER(req("PATCH", { name: "Looks" }), ctx(id))).status).toBe(200);
    expect(db.tables.folders.find((f) => f.id === id)!.name).toBe("Looks");

    const list = await (await GET_FOLDERS()).json();
    expect(list.folders.map((f: { id: string }) => f.id).sort()).toEqual([FOLDER, id].sort());
  });

  it("refuses someone else's parent, bad names, and cycles", async () => {
    expect((await POST_FOLDER(req("POST", { name: "x", parentId: OTHERS_FOLDER }))).status).toBe(404);
    expect((await POST_FOLDER(req("POST", { name: "" }))).status).toBe(400);
    expect((await POST_FOLDER(req("POST", { name: "x".repeat(201) }))).status).toBe(400);
    const { id: child } = await (await POST_FOLDER(req("POST", { name: "Child", parentId: FOLDER }))).json();
    expect((await PATCH_FOLDER(req("PATCH", { parentId: child }), ctx(FOLDER))).status).toBe(400);
    expect((await PATCH_FOLDER(req("PATCH", { parentId: FOLDER }), ctx(FOLDER))).status).toBe(400);
  });

  it("does not touch another owner's folder", async () => {
    expect((await PATCH_FOLDER(req("PATCH", { name: "Mine" }), ctx(OTHERS_FOLDER))).status).toBe(404);
    expect((await DELETE_FOLDER(req("DELETE"), ctx(OTHERS_FOLDER))).status).toBe(404);
    expect(db.tables.folders.find((f) => f.id === OTHERS_FOLDER)!.name).toBe("Secret");
  });

  it("deleting a folder lifts its sub-folders one level and leaves boards unfiled", async () => {
    const { id: child } = await (await POST_FOLDER(req("POST", { name: "Child", parentId: FOLDER }))).json();
    expect((await DELETE_FOLDER(req("DELETE"), ctx(FOLDER))).status).toBe(200);
    expect(db.tables.folders.find((f) => f.id === FOLDER)).toBeUndefined();
    expect(db.tables.folders.find((f) => f.id === child)!.parent_id).toBeNull();
  });
});
