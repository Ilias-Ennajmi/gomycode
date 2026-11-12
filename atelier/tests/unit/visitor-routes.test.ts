import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { createAttemptTracker } from "@/lib/share/backoff";
import { verifyVisitorCookie, visitorCookieName } from "@/lib/share/cookie";
import { generateToken } from "@/lib/share/token";
import { handleJoin, handleMeta, handleSession, handleUnlock, DUMMY_HASH, MAX_VISITORS_PER_LINK, NEW_VISITORS_PER_IP_PER_HOUR } from "@/lib/server/visitor-session";
import { passwordHasher } from "@/lib/share/password";
import { SECRET, cookiePair, makeWorld, visitorRequest, type World } from "./helpers/share-world";

let w: World;
let hasher: { hash: Mock<(pw: string) => Promise<string>>; verify: Mock<(pw: string, encoded: string) => Promise<boolean>> };
let tracker: ReturnType<typeof createAttemptTracker>;

const deps = () => ({ store: w.store, now: () => w.clock.now, secrets: [SECRET], hasher, tracker, env: { ATELIER_STUDIO_NAME: "Acme Studio" } as Record<string, string | undefined>, isProd: false });
const path = (t: string, leaf: string) => `/api/s/${t}/${leaf}`;
const post = (leaf: string, body: unknown, o: Parameters<typeof visitorRequest>[1] = {}, token = w.token) => visitorRequest(path(token, leaf), { method: "POST", body, ...o });
const IP = (n: number) => ({ "x-vercel-forwarded-for": `10.0.0.${n}` });
const advance = (ms: number) => (w.clock.now = new Date(w.clock.now.getTime() + ms));
async function passwordWorld(over = {}) {
  const x = await makeWorld({ passwordHash: "$argon2id$fake", ...over });
  return x;
}

beforeEach(async () => {
  w = await makeWorld();
  hasher = { hash: vi.fn(async () => "$argon2id$fake"), verify: vi.fn(async (pw: string) => pw === "right-pass") };
  tracker = createAttemptTracker({ now: () => w.clock.now.getTime(), burstLimit: 10_000 });
});
afterEach(() => vi.unstubAllEnvs());

describe("GET meta (no guard)", () => {
  it("a live link: status ok, the title, permission and welcome note, and no session yet", async () => {
    await w.store.updateLink(w.link.id, w.link.ownerId, { welcomeNote: "Hello!" });
    const res = await handleMeta(visitorRequest(path(w.token, "meta")), w.token, deps());
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.json()).toEqual({ status: "ok", needsPassword: false, hasSession: false, visitorName: null, studioName: "Acme Studio", title: "Brand refresh", permission: "comment", welcomeNote: "Hello!" });
  });

  it("a visitor with a session gets hasSession and their name", async () => {
    const res = await handleMeta(visitorRequest(path(w.token, "meta"), { cookie: w.cookie() }), w.token, deps());
    expect(await res.json()).toMatchObject({ status: "ok", hasSession: true, visitorName: "Jane" });
  });

  it("a password link before unlocking leaks neither title, welcome note nor permission", async () => {
    w = await passwordWorld({ welcomeNote: "secret hello" });
    const res = await handleMeta(visitorRequest(path(w.token, "meta")), w.token, deps());
    const body = await res.json();
    expect(body).toEqual({ status: "ok", needsPassword: true, hasSession: false, visitorName: null, studioName: "Acme Studio", title: null });
    expect(JSON.stringify(body)).not.toContain("Brand refresh");
    expect(JSON.stringify(body)).not.toContain("secret hello");
  });

  it("a cookie that has not passed the password gate does not count as a session", async () => {
    w = await passwordWorld();
    const res = await handleMeta(visitorRequest(path(w.token, "meta"), { cookie: w.cookie({ pw: false }) }), w.token, deps());
    expect(await res.json()).toMatchObject({ needsPassword: true, hasSession: false, title: null });
  });

  it("after unlocking, the password link shows its title", async () => {
    w = await passwordWorld();
    const res = await handleMeta(visitorRequest(path(w.token, "meta"), { cookie: w.cookie() }), w.token, deps());
    expect(await res.json()).toMatchObject({ needsPassword: false, hasSession: true, title: "Brand refresh" });
  });

  it("revoked, expired and unknown links all answer exactly { status: 'gone' }", async () => {
    const revoked = await w.extraLink();
    await w.store.revokeLink(revoked.link.id, w.link.ownerId, w.clock.now);
    const expired = await w.extraLink({ expiresAt: new Date(w.clock.now.getTime() + 1000).toISOString() });
    advance(5000);
    for (const t of [revoked.token, expired.token, generateToken().token, "short"]) {
      const res = await handleMeta(visitorRequest(path(t, "meta"), { cookie: w.cookie() }), t, deps());
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: "gone" });
    }
  });
});

