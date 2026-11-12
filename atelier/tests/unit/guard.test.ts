import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireVisitor } from "@/lib/share/guard";
import { COOKIE_TTL_SEC, signVisitorCookie, visitorCookieName } from "@/lib/share/cookie";
import { generateToken } from "@/lib/share/token";
import { SECRET, makeWorld, thrownResponse, visitorRequest, type World } from "./helpers/share-world";

let w: World;
const deps = () => ({ store: w.store, now: () => w.clock.now, secrets: [SECRET] });
const call = (token: string, need = {}, cookie: string | null = w.cookie(), req = visitorRequest(`/api/s/${token}/board`, { cookie })) =>
  requireVisitor(req, token, need, deps());
const denied = async (p: Promise<unknown>) => {
  const res = await thrownResponse(p);
  return { status: res.status, body: await res.json(), res };
};

beforeEach(async () => {
  w = await makeWorld();
});

describe("requireVisitor: the happy path", () => {
  it("returns the link, the visitor and the claims for a valid cookie", async () => {
    const ok = await call(w.token);
    expect(ok.link.id).toBe(w.link.id);
    expect(ok.visitor).toMatchObject({ id: w.visitor.id, displayName: "Jane" });
    expect(ok.claims).toMatchObject({ lid: w.link.id, vid: w.visitor.id, pw: true });
    expect(ok.cookieHeader).toBeNull();
  });

  it("refreshes the sliding cookie once two hours of it are used, with the cookie attributes", async () => {
    const stale = w.cookie({ exp: w.nowSec() + COOKIE_TTL_SEC - 2 * 3600 });
    const ok = await call(w.token, {}, stale);
    expect(ok.cookieHeader).toMatch(new RegExp(`^${visitorCookieName(w.link.id)}=v1\\.`));
    expect(ok.cookieHeader).toMatch(/HttpOnly/);
    expect(ok.cookieHeader).toMatch(/SameSite=Lax/);
    expect(ok.cookieHeader).toMatch(/Path=\//);
    expect(ok.cookieHeader).toMatch(/Max-Age=43200/);
  });

  it("does not refresh a cookie that is only one hour old", async () => {
    const fresh = w.cookie({ exp: w.nowSec() + COOKIE_TTL_SEC - 3600 });
    expect((await call(w.token, {}, fresh)).cookieHeader).toBeNull();
  });
});

describe("requireVisitor: the token (no existence oracle)", () => {
  it("404 for a plausible token that matches no link", async () => {
    const { token } = generateToken();
    expect(await denied(call(token))).toMatchObject({ status: 404, body: { error: "not-found" } });
  });

  it("404 for a 42-character token without touching the store", async () => {
    const spy = vi.spyOn(w.store, "getLinkByHash");
    const short = w.token.slice(0, 42);
    expect(await denied(call(short))).toMatchObject({ status: 404, body: { error: "not-found" } });
    expect(await denied(call(`${w.token}x`))).toMatchObject({ status: 404 });
    expect(await denied(call(w.token.replace(/.$/, "+")))).toMatchObject({ status: 404 });
    expect(spy).not.toHaveBeenCalled();
  });

  it("an unknown, a revoked and an expired link look identical to someone with no cookie", async () => {
    const revoked = await w.extraLink();
    await w.store.revokeLink(revoked.link.id, w.link.ownerId, w.clock.now);
    const expired = await w.extraLink({ expiresAt: new Date(w.clock.now.getTime() + 1000).toISOString() });
    w.clock.now = new Date(w.clock.now.getTime() + 5000);
    const unknown = generateToken().token;
    const seen = [];
    for (const t of [unknown, revoked.token, expired.token]) {
      const { status, body, res } = await denied(call(t, {}, null));
      seen.push({ status, body, cache: res.headers.get("cache-control"), type: res.headers.get("content-type") });
    }
    expect(seen[1]).toEqual(seen[0]);
    expect(seen[2]).toEqual(seen[0]);
    expect(seen[0]).toMatchObject({ status: 404, body: { error: "not-found" }, cache: "private, no-store" });
  });

  it("a trashed or deleted board looks like a gone link", async () => {
    w.store.seedBoard({ id: w.link.boardId, ownerId: w.link.ownerId, title: "x", deletedAt: "2026-11-01T00:00:00.000Z" });
    expect(await denied(call(w.token))).toMatchObject({ status: 410, body: { error: "gone" } });
    expect(await denied(call(w.token, {}, null))).toMatchObject({ status: 404, body: { error: "not-found" } });
  });
});

describe("requireVisitor: revoked and expired (Review Focus 1)", () => {
  it("a revoked link is 410 gone even with a perfectly valid cookie, immediately", async () => {
    const cookie = w.cookie();
    await call(w.token, {}, cookie); // works
    await w.store.revokeLink(w.link.id, w.link.ownerId, w.clock.now);
    expect(await denied(call(w.token, {}, cookie))).toMatchObject({ status: 410, body: { error: "gone" } });
  });

  it("an expired link is 410 with a body identical to revoked", async () => {
    const exp = await w.extraLink({ expiresAt: new Date(w.clock.now.getTime() + 60_000).toISOString() });
    const v = await w.store.createVisitor(exp.link.id, null);
    const ck = w.cookie({ vid: v.id }, exp.link);
    await requireVisitor(visitorRequest("/x", { cookie: ck }), exp.token, {}, deps()); // valid now
    w.clock.now = new Date(w.clock.now.getTime() + 120_000);
    const a = await denied(requireVisitor(visitorRequest("/x", { cookie: ck }), exp.token, {}, deps()));
    await w.store.revokeLink(w.link.id, w.link.ownerId, w.clock.now);
    const b = await denied(call(w.token));
    expect(a).toMatchObject({ status: 410, body: { error: "gone" } });
    expect({ status: b.status, body: b.body }).toEqual({ status: a.status, body: a.body });
  });

  it("a password change or removal ends every session of the link at once (epoch)", async () => {
    const cookie = w.cookie();
    await w.store.updateLink(w.link.id, w.link.ownerId, { passwordHash: "$argon2id$x", bumpEpoch: true });
    expect(await denied(call(w.token, {}, cookie))).toMatchObject({ status: 401, body: { error: "session-required" } });
  });
});

describe("requireVisitor: cookies (Review Focus 1)", () => {
  it("no cookie: 401 session-required on a live link", async () => {
    expect(await denied(call(w.token, {}, null))).toMatchObject({ status: 401, body: { error: "session-required" } });
  });

  it("a cookie for link A under link B's name is rejected (the claims name link A)", async () => {
    const other = await w.extraLink();
    const forged = `${visitorCookieName(other.link.id)}=${w.cookie().split("=")[1]}`;
    expect(await denied(requireVisitor(visitorRequest("/x", { cookie: forged }), other.token, {}, deps()))).toMatchObject({ status: 401, body: { error: "session-required" } });
  });

  it("link A's cookie, sent as it is to link B, carries nothing for B", async () => {
    const other = await w.extraLink();
    expect(await denied(requireVisitor(visitorRequest("/x", { cookie: w.cookie() }), other.token, {}, deps()))).toMatchObject({ status: 401, body: { error: "session-required" } });
  });

  it("a cookie naming a visitor of another link is rejected", async () => {
    const other = await w.extraLink();
    const foreignVisitor = await w.store.createVisitor(other.link.id, null);
    expect(await denied(call(w.token, {}, w.cookie({ vid: foreignVisitor.id })))).toMatchObject({ status: 401, body: { error: "session-required" } });
  });

  it("a cookie for a visitor that no longer exists is rejected", async () => {
    expect(await denied(call(w.token, {}, w.cookie({ vid: "00000000-0000-4000-8000-000000000000" })))).toMatchObject({ status: 401 });
  });

  it("a tampered, expired, wrongly signed or garbage cookie is rejected", async () => {
    const good = w.cookie();
    const [name, value] = good.split("=");
    const flip = `${name}=${value.slice(0, -2)}${value.slice(-2) === "AA" ? "BB" : "AA"}`;
    const expired = w.cookie({ exp: w.nowSec() - 1 });
    const wrongKey = `${name}=${signVisitorCookie({ lid: w.link.id, vid: w.visitor.id, ep: 0, pw: true, exp: w.nowSec() + 1000 }, "x".repeat(48))}`;
    for (const c of [flip, expired, wrongKey, `${name}=garbage`, `${name}=`, `${name}=${"a".repeat(2000)}`]) {
      expect(await denied(call(w.token, {}, c)), c.slice(0, 30)).toMatchObject({ status: 401, body: { error: "session-required" } });
    }
  });

  it("a cookie signed with the previous secret still works during rotation", async () => {
    const old = "o".repeat(48);
    const claims = { lid: w.link.id, vid: w.visitor.id, ep: 0, pw: true, exp: w.nowSec() + 5000 };
    const c = `${visitorCookieName(w.link.id)}=${signVisitorCookie(claims, old)}`;
    await expect(requireVisitor(visitorRequest("/x", { cookie: c }), w.token, {}, { ...deps(), secrets: [SECRET, old] })).resolves.toBeTruthy();
    await expect(requireVisitor(visitorRequest("/x", { cookie: c }), w.token, {}, { ...deps(), secrets: [SECRET] })).rejects.toBeInstanceOf(Response);
  });

  it("503 when no cookie secret is configured", async () => {
    const res = await thrownResponse(requireVisitor(visitorRequest("/x", { cookie: w.cookie() }), w.token, {}, { ...deps(), secrets: [] }));
    expect(res.status).toBe(503);
  });
});

describe("requireVisitor: password, name, permission, scope", () => {
  it("a password link needs the pw claim", async () => {
    await w.store.updateLink(w.link.id, w.link.ownerId, { passwordHash: "$argon2id$x" });
    expect(await denied(call(w.token, {}, w.cookie({ pw: false })))).toMatchObject({ status: 401, body: { error: "password-required" } });
    await expect(call(w.token, {}, w.cookie({ pw: true }))).resolves.toBeTruthy();
  });

  it("a link without a password ignores the pw claim", async () => {
    await expect(call(w.token, {}, w.cookie({ pw: false }))).resolves.toBeTruthy();
  });

  it("an unnamed visitor is refused where a name is needed", async () => {
    const un = await makeWorld({}, { named: false });
    w = un;
    expect(await denied(call(un.token, { named: true }))).toMatchObject({ status: 403, body: { error: "name-required" } });
    await expect(call(un.token, {})).resolves.toBeTruthy(); // viewing needs no name
  });

  it("a view-only link cannot react, comment or approve", async () => {
    await w.store.updateLink(w.link.id, w.link.ownerId, { permission: "view" });
    for (const action of ["react", "comment", "approve"] as const) {
      expect(await denied(call(w.token, { action })), action).toMatchObject({ status: 403, body: { error: "forbidden" } });
    }
    await expect(call(w.token, { action: "view" })).resolves.toBeTruthy();
  });

  it("a react link can react and approve but not comment", async () => {
    await w.store.updateLink(w.link.id, w.link.ownerId, { permission: "react" });
    await expect(call(w.token, { action: "react" })).resolves.toBeTruthy();
    await expect(call(w.token, { action: "approve" })).resolves.toBeTruthy();
    expect(await denied(call(w.token, { action: "comment" }))).toMatchObject({ status: 403, body: { error: "forbidden" } });
  });

  it("a frames link refuses a frame outside its scope and an object with no frame", async () => {
    await w.store.updateLink(w.link.id, w.link.ownerId, { scope: "frames", frameIds: ["f1"] });
    await expect(call(w.token, { frameId: "f1" })).resolves.toBeTruthy();
    expect(await denied(call(w.token, { frameId: "f2" }))).toMatchObject({ status: 403, body: { error: "out-of-scope" } });
    expect(await denied(call(w.token, { frameId: null }))).toMatchObject({ status: 403, body: { error: "out-of-scope" } });
    await expect(call(w.token, {})).resolves.toBeTruthy(); // no frame in question
  });

  it("the permission is read fresh: a downgrade applies to the very next request", async () => {
    await expect(call(w.token, { action: "comment" })).resolves.toBeTruthy();
    await w.store.updateLink(w.link.id, w.link.ownerId, { permission: "view" });
    expect(await denied(call(w.token, { action: "comment" }))).toMatchObject({ status: 403 });
  });
});

describe("requireVisitor and the owner routes", () => {
  it("the visitor cookie opens nothing on the owner side: requireOwner answers 401", async () => {
    vi.resetModules();
    vi.doMock("@/lib/supabase/server", () => ({
      createServerClient: async () => ({ auth: { getClaims: async () => ({ data: null, error: { message: "no session" } }), mfa: {} } }),
    }));
    vi.stubEnv("ATELIER_LOCAL_ONLY", "");
    const { requireOwner } = await import("@/lib/server/owner");
    const res = await thrownResponse(requireOwner());
    expect(res.status).toBe(401);
    vi.doUnmock("@/lib/supabase/server");
    vi.unstubAllEnvs();
  });
});
