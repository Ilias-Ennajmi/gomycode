import { attemptKey, createAttemptTracker, type AttemptTracker } from "@/lib/share/backoff";
import { COOKIE_TTL_SEC, slideCookie, type VisitorClaims } from "@/lib/share/cookie";
import { sanitiseDisplayName } from "@/lib/share/display-name";
import { isProduction, requireVisitor, resolveLink, sessionFor, setCookieValue, type GuardDeps, type ResolvedLink } from "@/lib/share/guard";
import { passwordHasher, type PasswordHasher } from "@/lib/share/password";
import { clientIp, ipHash, jsonResponse, readJsonLimited } from "./http";
import { getShareStore, type Visitor } from "./share-store";
import { assertAppOrigin } from "./site-url";

/*
 * The routes a visitor uses before and around a session: meta (what to show), session (get a cookie on an open link), unlock
 * (the password gate), join (the display name). The handlers take their dependencies as an argument so tests can drive the
 * clock, the store and the password hasher; the route files call them with the defaults.
 *
 * Every POST: same-origin (assertAppOrigin), JSON only, body capped at 1 KB, Cache-Control private no-store, and the same
 * uniform answers as the guard for dead links (404, or 410 for a holder of a genuine cookie).
 */

export const MAX_BODY_BYTES = 1024;
export const MAX_VISITORS_PER_LINK = 500;
export const NEW_VISITORS_PER_IP_PER_HOUR = 30;
const HOUR_MS = 3_600_000;
const STUDIO_NAME_MAX = 80;

/**
 * A genuine argon2id hash (same parameters as real link passwords) of a password nobody knows. A link without a password
 * still "verifies" against it, so how long `unlock` takes does not tell a visitor whether the link has a password.
 */
export const DUMMY_HASH = "$argon2id$v=19$m=65536,t=2,p=1$AXQ1lE9Cj19tREHDQ2v/GQ$rvHYSjgE3tqu9xCAOtDw+FrHHOmRPd3Oy1Ndloal7Iw";

export interface RouteDeps extends GuardDeps {
  hasher?: PasswordHasher;
  tracker?: AttemptTracker;
  env?: Record<string, string | undefined>;
}

// One tracker per server instance (best effort, like lib/server/rate-limit.ts); the durable lock lives in the store.
let sharedTracker: AttemptTracker | null = null;
const defaultTracker = () => (sharedTracker ??= createAttemptTracker());

const reply = (status: number, error: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) =>
  jsonResponse(status, { error, ...extra }, { headers });

const rateLimited = () => reply(429, "rate-limited", {}, { "retry-after": String(HOUR_MS / 1000) });