describe("POST session", () => {
  it("creates a visitor and an httpOnly cookie on a link without a password", async () => {
    const res = await handleSession(post("session", {}), w.token, deps());
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ name: null, created: true });
    const raw = res.headers.get("set-cookie")!;
    expect(raw).toMatch(/HttpOnly/);
    expect(raw).toMatch(/SameSite=Lax/);
    expect(raw).toMatch(/Path=\//);
    expect(raw).not.toMatch(/Secure/); // isProd false
    const [name, value] = cookiePair(res)!.split("=");
    expect(name).toBe(visitorCookieName(w.link.id));
    const claims = verifyVisitorCookie(value, [SECRET], w.nowSec(), w.link.id)!;
    expect(claims).toMatchObject({ lid: w.link.id, ep: 0, pw: true });
    expect((await w.store.getVisitor(claims.vid))!.linkId).toBe(w.link.id);
  });

  it("sets Secure in production", async () => {
    const res = await handleSession(post("session", {}), w.token, { ...deps(), isProd: true });
    expect(res.headers.get("set-cookie")).toMatch(/; Secure/);
  });

  it("an empty body is fine", async () => {
    const res = await handleSession(visitorRequest(path(w.token, "session"), { method: "POST" }), w.token, deps());
    expect(res.status).toBe(201);
  });

  it("a browser that already has a session keeps its visitor: no new row, 200", async () => {
    const before = await w.store.countVisitors(w.link.id);
    const res = await handleSession(post("session", {}, { cookie: w.cookie() }), w.token, deps());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: "Jane", created: false });
    expect(await w.store.countVisitors(w.link.id)).toBe(before);
  });

  it("a password link answers 401 password-required", async () => {
    w = await passwordWorld();
    const res = await handleSession(post("session", {}), w.token, deps());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "password-required" });
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("a password link with an unlocked session answers 200", async () => {
    w = await passwordWorld();
    expect((await handleSession(post("session", {}, { cookie: w.cookie() }), w.token, deps())).status).toBe(200);
  });

  it("caps new visitors at 30 per address per link per hour (Review Focus 3)", async () => {
    expect(NEW_VISITORS_PER_IP_PER_HOUR).toBe(30);
    for (let i = 0; i < 30; i++) expect((await handleSession(post("session", {}, { headers: IP(1) }), w.token, deps())).status).toBe(201);
    const res = await handleSession(post("session", {}, { headers: IP(1) }), w.token, deps());
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "rate-limited" });
    expect(res.headers.get("retry-after")).toMatch(/^\d+$/);
    expect(res.headers.get("set-cookie")).toBeNull();
    // another address is fine, and so is the same one an hour later
    expect((await handleSession(post("session", {}, { headers: IP(2) }), w.token, deps())).status).toBe(201);
    advance(61 * 60_000);
    expect((await handleSession(post("session", {}, { headers: IP(1) }), w.token, deps())).status).toBe(201);
  });

  it("caps visitors at 500 per link", async () => {
    expect(MAX_VISITORS_PER_LINK).toBe(500);
    for (let i = 0; i < 499; i++) await w.store.createVisitor(w.link.id, `h${i}`); // plus Jane = 500
    const res = await handleSession(post("session", {}, { headers: IP(9) }), w.token, deps());
    expect(res.status).toBe(429);
    // a returning visitor is not counted again
    expect((await handleSession(post("session", {}, { cookie: w.cookie() }), w.token, deps())).status).toBe(200);
  });

  it("refuses revoked, expired and unknown links the same way as the guard (404)", async () => {
    await w.store.revokeLink(w.link.id, w.link.ownerId, w.clock.now);
    for (const t of [w.token, generateToken().token]) {
      const res = await handleSession(post("session", {}, {}, t), t, deps());
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "not-found" });
    }
  });

  it("is a POST from this app only: foreign origins and bare cross-site requests get 403 and make no visitor", async () => {
    const before = await w.store.countVisitors(w.link.id);
    expect((await handleSession(post("session", {}, { origin: "https://evil.example" }), w.token, deps())).status).toBe(403);
    expect((await handleSession(post("session", {}, { origin: null, headers: { "sec-fetch-site": "cross-site" } }), w.token, deps())).status).toBe(403);
    expect(await w.store.countVisitors(w.link.id)).toBe(before);
  });

  it("413 for a body over 1 KB and 415 for a form post", async () => {
    expect((await handleSession(post("session", "x".repeat(2000)), w.token, deps())).status).toBe(413);
    expect((await handleSession(post("session", "a=b", { headers: { "content-type": "application/x-www-form-urlencoded" } }), w.token, deps())).status).toBe(415);
  });
});

