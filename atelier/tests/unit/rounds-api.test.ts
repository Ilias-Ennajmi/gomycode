import * as Y from "yjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { defaultsFor } from "@/lib/engine/model/defaults";
import type { NewObject } from "@/lib/engine/model/types";
import { MemoryShareStore } from "@/lib/server/share-store-memory";
import { setShareStore } from "@/lib/server/share-store";

const OWNER = "11111111-1111-4111-8111-111111111111";
const STRANGER = "22222222-2222-4222-8222-222222222222";
const BOARD = "55555555-5555-4555-8555-555555555555";
const OTHERS_BOARD = "66666666-6666-4666-8666-666666666666";
const ORIGIN = "https://atelier.example.com";

let claims: Record<string, unknown> | null;
let levels: { currentLevel: string; nextLevel: string };
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({
    auth: {
      getClaims: async () => (claims ? { data: { claims }, error: null } : { data: null, error: { message: "no session" } }),
      mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: levels, error: null }) },
    },
  })),
}));

import { GET, POST } from "@/app/api/boards/[id]/rounds/route";
import { POST as PREPARE } from "@/app/api/boards/[id]/rounds/prepare/route";
import { roundLimits } from "@/lib/server/rounds-api";

let store: MemoryShareStore;
const board = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (method: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request(`${ORIGIN}/api/x`, {
    method,
    headers: { "content-type": "application/json", origin: ORIGIN, ...headers },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });

function seedBoardWithFrames(boardId: string, ids: string[]) {
  const doc = new BoardDoc();
  for (const id of ids) doc.create({ ...defaultsFor("frame"), id } as NewObject);
  store.seedLiveState(boardId, Y.encodeStateAsUpdate(doc.ydoc));
}

beforeEach(() => {
  vi.stubEnv("ATELIER_OWNER_ID", OWNER);
  vi.stubEnv("ATELIER_LOCAL_ONLY", "");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", ORIGIN);
  vi.stubEnv("R2_ACCOUNT_ID", "acct");
  vi.stubEnv("R2_ACCESS_KEY_ID", "key");
  vi.stubEnv("R2_SECRET_ACCESS_KEY", "secret");
  vi.stubEnv("R2_BUCKET", "bucket");
  claims = { sub: OWNER, aal: "aal2" };
  levels = { currentLevel: "aal2", nextLevel: "aal2" };
  store = new MemoryShareStore();
  store.seedBoard({ id: BOARD, ownerId: OWNER, title: "Brand" });
  store.seedBoard({ id: OTHERS_BOARD, ownerId: STRANGER, title: "Theirs" });
  seedBoardWithFrames(BOARD, ["f1", "f2"]);
  setShareStore(store);
  roundLimits.publish.reset();
  roundLimits.prepare.reset();
});
afterEach(() => {
  setShareStore(null);
  vi.unstubAllEnvs();
});

const prepare = (body: unknown, id = BOARD, h: Record<string, string> = {}) => PREPARE(req("POST", body, h), board(id));
const publish = (body: unknown, id = BOARD, h: Record<string, string> = {}) => POST(req("POST", body, h), board(id));
const okFrames = [{ frameId: "f1", bytes1280: 200_000, bytes480: 30_000 }, { frameId: "f2", bytes1280: 100_000, bytes480: 20_000 }];

describe("owner checks", () => {
  const calls: [string, () => Promise<Response>][] = [
    ["GET list", () => GET(req("GET"), board(BOARD))],
    ["POST prepare", () => prepare({ frames: okFrames })],
    ["POST publish", () => publish({ label: "x", previewToken: null, frames: [] })],
  ];
  it.each(calls)("%s: 401 without a session", async (_n, call) => {
    claims = null;
    expect((await call()).status).toBe(401);
  });
  it.each(calls)("%s: 403 for another identity", async (_n, call) => {
    claims = { sub: STRANGER, aal: "aal2" };
    expect((await call()).status).toBe(403);
    expect(await store.listRounds(BOARD)).toEqual([]);
  });
  it("404 for another owner's board and for a malformed id", async () => {
    // the stranger is, for this test, the one configured owner, asking about the owner's board
    vi.stubEnv("ATELIER_OWNER_ID", STRANGER);
    claims = { sub: STRANGER, aal: "aal2" };
    expect((await GET(req("GET"), board(BOARD))).status).toBe(404);
    expect((await prepare({ frames: okFrames }, BOARD)).status).toBe(404);
    expect((await publish({ label: "", previewToken: null, frames: [] }, BOARD)).status).toBe(404);
    expect((await publish({}, "../../etc")).status).toBe(404);
    expect(await store.listRounds(BOARD)).toEqual([]);
  });
  it("a mutating call from another origin is refused before anything happens", async () => {
    expect((await prepare({ frames: okFrames }, BOARD, { origin: "https://evil.example" })).status).toBe(403);
    expect((await publish({ label: "x", previewToken: null, frames: [] }, BOARD, { origin: "https://evil.example" })).status).toBe(403);
    expect(await store.listRounds(BOARD)).toEqual([]);
    expect(await store.listSnapshots(BOARD)).toEqual([]);
  });
  it("a board in the trash cannot be published", async () => {
    store.seedBoard({ id: BOARD, ownerId: OWNER, deletedAt: "2026-11-01T00:00:00Z" });
    expect((await publish({ label: "x", previewToken: null, frames: [] })).status).toBe(404);
  });
});

describe("POST /api/boards/[id]/rounds/prepare", () => {
  it("returns a token and presigned PUT URLs for exactly the frames asked for", async () => {
    const res = await prepare({ frames: okFrames });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const body = await res.json();
    expect(body.previewToken).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(Object.keys(body.uploads).sort()).toEqual(["f1", "f2"]);
    for (const id of ["f1", "f2"]) {
      expect(body.uploads[id].w480).toContain(`/bucket/p/${body.previewToken}/${id}-w480.webp`);
      expect(body.uploads[id].w1280).toContain(`/bucket/p/${body.previewToken}/${id}-w1280.webp`);
      expect(body.uploads[id].w480).toContain("content-type"); // the type is signed in
      expect(body.uploads[id].w480).toContain("X-Amz-Expires=600");
    }
  });

  it("a new token each time", async () => {
    const a = await (await prepare({ frames: okFrames })).json();
    const b = await (await prepare({ frames: okFrames })).json();
    expect(a.previewToken).not.toBe(b.previewToken);
  });

  it("101 frames are refused", async () => {
    const frames = Array.from({ length: 101 }, (_, i) => ({ frameId: `f${i}`, bytes1280: 10, bytes480: 10 }));
    const res = await prepare({ frames });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("too-many-frames");
  });

  it("a file declared at 4 MB is refused, and one at exactly 3 MB is accepted", async () => {
    expect((await prepare({ frames: [{ frameId: "f1", bytes1280: 4 * 1024 * 1024, bytes480: 10 }] })).status).toBe(400);
    expect((await prepare({ frames: [{ frameId: "f1", bytes1280: 10, bytes480: 4 * 1024 * 1024 }] })).status).toBe(400);
    expect((await prepare({ frames: [{ frameId: "f1", bytes1280: 3 * 1024 * 1024, bytes480: 10 }] })).status).toBe(200);
  });

  it.each([
    ["frame id with a slash", [{ frameId: "../x", bytes1280: 10, bytes480: 10 }]],
    ["empty frame id", [{ frameId: "", bytes1280: 10, bytes480: 10 }]],
    ["frame id over 40 chars", [{ frameId: "x".repeat(41), bytes1280: 10, bytes480: 10 }]],
    ["duplicate frame ids", [{ frameId: "f1", bytes1280: 10, bytes480: 10 }, { frameId: "f1", bytes1280: 10, bytes480: 10 }]],
    ["zero bytes", [{ frameId: "f1", bytes1280: 0, bytes480: 10 }]],
    ["NaN bytes", [{ frameId: "f1", bytes1280: "NaN", bytes480: 10 }]],
    ["not an array", "frames"],
    ["a non-object entry", [7]],
  ])("rejects %s", async (_n, frames) => {
    expect((await prepare({ frames })).status).toBe(400);
  });

  it("an empty list is fine (no frames, no previews)", async () => {
    const body = await (await prepare({ frames: [] })).json();
    expect(body.uploads).toEqual({});
  });

  it("503 when R2 is not configured, and no URL leaks", async () => {
    vi.stubEnv("R2_BUCKET", "");
    const res = await prepare({ frames: okFrames });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "not-configured" });
  });

  it("is rate limited per owner with Retry-After", async () => {
    let last: Response | null = null;
    for (let i = 0; i < 40; i++) {
      last = await prepare({ frames: [] });
      if (last.status === 429) break;
    }
    expect(last!.status).toBe(429);
    expect(Number(last!.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
  });

  it("an oversized body is refused", async () => {
    const res = await prepare({ frames: [], pad: "x".repeat(200_000) });
    expect(res.status).toBe(413);
  });
});

describe("POST /api/boards/[id]/rounds", () => {
  it("publishes: a round with the server's snapshot, diff and preview keys", async () => {
    const token = (await (await prepare({ frames: okFrames })).json()).previewToken as string;
    const res = await publish({ label: "Direction A", previewToken: token, frames: [{ frameId: "f1", name: "One", w: 1280, h: 720 }, { frameId: "nope", name: "x", w: 1, h: 1 }] });
    expect(res.status).toBe(201);
    const round = await res.json();
    expect(round).toMatchObject({ number: 1, label: "Direction A", boardId: BOARD });
    expect(Object.keys(round.previews)).toEqual(["f1"]);
    expect(round.previews.f1.w1280).toBe(`p/${token}/f1-w1280.webp`);
    expect(round.diff.added.sort()).toEqual(["f1", "f2"]);
    expect((await store.listRounds(BOARD))[0].id).toBe(round.id);
    // the frozen state is the server's, not the request's
    expect(await store.getSnapshotState(round.snapshotId, BOARD)).not.toBeNull();
  });

  it("ignores any state the client tries to send", async () => {
    const evil = new BoardDoc();
    evil.create({ ...defaultsFor("frame"), id: "evil" } as NewObject);
    const res = await publish({ label: "x", previewToken: null, frames: [], state: Buffer.from(Y.encodeStateAsUpdate(evil.ydoc)).toString("base64") });
    const round = await res.json();
    expect(round.diff.added).not.toContain("evil");
  });

  it.each([
    ["frames not an array", { label: "x", previewToken: null, frames: "f1" }],
    ["label not a string", { label: 5, previewToken: null, frames: [] }],
    ["label of a megabyte", { label: "x".repeat(1_000_000), previewToken: null, frames: [] }],
    ["token not a string", { label: "x", previewToken: 5, frames: [] }],
    ["101 frames", { label: "x", previewToken: null, frames: Array.from({ length: 101 }, (_, i) => ({ frameId: `f${i}`, name: "n", w: 1, h: 1 })) }],
    ["a frame without a name", { label: "x", previewToken: null, frames: [{ frameId: "f1", w: 1, h: 1 }] }],
  ])("400 or 413: %s", async (_n, body) => {
    const res = await publish(body);
    expect([400, 413]).toContain(res.status);
    expect(await store.listRounds(BOARD)).toEqual([]);
    expect(await store.listSnapshots(BOARD)).toEqual([]);
  });

  it("not JSON: 415 / 400", async () => {
    expect((await POST(new Request(`${ORIGIN}/x`, { method: "POST", headers: { origin: ORIGIN, "content-type": "text/plain" }, body: "x" }), board(BOARD))).status).toBe(415);
    expect((await publish("{nope")).status).toBe(400);
  });

  it("numbers 1, 2 and lists newest first", async () => {
    await publish({ label: "A", previewToken: null, frames: [] });
    await publish({ label: "B", previewToken: null, frames: [] });
    const list = await (await GET(req("GET"), board(BOARD))).json();
    expect(list.rounds.map((r: { number: number }) => r.number)).toEqual([2, 1]);
  });

  it("is rate limited", async () => {
    let status = 0;
    for (let i = 0; i < 20 && status !== 429; i++) status = (await publish({ label: "x", previewToken: null, frames: [] })).status;
    expect(status).toBe(429);
  });

  it("413 for a board over the size cap, with nothing stored", async () => {
    const big: typeof store.snapshotBoard = async () => {
      const { StateTooLargeError } = await import("@/lib/server/state");
      throw new StateTooLargeError(99_000_000);
    };
    vi.spyOn(store, "snapshotBoard").mockImplementation(big);
    const res = await publish({ label: "x", previewToken: null, frames: [] });
    expect(res.status).toBe(413);
    expect((await res.json()).error).toBe("board-too-large");
  });

  it("409 when another publish keeps taking the number", async () => {
    const { RoundNumberTakenError } = await import("@/lib/server/share-store");
    vi.spyOn(store, "insertRound").mockImplementation(async (row) => {
      throw new RoundNumberTakenError(row.boardId, row.number);
    });
    const res = await publish({ label: "x", previewToken: null, frames: [] });
    expect(res.status).toBe(409);
    expect(await store.listSnapshots(BOARD)).toEqual([]);
  });
});
