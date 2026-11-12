import { beforeEach, describe, expect, it } from "vitest";
import { clearLinkStateCache } from "@/lib/server/link-state";
import { loadSharePage } from "@/lib/server/share-page";
import { passwordHasher } from "@/lib/share/password";
import { EMPTY_ROUND_DIFF } from "@/lib/share/round-types";
import { generateToken } from "@/lib/share/token";
import { A1, A2, A3, A4, NOTES_A, makeFixture, type Fixture } from "./helpers/viewer-fixture";
import { BOARD, SECRET, makeWorld, visitorRequest, type World } from "./helpers/share-world";

let w: World;
let fx: Fixture;
const BASE = "https://assets.example.com";
const deps = () => ({ store: w.store, now: () => w.clock.now, secrets: [SECRET], assetBase: BASE, env: { ATELIER_STUDIO_NAME: "Studio Nord" } });
const load = (token = w.token, cookie: string | null = null) => loadSharePage(visitorRequest(`/s/${token}`, { cookie }), token, deps());

beforeEach(async () => {
  clearLinkStateCache();
  fx = makeFixture();
  w = await makeWorld();
  w.store.seedLiveState(BOARD, fx.state);
  for (const id of [A1, A2, A3, A4]) w.store.seedAsset({ id });
});

describe("loadSharePage: dead links are one answer", () => {
  it("unknown token, revoked, expired and a board in the trash are identical", async () => {
    const unknown = await load(generateToken().token);
    expect(unknown).toEqual({ kind: "gone" });
    await w.store.revokeLink(w.link.id, w.link.ownerId, w.clock.now);
    expect(await load()).toEqual(unknown);
    expect(await load(w.token, w.cookie())).toEqual(unknown); // even with a genuine cookie: no difference on the page
    const exp = await w.extraLink({ expiresAt: new Date(w.clock.now.getTime() - 1000).toISOString() });
    expect(await load(exp.token)).toEqual(unknown);
    w.store.seedBoard({ id: BOARD, ownerId: w.link.ownerId, deletedAt: "2026-11-01T00:00:00Z" });
    const live = await w.extraLink();
    expect(await load(live.token)).toEqual(unknown);
  });

  it("a malformed token never reaches the store", async () => {
    expect(await load("short")).toEqual({ kind: "gone" });
  });
});

describe("loadSharePage: open link", () => {
  it("inlines the board for a first visit (no cookie yet) with a stub visitor and no private text", async () => {
    const r = await load();
    expect(r.kind).toBe("ready");
    if (r.kind !== "ready") return;
    expect(r.hasSession).toBe(false);
    expect(r.visitorName).toBeNull();
    expect(r.board.slides.map((s) => s.name)).toEqual(["Direction A", "Direction B"]);
    expect(r.board.visitor.id).toBe("");
    expect(JSON.stringify(r)).not.toContain(NOTES_A);
    expect(r.studioName).toBe("Studio Nord");
    expect(r.linkKey).toBe(w.link.id.slice(0, 12));
  });

  it("with a session cookie it knows the visitor's name", async () => {
    const r = await load(w.token, w.cookie());
    expect(r.kind === "ready" && r.hasSession && r.visitorName).toBe("Jane");
    if (r.kind === "ready") expect(r.board.visitor).toEqual({ id: w.visitor.id, name: "Jane" });
  });

  it("a stale cookie (old epoch) counts as no session", async () => {
    const r = await load(w.token, w.cookie({ ep: 99 }));
    expect(r.kind === "ready" && r.hasSession).toBe(false);
  });
});

describe("loadSharePage: password link", () => {
  beforeEach(async () => {
    w = await makeWorld({ passwordHash: await passwordHasher.hash("hunter22") });
    w.store.seedLiveState(BOARD, fx.state);
  });

  it("shows only the password gate: no title, no board, no preview", async () => {
    const r = await load();
    expect(r).toEqual({ kind: "password", studioName: "Studio Nord", linkKey: w.link.id.slice(0, 12) });
  });

  it("a cookie that passed the gate opens the board", async () => {
    const r = await load(w.token, w.cookie({ pw: true }));
    expect(r.kind).toBe("ready");
  });

  it("a cookie from before the last password change does not", async () => {
    const r = await load(w.token, w.cookie({ pw: true, ep: w.link.cookieEpoch + 1 }));
    expect(r.kind).toBe("password");
  });

  it("a cookie that did not pass the gate does not", async () => {
    const r = await load(w.token, w.cookie({ pw: false }));
    expect(r.kind).toBe("password");
  });
});

describe("loadSharePage: round links", () => {
  const ROUND = "00000001-0000-4000-8000-000000000000";
  const SNAP = "00000001-1111-4111-8111-111111111111";
  beforeEach(async () => {
    w = await makeWorld({ mode: "round", roundId: ROUND });
    w.store.seedSnapshot(BOARD, SNAP, fx.state);
    w.store.seedRound({
      id: ROUND, boardId: BOARD, number: 2, label: "Round 2", snapshotId: SNAP, diff: { ...EMPTY_ROUND_DIFF }, publishedAt: "2026-11-10T00:00:00Z",
      previews: { [fx.ids.frameA]: { w480: `p/tok/${fx.ids.frameA}-w480.webp`, w1280: `p/tok/${fx.ids.frameA}-w1280.webp`, w: 1280, h: 960 } },
    });
  });

  it("the first slide's preview urls are in the first paint data", async () => {
    const r = await load();
    expect(r.kind).toBe("ready");
    if (r.kind !== "ready") return;
    expect(r.board.round?.number).toBe(2);
    expect(r.board.slides[0].previewW480).toBe(`${BASE}/p/tok/${fx.ids.frameA}-w480.webp`);
  });

  it("a missing round is a dead link, not a crash", async () => {
    w.store.seedRound({ id: ROUND, boardId: "99999999-9999-4999-8999-999999999999", number: 1, label: "x", snapshotId: SNAP, diff: { ...EMPTY_ROUND_DIFF }, publishedAt: "2026-11-10T00:00:00Z", previews: {} });
    clearLinkStateCache();
    expect(await load()).toEqual({ kind: "gone" });
  });

  it("a visit with a session records the round the visitor has now seen", async () => {
    await load(w.token, w.cookie());
    expect((await w.store.getVisitor(w.visitor.id))?.lastRoundId).toBe(ROUND);
  });
});