describe("POST unlock (Review Focus 3)", () => {
  beforeEach(async () => {
    w = await passwordWorld();
  });
  const unlock = (password: unknown, o: Parameters<typeof visitorRequest>[1] = {}) => handleUnlock(post("unlock", { password }, { headers: IP(1), ...o }), w.token, deps());

  it("wrong passwords 1-3 are 401 with no lock, the 4th carries retryAfter 2", async () => {
    for (let i = 0; i < 3; i++) {
      const res = await unlock("nope");
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "wrong-password", retryAfter: 0 });
    }
    const fourth = await unlock("nope");
    expect(fourth.status).toBe(401);
    expect(await fourth.json()).toEqual({ error: "wrong-password", retryAfter: 2 });
    expect(fourth.headers.get("set-cookie")).toBeNull();
  });

  it("while locked: 429 with Retry-After, and the password is NOT verified", async () => {
    for (let i = 0; i < 4; i++) await unlock("nope");
    hasher.verify.mockClear();
    const res = await unlock("right-pass"); // even the right one is refused during the lock
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "locked", retryAfter: 2 });
    expect(res.headers.get("retry-after")).toBe("2");
    expect(hasher.verify).not.toHaveBeenCalled();
    advance(1000);
    expect(((await unlock("x")).headers.get("retry-after"))).toBe("1");
  });

  it("the right password after the lock expires: 204, attempts cleared, cookie with the pw claim", async () => {
    for (let i = 0; i < 4; i++) await unlock("nope");
    advance(2001);
    const res = await unlock("right-pass");
    expect(res.status).toBe(204);
    expect(res.body).toBeNull();
    expect(res.headers.get("set-cookie")).toMatch(/HttpOnly/);
    const [, value] = cookiePair(res)!.split("=");
    expect(verifyVisitorCookie(value, [SECRET], w.nowSec(), w.link.id)).toMatchObject({ pw: true, ep: 0 });
    // the failure counter is gone: the next wrong password is a first failure again
    const again = await unlock("nope");
    expect(await again.json()).toEqual({ error: "wrong-password", retryAfter: 0 });
  });

  it("every kind of wrong password gets the very same answer", async () => {
    const answers = [];
    for (const [i, pw] of ["", "x", "a".repeat(129), "a".repeat(5000).slice(0, 128), "nope"].entries()) {
      const res = await handleUnlock(post("unlock", { password: pw }, { headers: IP(10 + i) }), w.token, deps());
      answers.push({ status: res.status, body: await res.json(), cookie: res.headers.get("set-cookie") });
    }
    for (const a of answers) expect(a).toEqual(answers[0]);
    expect(answers[0]).toEqual({ status: 401, body: { error: "wrong-password", retryAfter: 0 }, cookie: null });
  });

  it("100 wrong attempts from one address never lock longer than 15 minutes and never change shape", async () => {
    let longest = 0;
    for (let i = 0; i < 100; i++) {
      const res = await unlock("nope");
      expect([401, 429]).toContain(res.status);
      const body = await res.json();
      expect(Object.keys(body).sort()).toEqual(["error", "retryAfter"]);
      longest = Math.max(longest, body.retryAfter);
      advance((body.retryAfter + 1) * 1000); // wait the lock out and try again
    }
    expect(longest).toBe(900);
  });

  it("a different address is not locked by someone else's failures", async () => {
    for (let i = 0; i < 6; i++) await unlock("nope");
    const res = await handleUnlock(post("unlock", { password: "right-pass" }, { headers: IP(2) }), w.token, deps());
    expect(res.status).toBe(204);
  });

  it("a burst of attempts is cut off by the request cap even before any lock", async () => {
    tracker = createAttemptTracker({ now: () => w.clock.now.getTime(), burstLimit: 3 });
    const statuses = [];
    for (let i = 0; i < 5; i++) statuses.push((await unlock("right-pass", { headers: IP(3) })).status);
    expect(statuses).toEqual([204, 204, 204, 429, 429]);
  });

  it("a returning visitor keeps their identity through the unlock", async () => {
    const res = await unlock("right-pass", { cookie: w.cookie({ pw: false }) });
    const [, value] = cookiePair(res)!.split("=");
    expect(verifyVisitorCookie(value, [SECRET], w.nowSec())!.vid).toBe(w.visitor.id);
  });

  it("a cookie from before a password change cannot be reused as an identity", async () => {
    const stale = w.cookie({ ep: 99 });
    const res = await unlock("right-pass", { cookie: stale });
    const [, value] = cookiePair(res)!.split("=");
    expect(verifyVisitorCookie(value, [SECRET], w.nowSec())!.vid).not.toBe(w.visitor.id);
  });

  it("a link without a password answers 204 for anything, after the same verification work", async () => {
    w = await makeWorld();
    const res = await handleUnlock(post("unlock", { password: "whatever" }), w.token, deps());
    expect(res.status).toBe(204);
    expect(res.headers.get("set-cookie")).toMatch(/HttpOnly/);
    expect(hasher.verify).toHaveBeenCalledWith("whatever", DUMMY_HASH);
  });

  it("the dummy hash is a real argon2id string and verifies nothing", async () => {
    expect(DUMMY_HASH).toMatch(/^\$argon2id\$v=19\$m=65536,t=2,p=1\$/);
    expect(await passwordHasher.verify("anything", DUMMY_HASH)).toBe(false);
  });

  it("a non-string password is a 400, a 2 KB body a 413", async () => {
    expect((await unlock(1234)).status).toBe(400);
    expect((await unlock(undefined)).status).toBe(400);
    expect((await unlock("x".repeat(3000))).status).toBe(413);
    expect(hasher.verify).not.toHaveBeenCalled();
  });

  it("403 cross-origin and nothing verified", async () => {
    expect((await unlock("right-pass", { origin: "https://evil.example" })).status).toBe(403);
    expect(hasher.verify).not.toHaveBeenCalled();
  });

  it("404 for a revoked link, whatever the password", async () => {
    await w.store.revokeLink(w.link.id, w.link.ownerId, w.clock.now);
    const res = await unlock("right-pass");
    expect(res.status).toBe(404);
    expect(hasher.verify).not.toHaveBeenCalled();
  });

  it("works with the real hasher end to end", async () => {
    const real = await passwordHasher.hash("open sesame");
    await w.store.updateLink(w.link.id, w.link.ownerId, { passwordHash: real });
    const realDeps = { ...deps(), hasher: passwordHasher };
    expect((await handleUnlock(post("unlock", { password: "nope" }, { headers: IP(5) }), w.token, realDeps)).status).toBe(401);
    expect((await handleUnlock(post("unlock", { password: "open sesame" }, { headers: IP(5) }), w.token, realDeps)).status).toBe(204);
  }, 20_000);
});

