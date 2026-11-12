import { beforeEach, describe, expect, it } from "vitest";
import type { NewLink } from "@/lib/server/share-store";
import type { Round } from "@/lib/share/round-types";
import { EMPTY_ROUND_DIFF } from "@/lib/share/round-types";
import { emptyState, memoryHarness, supabaseHarness, type ShareHarness } from "./helpers/share-harness";
import * as Y from "yjs";

const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const BOARD = "55555555-5555-4555-8555-555555555555";
const BOARD2 = "66666666-6666-4666-8666-666666666666";

const newLink = (over: Partial<NewLink> = {}): NewLink => ({
  boardId: BOARD, ownerId: OWNER, name: "Client", tokenHash: "h".repeat(64), mode: "live", roundId: null, scope: "board", frameIds: [],
  permission: "react", passwordHash: null, expiresAt: null, welcomeNote: "", allowDownload: false, watermark: false, showCredits: false, blindVotes: false, ...over,
});
const round = (n: number, boardId = BOARD, snapshotId = `s${n}`): Round => ({
  id: `${boardId === BOARD ? "00000000" : "11111111"}-0000-4000-8000-00000000000${n}`, boardId, number: n, label: `Round ${n}`, snapshotId, previews: {}, diff: EMPTY_ROUND_DIFF,
  publishedAt: new Date(Date.UTC(2026, 10, n)).toISOString(),
});