/** Runs a handler body and turns a thrown Response (from a guard, a body reader, a same-origin check) into the answer. */
async function guarded(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

function cookieFor(r: ResolvedLink, visitor: Visitor, pw: boolean, isProd: boolean): string {
  const claims: VisitorClaims = { lid: r.link.id, vid: visitor.id, ep: r.link.cookieEpoch, pw, exp: r.nowSec + COOKIE_TTL_SEC };
  return setCookieValue(r.link.id, claims, r.secrets[0], isProd);
}

/** A new visitor, unless the link or the address has made too many (then a 429 Response). */
async function newVisitor(r: ResolvedLink, req: Request): Promise<Visitor | Response> {
  const hash = ipHash(clientIp(req), r.secrets[0]);
  if ((await r.store.countVisitors(r.link.id)) >= MAX_VISITORS_PER_LINK) return rateLimited();
  const since = new Date(r.now.getTime() - HOUR_MS);
  if ((await r.store.countRecentVisitors(r.link.id, hash, since)) >= NEW_VISITORS_PER_IP_PER_HOUR) return rateLimited();
  return r.store.createVisitor(r.link.id, hash);
}

// ---- GET meta ---------------------------------------------------------------------------------------------------------

export async function handleMeta(req: Request, token: string, deps: RouteDeps = {}): Promise<Response> {
  const env = deps.env ?? process.env;
  let r: ResolvedLink;
  try {
    r = await resolveLink(req, token, deps);
  } catch (e) {
    if (e instanceof Response && e.status === 503) return e;
    // Unknown, malformed, revoked, expired, board gone: one answer, nothing else in it.
    return jsonResponse(200, { status: "gone" });
  }

  const session = await sessionFor(r);
  const live = session !== null && session !== "password-required" ? session : null;
  const needsPassword = r.link.passwordHash !== null && !(r.claims?.pw === true && r.claims.ep === r.link.cookieEpoch);
  const studioName = (env.ATELIER_STUDIO_NAME ?? "").trim().slice(0, STUDIO_NAME_MAX);

  const base = { status: "ok", needsPassword, hasSession: live !== null, visitorName: live?.visitor.displayName ?? null, studioName };
  if (needsPassword) return jsonResponse(200, { ...base, hasSession: false, visitorName: null, title: null });
  return jsonResponse(200, { ...base, title: r.board.title, permission: r.link.permission, welcomeNote: r.link.welcomeNote || null });
}

// ---- POST session -----------------------------------------------------------------------------------------------------

export function handleSession(req: Request, token: string, deps: RouteDeps = {}): Promise<Response> {
  return guarded(async () => {
    assertAppOrigin(req, deps.env);
    await readJsonLimited(req, MAX_BODY_BYTES, { allowEmpty: true });
    const r = await resolveLink(req, token, deps);
    const isProd = deps.isProd ?? isProduction();

    const existing = await sessionFor(r);
    if (existing !== null && existing !== "password-required") {
      const slid = slideCookie(existing.claims, r.nowSec, COOKIE_TTL_SEC, r.secrets[0]);
      const cookie = slid.refreshed ? setCookieValue(r.link.id, { ...existing.claims, exp: r.nowSec + COOKIE_TTL_SEC }, r.secrets[0], isProd) : null;
      return jsonResponse(200, { name: existing.visitor.displayName, created: false }, { cookie });
    }
    if (r.link.passwordHash !== null) return reply(401, "password-required");

    const visitor = await newVisitor(r, req);
    if (visitor instanceof Response) return visitor;
    return jsonResponse(201, { name: null, created: true }, { cookie: cookieFor(r, visitor, true, isProd) });
  });
}

// ---- POST unlock ------------------------------------------------------------------------------------------------------

export function handleUnlock(req: Request, token: string, deps: RouteDeps = {}): Promise<Response> {
  return guarded(async () => {
    assertAppOrigin(req, deps.env);
    const body = await readJsonLimited<{ password?: unknown }>(req, MAX_BODY_BYTES);
    const r = await resolveLink(req, token, deps);
    const hasher = deps.hasher ?? passwordHasher;
    const tracker = deps.tracker ?? defaultTracker();
    const isProd = deps.isProd ?? isProduction();

    const password = body !== null && typeof body === "object" ? body.password : undefined;
    if (typeof password !== "string") return reply(400, "invalid-body");

    const hash = ipHash(clientIp(req), r.secrets[0]);
    const locked = (retryAfter: number) => reply(429, "locked", { retryAfter }, { "retry-after": String(retryAfter) });

    // Cheap checks first, and BEFORE any password work: a locked client is refused without a verification, so the lock
    // itself cannot be probed (nothing about the password can be learned from a locked response).
    const burst = tracker.check(attemptKey(r.link.id, hash));
    if (!burst.allowed) return locked(burst.retryAfterSec);
    const attempt = r.link.passwordHash !== null ? await r.store.getAttempt(r.link.id, hash) : null;
    if (attempt?.lockedUntil) {
      const left = Date.parse(attempt.lockedUntil) - r.now.getTime();
      if (left > 0) return locked(Math.ceil(left / 1000));
    }

    // A link with no password verifies against a decoy, so the work (and the time) is the same either way.
    const ok = r.link.passwordHash !== null ? await hasher.verify(password, r.link.passwordHash) : (await hasher.verify(password, DUMMY_HASH), true);
    if (!ok) {
      const rec = await r.store.recordFailure(r.link.id, hash, r.now);
      const retryAfter = rec.lockedUntil ? Math.max(0, Math.ceil((Date.parse(rec.lockedUntil) - r.now.getTime()) / 1000)) : 0;
      return reply(401, "wrong-password", { retryAfter }, retryAfter > 0 ? { "retry-after": String(retryAfter) } : {});
    }
    if (r.link.passwordHash !== null) await r.store.clearAttempts(r.link.id, hash);

    // The browser keeps its identity when its cookie is still one of this link's (same epoch, visitor exists).
    let visitor: Visitor | null = null;
    if (r.claims && r.claims.ep === r.link.cookieEpoch) {
      const known = await r.store.getVisitor(r.claims.vid);
      if (known && known.linkId === r.link.id) visitor = known;
    }
    if (!visitor) {
      const made = await newVisitor(r, req);
      if (made instanceof Response) return made;
      visitor = made;
    }
    return jsonResponse(204, null, { cookie: cookieFor(r, visitor, true, isProd) });
  });
}

// ---- POST join --------------------------------------------------------------------------------------------------------

export function handleJoin(req: Request, token: string, deps: RouteDeps = {}): Promise<Response> {
  return guarded(async () => {
    assertAppOrigin(req, deps.env);
    const g = await requireVisitor(req, token, {}, deps);
    const body = await readJsonLimited<{ name?: unknown }>(req, MAX_BODY_BYTES);
    const name = sanitiseDisplayName(body !== null && typeof body === "object" ? body.name : undefined);
    if (name === null) return reply(400, "invalid-name");
    await (deps.store ?? getShareStore()).setVisitorName(g.visitor.id, name);
    return jsonResponse(200, { name }, { cookie: g.cookieHeader });
  });
}

