import * as Y from "yjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryShareStore } from "@/lib/server/share-store-memory";
import { setShareStore } from "@/lib/server/share-store";
import { hashToken, isPlausibleToken } from "@/lib/share/token";
import { passwordHasher } from "@/lib/share/password";
import { EMPTY_ROUND_DIFF } from "@/lib/share/round-types";

const OWNER = "11111111-1111-4111-8111-111111111111";
const STRANGER = "22222222-2222-4222-8222-222222222222";
const BOARD = "55555555-5555-4555-8555-555555555555";
const OTHERS_BOARD = "66666666-6666-4666-8666-666666666666";
const ROUND = "77777777-7777-4777-8777-777777777771";
const SNAP = "88888888-8888-4888-8888-888888888881";

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

import { GET, POST } from "@/app/api/boards/[id]/share-links/route";
import { DELETE, PATCH } from "@/app/api/share-links/[id]/route";
import { POST as REVOKE } from "@/app/api/share-links/[id]/revoke/route";

let store: MemoryShareStore;

function frameState(ids: string[]): Uint8Array {
  const doc = new Y.Doc();
  const objects = doc.getMap<Y.Map<unknown>>("objects");
  for (const id of ids) {
    const m = new Y.Map<unknown>();
    m.set("type", "frame");
    objects.set(id, m);
  }
  return Y.encodeStateAsUpdate(doc);
}

const ORIGIN = "https://atelier.example.com";
const req = (method: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request(`${ORIGIN}/api/x`, {
    method,
    headers: { "content-type": "application/json", origin: ORIGIN, ...headers },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
const board = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.stubEnv("ATELIER_OWNER_ID", OWNER);
  vi.stubEnv("ATELIER_LOCAL_ONLY", "");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://atelier.example.com");
  claims = { sub: OWNER, aal: "aal2" };
  levels = { currentLevel: "aal2", nextLevel: "aal2" };
  store = new MemoryShareStore();
  store.seedBoard({ id: BOARD, ownerId: OWNER, title: "Brand" });
  store.seedBoard({ id: OTHERS_BOARD, ownerId: STRANGER, title: "Theirs" });
  store.seedSnapshot(BOARD, SNAP, frameState(["f1", "f2"]));
  store.seedRound({ id: ROUND, boardId: BOARD, number: 1, label: "Round 1", snapshotId: SNAP, previews: {}, diff: EMPTY_ROUND_DIFF, publishedAt: "2026-11-01T00:00:00.000Z" });
  store.seedLiveState(BOARD, frameState(["f1", "f2", "f3"]));
  setShareStore(store);
});
afterEach(() => {
  setShareStore(null);
  vi.unstubAllEnvs();
});

const create = (body: unknown = {}, h: Record<string, string> = {}) => POST(req("POST", body, h), board(BOARD));

describe("owner checks", () => {
  const calls: [string, () => Promise<Response>][] = [
    ["GET list", () => GET(req("GET"), board(BOARD))],
    ["POST create", () => create({})],
  ];
  it.each(calls)("%s: 401 without a session", async (_n, call) => {
    claims = null;
    expect((await call()).status).toBe(401);
  });
  it.each(calls)("%s: 403 for another identity", async (_n, call) => {
    claims = { sub: STRANGER, aal: "aal2" };
    expect((await call()).status).toBe(403);
    expect(await store.listLinks(BOARD, STRANGER)).toEqual([]);
  });
  it.each(calls)("%s: 401 mfa-required when a second factor is enrolled but unused", async (_n, call) => {
    claims = { sub: OWNER, aal: "aal1" };
    levels = { currentLevel: "aal1", nextLevel: "aal2" };
    const res = await call();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "mfa-required" });
  });
  it("an owner of another board gets 404 for this board", async () => {
    claims = { sub: STRANGER, aal: "aal2" };
    vi.stubEnv("ATELIER_OWNER_ID", STRANGER);
    expect((await create({})).status).toBe(404);
    expect((await GET(req("GET"), board(BOARD))).status).toBe(404);
  });
  it("404 for a board that does not exist or an id that is not a uuid", async () => {
    expect((await POST(req("POST", {}), board("77777777-7777-4777-8777-777777777777"))).status).toBe(404);
    expect((await POST(req("POST", {}), board("../../etc"))).status).toBe(404);
  });
});

