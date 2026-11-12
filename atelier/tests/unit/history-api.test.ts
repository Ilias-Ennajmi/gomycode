import * as Y from "yjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { docFromState } from "@/lib/engine/doc/from-state";
import { defaultsFor } from "@/lib/engine/model/defaults";
import type { NewObject } from "@/lib/engine/model/types";
import { MemoryShareStore } from "@/lib/server/share-store-memory";
import { setShareStore } from "@/lib/server/share-store";
import { EMPTY_ROUND_DIFF } from "@/lib/share/round-types";

const OWNER = "11111111-1111-4111-8111-111111111111";
const STRANGER = "22222222-2222-4222-8222-222222222222";
const BOARD = "55555555-5555-4555-8555-555555555555";
const OTHERS_BOARD = "66666666-6666-4666-8666-666666666666";
const ORIGIN = "https://atelier.example.com";
const NOW = new Date("2026-06-30T08:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

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

import { GET as HISTORY } from "@/app/api/boards/[id]/history/route";
import { GET as VERSIONS } from "@/app/api/boards/[id]/versions/route";
import { POST as SNAPSHOT } from "@/app/api/boards/[id]/snapshots/route";
import { GET as DOWNLOAD } from "@/app/api/boards/[id]/snapshots/[sid]/route";
import { historyLimits } from "@/lib/server/history-api";

let store: MemoryShareStore;
const board = (id: string) => ({ params: Promise.resolve({ id }) });
const snapCtx = (id: string, sid: string) => ({ params: Promise.resolve({ id, sid }) });
const req = (method: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request(`${ORIGIN}/api/x`, {
    method,
    headers: { "content-type": "application/json", origin: ORIGIN, ...headers },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
const stateWith = (...ids: string[]) => {
  const d = new BoardDoc();
  for (const id of ids) d.create({ ...defaultsFor("shape"), id } as unknown as NewObject);
  return Y.encodeStateAsUpdate(d.ydoc);
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.stubEnv("ATELIER_OWNER_ID", OWNER);
  vi.stubEnv("ATELIER_LOCAL_ONLY", "");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", ORIGIN);
  claims = { sub: OWNER, aal: "aal2" };
  levels = { currentLevel: "aal2", nextLevel: "aal2" };
  store = new MemoryShareStore({ now: () => new Date() });
  store.seedBoard({ id: BOARD, ownerId: OWNER, title: "Brand" });
  store.seedBoard({ id: OTHERS_BOARD, ownerId: STRANGER, title: "Theirs" });
  setShareStore(store);
  historyLimits.snapshot.reset();
});
afterEach(() => {
  vi.useRealTimers();
  setShareStore(null);
  vi.unstubAllEnvs();
});

describe("owner checks", () => {
  const calls: [string, () => Promise<Response>][] = [
    ["GET history", () => HISTORY(req("GET"), board(BOARD))],
    ["GET versions", () => VERSIONS(req("GET"), board(BOARD))],
    ["POST snapshots", () => SNAPSHOT(req("POST", { label: "x" }), board(BOARD))],
    ["GET snapshot", () => DOWNLOAD(req("GET"), snapCtx(BOARD, "abc"))],
  ];
  it.each(calls)("%s: 401 without a session", async (_n, call) => {
    claims = null;
    expect((await call()).status).toBe(401);
  });
  it.each(calls)("%s: 403 for another identity", async (_n, call) => {
    claims = { sub: STRANGER, aal: "aal2" };
    expect((await call()).status).toBe(403);
  });
  it("404 for another owner's board and for malformed ids", async () => {
    vi.stubEnv("ATELIER_OWNER_ID", STRANGER);
    claims = { sub: STRANGER, aal: "aal2" };
    expect((await HISTORY(req("GET"), board(BOARD))).status).toBe(404);
    expect((await SNAPSHOT(req("POST", { label: "x" }), board(BOARD))).status).toBe(404);
    expect((await DOWNLOAD(req("GET"), snapCtx(BOARD, "abc"))).status).toBe(404);
    expect((await HISTORY(req("GET"), board("../../etc"))).status).toBe(404);
    expect(await store.listSnapshots(BOARD)).toEqual([]);
  });
  it("a snapshot of the owner's other board cannot be read through this board", async () => {
    store.seedBoard({ id: "77777777-7777-4777-8777-777777777777", ownerId: OWNER });
    store.seedSnapshot("77777777-7777-4777-8777-777777777777", "snap-other", stateWith("x"), { kind: "compaction", createdAt: daysAgo(1) });
    expect((await DOWNLOAD(req("GET"), snapCtx(BOARD, "snap-other"))).status).toBe(404);
    store.seedSnapshot(OTHERS_BOARD, "snap-theirs", stateWith("x"), { kind: "compaction", createdAt: daysAgo(1) });
    expect((await DOWNLOAD(req("GET"), snapCtx(BOARD, "snap-theirs"))).status).toBe(404);
  });
});

describe("GET /api/boards/[id]/history", () => {
  it("lists compactions of the last 30 days and every round, newest first", async () => {
    store.seedSnapshot(BOARD, "c-old", stateWith("a"), { kind: "compaction", createdAt: daysAgo(45), uptoSeq: 5 });
    store.seedSnapshot(BOARD, "c-29", stateWith("a"), { kind: "compaction", createdAt: daysAgo(29), uptoSeq: 9 });
    store.seedSnapshot(BOARD, "c-1", stateWith("a"), { kind: "compaction", createdAt: daysAgo(1), uptoSeq: 20, label: "Before restore" });
    store.seedSnapshot(BOARD, "r-old", stateWith("a"), { kind: "round", createdAt: daysAgo(80), uptoSeq: 2 });
    store.seedSnapshot(BOARD, "r-new", stateWith("a"), { kind: "round", createdAt: daysAgo(3), uptoSeq: 15 });
    store.seedSnapshot(BOARD, "orphan", stateWith("a"), { kind: "round", createdAt: daysAgo(2), uptoSeq: 16 }); // no round row: not a version
    store.seedSnapshot(OTHERS_BOARD, "theirs", stateWith("a"), { kind: "compaction", createdAt: daysAgo(1) });
    store.seedRound({ id: "ra", boardId: BOARD, number: 1, label: "Direction A", snapshotId: "r-old", previews: {}, diff: EMPTY_ROUND_DIFF, publishedAt: daysAgo(80) });
    store.seedRound({ id: "rb", boardId: BOARD, number: 2, label: "Round 2", snapshotId: "r-new", previews: {}, diff: EMPTY_ROUND_DIFF, publishedAt: daysAgo(3) });

    const res = await HISTORY(req("GET"), board(BOARD));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const { versions } = await res.json();
    expect(versions.map((v: { id: string }) => v.id)).toEqual(["c-1", "r-new", "c-29", "r-old"]);
    expect(versions[0]).toEqual({ id: "c-1", kind: "compaction", label: "Before restore", roundNumber: null, createdAt: daysAgo(1), uptoSeq: 20 });
    expect(versions[1]).toEqual({ id: "r-new", kind: "round", label: "Round 2", roundNumber: 2, createdAt: daysAgo(3), uptoSeq: 15 });
    expect(versions[3]).toMatchObject({ label: "Direction A", roundNumber: 1 });
  });

  it("an empty board has an empty history, and /versions is the same answer", async () => {
    expect(await (await HISTORY(req("GET"), board(BOARD))).json()).toEqual({ versions: [] });
    store.seedSnapshot(BOARD, "c", stateWith("a"), { kind: "compaction", createdAt: daysAgo(1) });
    expect(await (await VERSIONS(req("GET"), board(BOARD))).json()).toEqual(await (await HISTORY(req("GET"), board(BOARD))).json());
  });

  it("does not depend on the time of day: a version 30 days and one minute old is out, 29 days and 23 hours is in", async () => {
    store.seedSnapshot(BOARD, "out", stateWith("a"), { kind: "compaction", createdAt: new Date(NOW.getTime() - 30 * 86_400_000 - 60_000).toISOString() });
    store.seedSnapshot(BOARD, "in", stateWith("a"), { kind: "compaction", createdAt: new Date(NOW.getTime() - 30 * 86_400_000 + 3_600_000).toISOString() });
    expect((await (await HISTORY(req("GET"), board(BOARD))).json()).versions.map((v: { id: string }) => v.id)).toEqual(["in"]);
  });
});

describe("GET /api/boards/[id]/snapshots/[sid]", () => {
  it("returns the Yjs state as bytes that open as a board", async () => {
    store.seedSnapshot(BOARD, "snap1", stateWith("a", "b"), { kind: "compaction", createdAt: daysAgo(1) });
    const res = await DOWNLOAD(req("GET"), snapCtx(BOARD, "snap1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/octet-stream");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(docFromState(bytes).all().map((o) => o.id).sort()).toEqual(["a", "b"]);
  });
  it("a snapshot too large for one serverless response says so instead of failing in the platform", async () => {
    store.seedSnapshot(BOARD, "big", new Uint8Array(4_100_000), { kind: "compaction", createdAt: daysAgo(1) });
    const res = await DOWNLOAD(req("GET"), snapCtx(BOARD, "big"));
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "too-large" });
  });
  it("404 for an unknown or oddly shaped snapshot id", async () => {
    expect((await DOWNLOAD(req("GET"), snapCtx(BOARD, "nope"))).status).toBe(404);
    expect((await DOWNLOAD(req("GET"), snapCtx(BOARD, "../x"))).status).toBe(404);
    expect((await DOWNLOAD(req("GET"), snapCtx(BOARD, "x".repeat(200)))).status).toBe(404);
  });
});

describe("POST /api/boards/[id]/snapshots", () => {
  it("snapshots the merged server state as a labelled compaction and never deletes updates", async () => {
    store.seedLiveState(BOARD, stateWith("a"));
    const res = await SNAPSHOT(req("POST", { label: "Before restore" }), board(BOARD));
    expect(res.status).toBe(201);
    const { id } = await res.json();
    const saved = await store.getSnapshotState(id, BOARD);
    expect(docFromState(saved!).all().map((o) => o.id)).toEqual(["a"]);
    expect((await store.listSnapshots(BOARD))[0]).toMatchObject({ id, kind: "compaction", label: "Before restore" });
    expect(await store.getLiveState(BOARD)).not.toBeNull(); // the live state is untouched
  });
  it("defaults and cleans the label", async () => {
    const a = await (await SNAPSHOT(req("POST", {}), board(BOARD))).json();
    expect((await store.listSnapshots(BOARD)).find((s) => s.id === a.id)!.label).toBe("Snapshot");
    const b = await (await SNAPSHOT(req("POST", { label: "  x‮y ".padEnd(500, "z") }), board(BOARD))).json();
    const label = (await store.listSnapshots(BOARD)).find((s) => s.id === b.id)!.label!;
    expect(label.length).toBeLessThanOrEqual(120);
    expect(label).not.toContain("‮");
  });
  it("same-origin only", async () => {
    expect((await SNAPSHOT(req("POST", { label: "x" }, { origin: "https://evil.example" }), board(BOARD))).status).toBe(403);
    expect(await store.listSnapshots(BOARD)).toEqual([]);
  });
  it("400 for a label that is not a string, 413 for a huge body, 415 for another type", async () => {
    expect((await SNAPSHOT(req("POST", { label: 5 }), board(BOARD))).status).toBe(400);
    expect((await SNAPSHOT(req("POST", { label: "x".repeat(100_000) }), board(BOARD))).status).toBe(413);
    expect((await SNAPSHOT(new Request(`${ORIGIN}/x`, { method: "POST", headers: { origin: ORIGIN, "content-type": "text/plain" }, body: "x" }), board(BOARD))).status).toBe(415);
  });
  it("is rate limited per owner", async () => {
    let status = 0;
    for (let i = 0; i < 30 && status !== 429; i++) status = (await SNAPSHOT(req("POST", { label: "x" }), board(BOARD))).status;
    expect(status).toBe(429);
  });
  it("413 over the size cap, with nothing stored", async () => {
    const { StateTooLargeError } = await import("@/lib/server/state");
    vi.spyOn(store, "snapshotBoard").mockRejectedValue(new StateTooLargeError(99_000_000));
    expect((await SNAPSHOT(req("POST", { label: "x" }), board(BOARD))).status).toBe(413);
  });
});