describe.each([["memory", memoryHarness], ["supabase over the PostgREST stand-in", supabaseHarness]] as const)("ShareStore contract: %s", (_n, make) => {
  let h: ShareHarness;
  beforeEach(() => {
    h = make();
    h.seedBoard({ id: BOARD, ownerId: OWNER, title: "Brand refresh" });
    h.seedBoard({ id: BOARD2, ownerId: OTHER, title: "Other" });
  });

  describe("links", () => {
    it("inserts and reads back by hash and id, with server-set fields", async () => {
      const row = await h.store.insertLink(newLink({ name: "Acme", frameIds: [], passwordHash: "$argon2id$x" }));
      expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(row).toMatchObject({ name: "Acme", cookieEpoch: 0, revokedAt: null, votesRevealed: false, createdAt: h.clock.now.toISOString(), passwordHash: "$argon2id$x" });
      expect(await h.store.getLinkByHash("h".repeat(64))).toEqual(row);
      expect(await h.store.getLink(row.id)).toEqual(row);
      expect(await h.store.getLinkByHash("x".repeat(64))).toBeNull();
      expect(await h.store.getLink("00000000-0000-4000-8000-000000000000")).toBeNull();
    });

    it("keeps the frame list and scope", async () => {
      const row = await h.store.insertLink(newLink({ scope: "frames", frameIds: ["a", "b"] }));
      expect((await h.store.getLink(row.id))!.frameIds).toEqual(["a", "b"]);
    });

    it("revokeLink sets revokedAt, bumps the epoch and keeps the first revocation time", async () => {
      const row = await h.store.insertLink(newLink());
      const at = new Date("2026-11-13T00:00:00Z");
      const revoked = await h.store.revokeLink(row.id, OWNER, at);
      expect(revoked).toMatchObject({ revokedAt: at.toISOString(), cookieEpoch: 1 });
      const again = await h.store.revokeLink(row.id, OWNER, new Date("2026-11-14T00:00:00Z"));
      expect(again!.revokedAt).toBe(at.toISOString());
    });

    it("revokeLink, updateLink and deleteLink refuse another owner and change nothing", async () => {
      const row = await h.store.insertLink(newLink());
      expect(await h.store.revokeLink(row.id, OTHER, h.clock.now)).toBeNull();
      expect(await h.store.updateLink(row.id, OTHER, { name: "mine now" })).toBeNull();
      expect(await h.store.deleteLink(row.id, OTHER)).toBe(false);
      expect(await h.store.getLink(row.id)).toMatchObject({ name: "Client", revokedAt: null, cookieEpoch: 0 });
    });

    it("updateLink patches fields and bumps the epoch only when asked", async () => {
      const row = await h.store.insertLink(newLink());
      const a = await h.store.updateLink(row.id, OWNER, { name: "Renamed", permission: "comment", votesRevealed: true });
      expect(a).toMatchObject({ name: "Renamed", permission: "comment", votesRevealed: true, cookieEpoch: 0 });
      const b = await h.store.updateLink(row.id, OWNER, { passwordHash: "$argon2id$y", bumpEpoch: true });
      expect(b).toMatchObject({ passwordHash: "$argon2id$y", cookieEpoch: 1, name: "Renamed" });
      const c = await h.store.updateLink(row.id, OWNER, { passwordHash: null });
      expect(c!.passwordHash).toBeNull();
    });

    it("listLinks is scoped to board and owner, newest first", async () => {
      h.clock.now = new Date("2026-11-12T10:00:00Z");
      const first = await h.store.insertLink(newLink({ tokenHash: "1".repeat(64) }));
      h.clock.now = new Date("2026-11-12T11:00:00Z");
      const second = await h.store.insertLink(newLink({ tokenHash: "2".repeat(64) }));
      await h.store.insertLink(newLink({ tokenHash: "3".repeat(64), boardId: BOARD2, ownerId: OTHER }));
      expect((await h.store.listLinks(BOARD, OWNER)).map((l) => l.id)).toEqual([second.id, first.id]);
      expect(await h.store.listLinks(BOARD, OTHER)).toEqual([]);
      expect(await h.store.listLinks(BOARD2, OWNER)).toEqual([]);
    });

    it("deleteLink removes the link and its visitors and attempts", async () => {
      const row = await h.store.insertLink(newLink());
      const v = await h.store.createVisitor(row.id, "ip1");
      await h.store.recordFailure(row.id, "ip1", h.clock.now);
      expect(await h.store.deleteLink(row.id, OWNER)).toBe(true);
      expect(await h.store.getLink(row.id)).toBeNull();
      // Children go through ON DELETE CASCADE in Postgres (tested in supabase/tests/rls.sql); the stand-in has no cascades.
      if (h.cascades) {
        expect(await h.store.getVisitor(v.id)).toBeNull();
        expect(await h.store.getAttempt(row.id, "ip1")).toBeNull();
      }
      expect(await h.store.deleteLink(row.id, OWNER)).toBe(false);
    });
  });

  describe("rounds", () => {
    it("lists newest first, gets by id and finds the latest", async () => {
      h.seedRound(round(1));
      h.seedRound(round(3));
      h.seedRound(round(2));
      h.seedRound(round(1, BOARD2, "other"));
      expect((await h.store.listRounds(BOARD)).map((r) => r.number)).toEqual([3, 2, 1]);
      expect((await h.store.latestRound(BOARD))!.number).toBe(3);
      expect((await h.store.getRound(round(2).id))!).toMatchObject({ number: 2, label: "Round 2", boardId: BOARD, snapshotId: "s2" });
      expect(await h.store.getRound("00000000-0000-4000-8000-0000000000ff")).toBeNull();
      expect(await h.store.latestRound("77777777-7777-4777-8777-777777777777")).toBeNull();
    });
  });

  describe("visitors and attempts", () => {
    it("creates a visitor, names it, touches it, counts it", async () => {
      const link = await h.store.insertLink(newLink());
      const v = await h.store.createVisitor(link.id, "ipA");
      expect(v).toMatchObject({ linkId: link.id, displayName: null, lastRoundId: null });
      await h.store.setVisitorName(v.id, "Jane");
      expect((await h.store.getVisitor(v.id))!.displayName).toBe("Jane");
      const r = round(1);
      h.seedRound(r);
      await h.store.touchVisitor(v.id, { lastRoundId: r.id });
      expect((await h.store.getVisitor(v.id))!.lastRoundId).toBe(r.id);
      expect(await h.store.getVisitor("00000000-0000-4000-8000-000000000000")).toBeNull();
      await h.store.createVisitor(link.id, "ipB");
      expect(await h.store.countVisitors(link.id)).toBe(2);
    });

    it("countRecentVisitors counts one ip hash on one link since a time", async () => {
      const link = await h.store.insertLink(newLink());
      const other = await h.store.insertLink(newLink({ tokenHash: "o".repeat(64) }));
      h.clock.now = new Date("2026-11-12T09:00:00Z");
      await h.store.createVisitor(link.id, "ipA");
      h.clock.now = new Date("2026-11-12T10:30:00Z");
      await h.store.createVisitor(link.id, "ipA");
      await h.store.createVisitor(link.id, "ipB");
      await h.store.createVisitor(other.id, "ipA");
      const since = new Date("2026-11-12T10:00:00Z");
      expect(await h.store.countRecentVisitors(link.id, "ipA", since)).toBe(1);
      expect(await h.store.countRecentVisitors(link.id, "ipA", new Date("2026-11-12T08:00:00Z"))).toBe(2);
      expect(await h.store.countRecentVisitors(link.id, "ipZ", since)).toBe(0);
    });

    it("counts failures and locks with the backoff table", async () => {
      const link = await h.store.insertLink(newLink());
      expect(await h.store.getAttempt(link.id, "ip")).toBeNull();
      const t0 = h.clock.now;
      const seen: (string | null)[] = [];
      for (let i = 1; i <= 6; i++) seen.push((await h.store.recordFailure(link.id, "ip", t0)).lockedUntil);
      expect(seen.slice(0, 3)).toEqual([null, null, null]);
      expect(seen[3]).toBe(new Date(t0.getTime() + 2000).toISOString());
      expect(seen[4]).toBe(new Date(t0.getTime() + 4000).toISOString());
      expect(seen[5]).toBe(new Date(t0.getTime() + 8000).toISOString());
      expect(await h.store.getAttempt(link.id, "ip")).toMatchObject({ fails: 6 });
      // another ip hash is untouched
      expect(await h.store.getAttempt(link.id, "other")).toBeNull();
      await h.store.clearAttempts(link.id, "ip");
      expect(await h.store.getAttempt(link.id, "ip")).toBeNull();
    });

    it("starts counting again after an hour of quiet", async () => {
      const link = await h.store.insertLink(newLink());
      const t0 = h.clock.now;
      for (let i = 0; i < 5; i++) await h.store.recordFailure(link.id, "ip", t0);
      const later = new Date(t0.getTime() + 61 * 60_000);
      expect(await h.store.recordFailure(link.id, "ip", later)).toEqual({ fails: 1, lockedUntil: null });
    });
  });

  describe("board data", () => {
    it("reads the board and its title", async () => {
      expect(await h.store.getBoard(BOARD)).toEqual({ id: BOARD, ownerId: OWNER, title: "Brand refresh", deletedAt: null });
      expect(await h.store.getBoardTitle(BOARD)).toBe("Brand refresh");
      expect(await h.store.getBoard("77777777-7777-4777-8777-777777777777")).toBeNull();
      expect(await h.store.getBoardTitle("77777777-7777-4777-8777-777777777777")).toBeNull();
    });

    it("sees a trashed board as trashed", async () => {
      h.seedBoard({ id: "88888888-8888-4888-8888-888888888888", ownerId: OWNER, deletedAt: "2026-11-01T00:00:00.000Z" });
      expect((await h.store.getBoard("88888888-8888-4888-8888-888888888888"))!.deletedAt).toBe("2026-11-01T00:00:00.000Z");
    });

    it("returns a snapshot only for its own board", async () => {
      const state = emptyState();
      h.seedSnapshot(BOARD, "99999999-9999-4999-8999-999999999999", state);
      expect(Array.from((await h.store.getSnapshotState("99999999-9999-4999-8999-999999999999", BOARD))!)).toEqual(Array.from(state));
      expect(await h.store.getSnapshotState("99999999-9999-4999-8999-999999999999", BOARD2)).toBeNull();
      expect(await h.store.getSnapshotState("00000000-0000-4000-8000-000000000000", BOARD)).toBeNull();
    });

    it("merges the live state, and is null for a board with none", async () => {
      expect(await h.store.getLiveState(BOARD)).toBeNull();
      const a = new Y.Doc();
      a.getMap("meta").set("title", "one");
      h.seedLive(BOARD, Y.encodeStateAsUpdate(a));
      const b = new Y.Doc();
      Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
      b.getMap("meta").set("extra", "two");
      h.seedLive(BOARD, Y.encodeStateAsUpdate(b));
      const merged = new Y.Doc();
      Y.applyUpdate(merged, (await h.store.getLiveState(BOARD))!);
      expect(merged.getMap("meta").toJSON()).toEqual({ title: "one", extra: "two" });
    });

    it("returns only the asset rows asked for, with just the fields a viewer needs", async () => {
      const A1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
      h.seedAsset({ id: A1, credit: "Jane" });
      h.seedAsset({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2" });
      const rows = await h.store.getAssets([A1, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3", "not-an-id"]);
      expect(rows.map((r) => r.id)).toEqual([A1]);
      expect(rows[0]).toMatchObject({ kind: "image", width: 100, height: 50, credit: "Jane" });
      expect(Object.keys(rows[0]).sort()).toEqual(["credit", "height", "id", "kind", "licence", "source_url", "variants", "width"]);
      expect(await h.store.getAssets([])).toEqual([]);
    });
  });
});