describe("POST join (the display name)", () => {
  const join = (name: unknown, o: Parameters<typeof visitorRequest>[1] = {}) => handleJoin(post("join", { name }, { cookie: w.cookie(), ...o }), w.token, deps());

  it("stores the cleaned name: bidi override gone, markup kept as inert text", async () => {
    const res = await join("‮evil<script>");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: "evil<script>" });
    expect((await w.store.getVisitor(w.visitor.id))!.displayName).toBe("evil<script>");
  });

  it("an unnamed visitor can pick a name", async () => {
    w = await makeWorld({}, { named: false });
    const res = await join("Sam");
    expect(await res.json()).toEqual({ name: "Sam" });
  });

  it("400 for an empty, blank, 61-character or non-string name; nothing changes", async () => {
    for (const bad of ["", "   ", "​", "x".repeat(61), 42, null, undefined, { a: 1 }]) {
      const res = await join(bad);
      expect(res.status, JSON.stringify(bad)).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid-name" });
    }
    expect((await w.store.getVisitor(w.visitor.id))!.displayName).toBe("Jane");
  });

  it("401 without a session and password-required without the gate passed", async () => {
    expect((await join("Sam", { cookie: null })).status).toBe(401);
    w = await passwordWorld();
    const res = await join("Sam", { cookie: w.cookie({ pw: false }) });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "password-required" });
  });

  it("410 for a revoked link when the caller has a cookie, 404 when not", async () => {
    await w.store.revokeLink(w.link.id, w.link.ownerId, w.clock.now);
    expect((await join("Sam")).status).toBe(410);
    expect((await join("Sam", { cookie: null })).status).toBe(404);
  });

  it("403 cross-origin; 413 over 1 KB", async () => {
    expect((await join("Sam", { origin: "https://evil.example" })).status).toBe(403);
    expect((await join("x".repeat(3000))).status).toBe(413);
  });

  it("works on a view-only link (a name needs no permission)", async () => {
    await w.store.updateLink(w.link.id, w.link.ownerId, { permission: "view" });
    expect((await join("Sam")).status).toBe(200);
  });

  it("refreshes the sliding cookie when it is old", async () => {
    const res = await join("Sam", { cookie: w.cookie({ exp: w.nowSec() + 43_200 - 2 * 3600 }) });
    expect(res.headers.get("set-cookie")).toMatch(/HttpOnly/);
    const fresh = await join("Sam");
    expect(fresh.headers.get("set-cookie")).toBeNull();
  });
});