describe("POST /api/boards/[id]/share-links", () => {
  it("creates a link, returns the token once in the URL, and stores only its hash", async () => {
    const res = await create({ name: "Acme", permission: "comment" });
    expect(res.status).toBe(201);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const body = await res.json();
    expect(body.url).toMatch(/^https:\/\/atelier\.example\.com\/s\/[A-Za-z0-9_-]{43}$/);
    const token = body.url.split("/s/")[1];
    expect(isPlausibleToken(token)).toBe(true);
    const stored = (await store.listLinks(BOARD, OWNER))[0];
    expect(stored.tokenHash).toBe(hashToken(token));
    expect(stored.roundId).toBe(ROUND);
    expect(body.link).toMatchObject({ name: "Acme", permission: "comment", status: "ok", hasPassword: false, mode: "round", roundId: ROUND });
    // the token and its hash appear nowhere in the response besides the URL
    const text = JSON.stringify(body);
    expect(text.split(token).length - 1).toBe(1);
    expect(text).not.toContain(stored.tokenHash);
    expect(body.link.tokenHash).toBeUndefined();
    expect(body.link.passwordHash).toBeUndefined();
  });

  it("hashes the password and never stores or returns it", async () => {
    const res = await create({ password: "correct horse" });
    const body = await res.json();
    const stored = (await store.listLinks(BOARD, OWNER))[0];
    expect(stored.passwordHash).toMatch(/^\$argon2id\$/);
    expect(stored.passwordHash).not.toContain("correct horse");
    expect(await passwordHasher.verify("correct horse", stored.passwordHash!)).toBe(true);
    expect(JSON.stringify(body)).not.toContain("correct horse");
    expect(body.link.hasPassword).toBe(true);
  }, 15_000);

  it("a live link needs no round; round mode with no rounds says so", async () => {
    expect((await create({ mode: "live" })).status).toBe(201);
    const other = new MemoryShareStore();
    other.seedBoard({ id: BOARD, ownerId: OWNER });
    setShareStore(other);
    const res = await create({});
    expect(res.status).toBe(400);
    expect((await res.json()).errors.roundId).toBe("Publish a round first");
  });

  it("checks frames against the board's frames (live and the round's snapshot)", async () => {
    expect((await create({ scope: "frames", frameIds: ["f1", "f3"] })).status).toBe(201);
    const res = await create({ scope: "frames", frameIds: ["f1", "nope"] });
    expect(res.status).toBe(400);
    expect((await res.json()).errors.frameIds).toBeTruthy();
  });

  it("rejects bad options with per-field messages and creates nothing", async () => {
    const res = await create({ permission: "admin", password: "abc", expiresAt: "2001-01-01T00:00:00Z", tokenHash: "x" });
    expect(res.status).toBe(400);
    const { errors } = await res.json();
    expect(Object.keys(errors).sort()).toEqual(["password", "permission", "tokenHash"]);
    expect(await store.listLinks(BOARD, OWNER)).toEqual([]);
  });

  it("413 for an oversized body, 415 for a form post, 400 for junk", async () => {
    expect((await create("x".repeat(20_000))).status).toBe(413);
    expect((await create("a=b", { "content-type": "application/x-www-form-urlencoded" })).status).toBe(415);
    expect((await create("{nope")).status).toBe(400);
  });

  it("403 for a cross-origin request and for a request with no origin information", async () => {
    expect((await create({}, { origin: "https://evil.example" })).status).toBe(403);
    const noOrigin = new Request(`${ORIGIN}/api/x`, { method: "POST", headers: { "content-type": "application/json", "sec-fetch-site": "cross-site" }, body: "{}" });
    expect((await POST(noOrigin, board(BOARD))).status).toBe(403);
    expect(await store.listLinks(BOARD, OWNER)).toEqual([]);
  });

  it("falls back to the request origin when no site URL is configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    const preview = new Request("https://preview-123.vercel.app/api/x", { method: "POST", headers: { "content-type": "application/json", origin: "https://preview-123.vercel.app" }, body: JSON.stringify({ mode: "live" }) });
    const body = await (await POST(preview, board(BOARD))).json();
    expect(body.url.startsWith("https://preview-123.vercel.app/s/")).toBe(true);
  });

  it("accepts the request's own origin even when a different public address is configured (preview deployments)", async () => {
    const preview = new Request("https://preview-123.vercel.app/api/x", { method: "POST", headers: { "content-type": "application/json", origin: "https://preview-123.vercel.app" }, body: JSON.stringify({ mode: "live" }) });
    const res = await POST(preview, board(BOARD));
    expect(res.status).toBe(201);
    // ...but the link it makes still uses the configured public address
    expect((await res.json()).url.startsWith("https://atelier.example.com/s/")).toBe(true);
  });

  it("stops at 200 links per board", async () => {
    for (let i = 0; i < 200; i++) await store.insertLink({ boardId: BOARD, ownerId: OWNER, name: "n", tokenHash: `t${i}`, mode: "live", roundId: null, scope: "board", frameIds: [], permission: "view", passwordHash: null, expiresAt: null, welcomeNote: "", allowDownload: false, watermark: false, showCredits: false, blindVotes: false });
    expect((await create({ mode: "live" })).status).toBe(409);
  });
});

