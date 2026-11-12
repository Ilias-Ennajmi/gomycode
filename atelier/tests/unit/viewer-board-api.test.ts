import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleBoard } from "@/lib/server/viewer-board";
import { EMPTY_ROUND_DIFF } from "@/lib/share/round-types";
import { visitorCookieName } from "@/lib/share/cookie";
import { generateToken } from "@/lib/share/token";
import { A1, A2, A3, A4, STICKY_B_TEXT, allStrings, makeFixture, type Fixture } from "./helpers/viewer-fixture";
import { BOARD, OWNER, SECRET, makeWorld, visitorRequest, type World } from "./helpers/share-world";

let w: World;
let fx: Fixture;
const BASE = "https://assets.example.com";
const ROUND = "00000001-0000-4000-8000-000000000000";
const SNAP = "00000001-1111-4111-8111-111111111111";

const deps = () => ({ store: w.store, now: () => w.clock.now, secrets: [SECRET], assetBase: BASE });
const get = (token = w.token, cookie: string | null = w.cookie()) => handleBoard(visitorRequest(`/api/s/${token}/board`, { cookie }), token, deps());

beforeEach(async () => {
  fx = makeFixture();
  w = await makeWorld();
  w.store.seedLiveState(BOARD, fx.state);
  for (const id of [A1, A2, A3, A4]) w.store.seedAsset({ id, width: 1600, height: 1000 });
});

describe("GET board: the guard still applies", () => {
  it("401 without a cookie, 404 for an unknown token, 404/410 for a revoked link", async () => {
    expect((await get(w.token, null)).status).toBe(401);
    expect((await get(generateToken().token)).status).toBe(404);
    await w.store.revokeLink(w.link.id, w.link.ownerId, w.clock.now);
    expect((await get()).status).toBe(410);
    expect((await get(w.token, null)).status).toBe(404);
  });

  it("another link's cookie opens nothing", async () => {
    const other = await w.extraLink();
    const res = await handleBoard(visitorRequest("/x", { cookie: w.cookie() }), other.token, deps());
    expect(res.status).toBe(401);
  });

  it("a password link needs the gate passed", async () => {
    await w.store.updateLink(w.link.id, w.link.ownerId, { passwordHash: "$argon2id$x" });
    const res = await get(w.token, w.cookie({ pw: false }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "password-required" });
  });

  it("a view-only link can still load the board", async () => {
    await w.store.updateLink(w.link.id, w.link.ownerId, { permission: "view" });
    expect((await get()).status).toBe(200);
  });

  it("an unnamed visitor can load it too (a name is only needed to react)", async () => {
    w = await makeWorld({}, { named: false });
    w.store.seedLiveState(BOARD, fx.state);
    expect((await get()).status).toBe(200);
  });

  it("a trashed board is gone", async () => {
    w.store.seedBoard({ id: BOARD, ownerId: OWNER, title: "t", deletedAt: "2026-11-01T00:00:00.000Z" });
    expect((await get()).status).toBe(410);
  });
});

describe("GET board: the body", () => {
  it("is plain JSON with no Yjs, no owner id, no hashes, no link fields", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const text = await res.text();
    const body = JSON.parse(text);
    const strings = allStrings(body);
    for (const forbidden of [OWNER, BOARD, w.link.id, w.link.tokenHash, w.token]) expect(strings, forbidden).not.toContain(forbidden);
    expect(text).not.toMatch(/tokenHash|passwordHash|ownerId|owner_id|cookieEpoch|ydoc|"state"|"update"/);
    expect(body.board.title).toBe("Brand refresh");
    expect(body.visitor).toEqual({ id: w.visitor.id, name: "Jane" });
    expect(body.assetBase).toBe(BASE);
    expect(body.objects.length).toBeGreaterThan(5);
    // every asset url pieces are keys, not signed secrets
    expect(Object.keys(body.assets).length).toBeGreaterThan(0);
  });

  it("a deep scan of every string finds no presenter notes", async () => {
    const text = await (await get()).text();
    expect(text).not.toContain("SECRET NOTES");
  });

  it("a frames link carries nothing of the other frame", async () => {
    await w.store.updateLink(w.link.id, w.link.ownerId, { scope: "frames", frameIds: [fx.ids.frameA] });
    const text = await (await get()).text();
    for (const secret of [STICKY_B_TEXT, "Direction B", A2, A3, fx.ids.frameB, fx.ids.imgB]) expect(text, secret).not.toContain(secret);
    expect(JSON.parse(text).slides).toHaveLength(1);
  });

  it("live links are never cached, round links for 30 seconds privately", async () => {
    expect((await get()).headers.get("cache-control")).toBe("private, no-store");
    w.store.seedSnapshot(BOARD, SNAP, fx.state);
    w.store.seedRound({ id: ROUND, boardId: BOARD, number: 1, label: "R1", snapshotId: SNAP, previews: {}, diff: EMPTY_ROUND_DIFF, publishedAt: "2026-11-01T00:00:00.000Z" });
    await w.store.updateLink(w.link.id, w.link.ownerId, { mode: "round", roundId: ROUND });
    const res = await get();
    expect(res.headers.get("cache-control")).toBe("private, max-age=30");
    expect((await res.json()).round).toMatchObject({ id: ROUND, number: 1 });
    expect((await w.store.getVisitor(w.visitor.id))!.lastRoundId).toBe(ROUND);
  });

  it("a round link whose round vanished answers 404", async () => {
    await w.store.updateLink(w.link.id, w.link.ownerId, { mode: "round", roundId: ROUND });
    expect((await get()).status).toBe(404);
  });

  it("slides the sliding cookie when it is old", async () => {
    const res = await get(w.token, w.cookie({ exp: w.nowSec() + 43_200 - 2 * 3600 }));
    expect(res.headers.get("set-cookie")).toMatch(new RegExp(`^${visitorCookieName(w.link.id)}=.*HttpOnly`));
    expect((await get()).headers.get("set-cookie")).toBeNull();
  });
});

describe("GET board: size limits", () => {
  it("413 when the board has more objects than the cap", async () => {
    const res = await handleBoard(visitorRequest("/x", { cookie: w.cookie() }), w.token, { ...deps(), limits: { maxObjects: 3 } });
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "too-large" });
  });
  it("413 when the JSON would be over the byte cap", async () => {
    const res = await handleBoard(visitorRequest("/x", { cookie: w.cookie() }), w.token, { ...deps(), maxBytes: 500 });
    expect(res.status).toBe(413);
  });
});

describe("the real route module", () => {
  it("answers through the same guard", async () => {
    const { setShareStore } = await import("@/lib/server/share-store");
    setShareStore(w.store);
    vi.stubEnv("SHARE_COOKIE_SECRET", SECRET);
    vi.stubEnv("NEXT_PUBLIC_R2_PUBLIC_HOST", "assets.example.com");
    try {
      const { GET } = await import("@/app/api/s/[token]/board/route");
      const ctx = { params: Promise.resolve({ token: w.token }) };
      const ok = await GET(visitorRequest("/x", { cookie: w.cookie({ exp: Math.floor(Date.now() / 1000) + 3600 }) }), ctx); // the real clock
      expect(ok.status).toBe(200);
      expect((await ok.json()).assetBase).toBe("https://assets.example.com");
      expect((await GET(visitorRequest("/x"), ctx)).status).toBe(401);
    } finally {
      setShareStore(null);
      vi.unstubAllEnvs();
    }
  });
});
