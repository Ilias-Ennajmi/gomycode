import { jsonResponse } from "@/lib/server/http";
import { getShareStore, type ShareStore, type StoreBoard, type Visitor } from "@/lib/server/share-store";
import { COOKIE_TTL_SEC, cookieAttributes, cookieSecretsFromEnv, readCookie, signVisitorCookie, slideCookie, verifyVisitorCookie, visitorCookieName, type VisitorClaims } from "./cookie";
import { can, inScope, linkState, type Action, type LinkRow } from "./link";
import { hashToken, isPlausibleToken } from "./token";

/*
 * THE visitor guard. Every /api/s/[token]/* route except `meta` calls requireVisitor, and no handler reads link state,
 * cookies, permission or scope itself (docs/SPEC.md section 5: "every visitor API call re-checks link not revoked, not
 * expired, permission, scope"). It reads everything fresh from the store on every request: a revoke, a password change or a
 * permission downgrade applies to the very next call, with no grace period.
 *
 * What it answers, and why it answers it that way:
 *   404 not-found   the token is malformed, unknown, revoked, expired, or its board is gone, AND the caller holds no valid
 *                   cookie for that link. All of those are one response, so a stranger cannot tell a dead link from one that
 *                   never existed.
 *   410 gone        the same dead link, but the caller holds a genuine (signed, unexpired) cookie issued for it: they have
 *                   been here, so the viewer may say "this link is no longer available" instead of a blank error.
 *   401 session-required | password-required      no usable session yet
 *   403 name-required | forbidden | out-of-scope   the session exists but may not do this
 * Bodies are { error } only and never echo the token, a cookie or a link field.
 */

export interface Need {
  /** The visitor must have given a name. */
  named?: boolean;
  /** What the request does; omitted = just looking. */
  action?: Action;
  /** The frame the request is about. Omitted = no scope check; null = "an object that is in no frame". */
  frameId?: string | null;
}

export interface GuardOk {
  link: LinkRow;
  visitor: Visitor;
  claims: VisitorClaims;
  /** A complete Set-Cookie value to attach to the response when the sliding window moved, else null. */
  cookieHeader: string | null;
}

export interface GuardDeps {
  store?: ShareStore;
  now?: () => Date;
  secrets?: string[];
  /** Emit `Secure` cookies. Defaults to NODE_ENV === "production". */
  isProd?: boolean;
}

const reply = (status: number, error: string) => jsonResponse(status, { error });
export const notFound = () => reply(404, "not-found");
export const gone = () => reply(410, "gone");
const sessionRequired = () => reply(401, "session-required");

export const isProduction = () => process.env.NODE_ENV === "production";

export interface ResolvedLink {
  link: LinkRow;
  board: StoreBoard;
  /** Claims of a genuine cookie issued for THIS link (signature, expiry and `lid` checked; epoch, password and visitor NOT yet). */
  claims: VisitorClaims | null;
  nowSec: number;
  now: Date;
  secrets: string[];
  store: ShareStore;
}

// Spent when the token matched no link, so the miss costs what a hit costs (one HMAC) rather than answering faster.
const DECOY_COOKIE = "v1.e30.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

/**
 * Steps 1-4 of the guard, shared with the routes that run before a session exists (session, unlock, meta): the token, the
 * link, its state and its board. THROWS the 404/410 above when the link is not usable; otherwise returns what it found.
 */
export async function resolveLink(req: Request, token: string, deps: GuardDeps = {}): Promise<ResolvedLink> {
  const store = deps.store ?? getShareStore();
  const now = (deps.now ?? (() => new Date()))();
  const secrets = deps.secrets ?? cookieSecretsFromEnv();

  if (!isPlausibleToken(token)) throw notFound(); // junk URLs never reach the database
  if (secrets.length === 0) throw reply(503, "not-configured"); // a deployment fault, not something about this link

  const nowSec = Math.floor(now.getTime() / 1000);
  const link = await store.getLinkByHash(hashToken(token));
  if (!link) {
    verifyVisitorCookie(DECOY_COOKIE, secrets, nowSec);
    throw notFound();
  }

  const raw = readCookie(req.headers.get("cookie"), visitorCookieName(link.id));
  const claims = raw ? verifyVisitorCookie(raw, secrets, nowSec, link.id) : null;

  let board: StoreBoard | null = null;
  if (linkState(link, now) === "ok") {
    board = await store.getBoard(link.boardId);
    if (board && board.deletedAt !== null) board = null; // a board in the trash is not shared
  }
  if (!board) throw claims ? gone() : notFound();

  return { link, board, claims, nowSec, now, secrets, store };
}

/** Does this cookie, for this link as it is NOW, still amount to a session? (epoch, password gate, visitor row) */
export async function sessionFor(r: ResolvedLink): Promise<{ claims: VisitorClaims; visitor: Visitor } | "password-required" | null> {
  const { link, claims, store } = r;
  if (!claims || claims.ep !== link.cookieEpoch) return null;
  if (link.passwordHash !== null && !claims.pw) return "password-required";
  const visitor = await store.getVisitor(claims.vid);
  if (!visitor || visitor.linkId !== link.id) return null;
  return { claims, visitor };
}

/** `name=value; attributes` for the visitor's cookie on this link. */
export function setCookieValue(linkId: string, claims: VisitorClaims, secret: string, isProd: boolean): string {
  return `${visitorCookieName(linkId)}=${signVisitorCookie(claims, secret)}; ${cookieAttributes(isProd, COOKIE_TTL_SEC)}`;
}

export async function requireVisitor(req: Request, token: string, need: Need = {}, deps: GuardDeps = {}): Promise<GuardOk> {
  const r = await resolveLink(req, token, deps);
  const { link } = r;

  const session = await sessionFor(r);
  if (session === null) throw sessionRequired();
  if (session === "password-required") throw reply(401, "password-required");
  const { claims, visitor } = session;

  if (need.named && !visitor.displayName) throw reply(403, "name-required");
  if (need.action !== undefined && !can(link, need.action)) throw reply(403, "forbidden");
  if (need.frameId !== undefined && !inScope(link, { frameId: need.frameId })) throw reply(403, "out-of-scope");

  const slid = slideCookie(claims, r.nowSec, COOKIE_TTL_SEC, r.secrets[0]);
  const cookieHeader = slid.refreshed
    ? `${visitorCookieName(link.id)}=${slid.value}; ${cookieAttributes(deps.isProd ?? isProduction(), COOKIE_TTL_SEC)}`
    : null;
  return { link, visitor, claims, cookieHeader };
}