describe("GET /api/boards/[id]/share-links", () => {
  it("lists the owner's links without token or password hashes", async () => {
    await create({ name: "A", mode: "live", password: "secret1" });
    await create({ name: "B", mode: "live" });
    store.seedBoard({ id: OTHERS_BOARD, ownerId: STRANGER });
    await store.insertLink({ boardId: OTHERS_BOARD, ownerId: STRANGER, name: "theirs", tokenHash: "z".repeat(64), mode: "live", roundId: null, scope: "board", frameIds: [], permission: "view", passwordHash: null, expiresAt: null, welcomeNote: "", allowDownload: false, watermark: false, showCredits: false, blindVotes: false });
    const res = await GET(req("GET"), board(BOARD));
    expect(res.status).toBe(200);
    const text = await res.text();
    const { links } = JSON.parse(text);
    expect(links.map((l: { name: string }) => l.name).sort()).toEqual(["A", "B"]);
    expect(text).not.toMatch(/tokenHash|passwordHash|argon2/);
    expect(links.find((l: { name: string }) => l.name === "A").hasPassword).toBe(true);
  }, 15_000);
});

async function makeLink(over: Record<string, unknown> = {}) {
  const body = await (await create({ mode: "live", ...over })).json();
  return body.link as { id: string; cookieEpoch: number };
}
const link = (id: string) => ({ params: Promise.resolve({ id }) });

describe("PATCH /api/share-links/[id]", () => {
  it("changes options and returns the summary", async () => {
    const l = await makeLink();
    const res = await PATCH(req("PATCH", { name: "Renamed", permission: "comment", votesRevealed: true }), link(l.id));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ name: "Renamed", permission: "comment", votesRevealed: true, cookieEpoch: 0 });
  });

  it("changing or clearing the password bumps the cookie epoch; other changes do not", async () => {
    const l = await makeLink();
    await PATCH(req("PATCH", { welcomeNote: "hello" }), link(l.id));
    expect((await store.getLink(l.id))!.cookieEpoch).toBe(0);
    await PATCH(req("PATCH", { password: "newsecret" }), link(l.id));
    const after = (await store.getLink(l.id))!;
    expect(after.cookieEpoch).toBe(1);
    expect(await passwordHasher.verify("newsecret", after.passwordHash!)).toBe(true);
    await PATCH(req("PATCH", { password: null }), link(l.id));
    const cleared = (await store.getLink(l.id))!;
    expect(cleared.cookieEpoch).toBe(2);
    expect(cleared.passwordHash).toBeNull();
  }, 20_000);

  it("400 for invalid values, unknown keys and an empty patch", async () => {
    const l = await makeLink();
    expect((await PATCH(req("PATCH", { permission: "root" }), link(l.id))).status).toBe(400);
    expect((await PATCH(req("PATCH", { revokedAt: null }), link(l.id))).status).toBe(400);
    expect((await PATCH(req("PATCH", {}), link(l.id))).status).toBe(400);
  });

  it("404 for another owner's link and for junk ids; their link is untouched", async () => {
    const foreign = await store.insertLink({ boardId: OTHERS_BOARD, ownerId: STRANGER, name: "theirs", tokenHash: "z".repeat(64), mode: "live", roundId: null, scope: "board", frameIds: [], permission: "view", passwordHash: null, expiresAt: null, welcomeNote: "", allowDownload: false, watermark: false, showCredits: false, blindVotes: false });
    expect((await PATCH(req("PATCH", { name: "mine" }), link(foreign.id))).status).toBe(404);
    expect((await REVOKE(req("POST", {}), link(foreign.id))).status).toBe(404);
    expect((await DELETE(req("DELETE"), link(foreign.id))).status).toBe(404);
    expect(await store.getLink(foreign.id)).toMatchObject({ name: "theirs", revokedAt: null });
    expect((await PATCH(req("PATCH", { name: "x" }), link("not-a-uuid"))).status).toBe(404);
  });

  it("403 cross-origin; 401 without a session", async () => {
    const l = await makeLink();
    expect((await PATCH(req("PATCH", { name: "x" }, { origin: "https://evil.example" }), link(l.id))).status).toBe(403);
    claims = null;
    expect((await PATCH(req("PATCH", { name: "x" }), link(l.id))).status).toBe(401);
  });
});

describe("revoke and delete", () => {
  it("revoke sets revokedAt, bumps the epoch and returns the summary with status revoked", async () => {
    const l = await makeLink();
    const res = await REVOKE(req("POST", {}), link(l.id));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "revoked", cookieEpoch: l.cookieEpoch + 1 });
    expect((await store.getLink(l.id))!.revokedAt).not.toBeNull();
  });

  it("revoke needs no body (a bare POST works) but still the same origin", async () => {
    const l = await makeLink();
    const bare = new Request(`${ORIGIN}/api/x`, { method: "POST", headers: { origin: ORIGIN } });
    expect((await REVOKE(bare, link(l.id))).status).toBe(200);
    const l2 = await makeLink();
    expect((await REVOKE(req("POST", {}, { origin: "https://evil.example" }), link(l2.id))).status).toBe(403);
  });

  it("DELETE removes the link: 204 then 404", async () => {
    const l = await makeLink();
    const res = await DELETE(req("DELETE"), link(l.id));
    expect(res.status).toBe(204);
    expect(await store.getLink(l.id)).toBeNull();
    expect((await DELETE(req("DELETE"), link(l.id))).status).toBe(404);
  });
});