describe("the real route modules", () => {
  it("are wired to the same handlers (session, unlock, join, meta, name alias)", async () => {
    const { setShareStore } = await import("@/lib/server/share-store");
    setShareStore(w.store);
    vi.stubEnv("SHARE_COOKIE_SECRET", SECRET);
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://atelier.example.com");
    try {
      const ctx = { params: Promise.resolve({ token: w.token }) };
      const meta = await (await import("@/app/api/s/[token]/meta/route")).GET(visitorRequest(path(w.token, "meta")), ctx);
      expect((await meta.json()).status).toBe("ok");
      const session = await (await import("@/app/api/s/[token]/session/route")).POST(post("session", {}), ctx);
      expect(session.status).toBe(201);
      const cookie = cookiePair(session)!;
      const join = await (await import("@/app/api/s/[token]/join/route")).POST(post("join", { name: "Kim" }, { cookie }), ctx);
      expect(await join.json()).toEqual({ name: "Kim" });
      const alias = await (await import("@/app/api/s/[token]/name/route")).POST(post("name", { name: "Kimmy" }, { cookie }), ctx);
      expect(await alias.json()).toEqual({ name: "Kimmy" });
      const unlock = await (await import("@/app/api/s/[token]/unlock/route")).POST(post("unlock", { password: "x" }), ctx);
      expect(unlock.status).toBe(204); // no password on this link
    } finally {
      setShareStore(null);
    }
  });
});
