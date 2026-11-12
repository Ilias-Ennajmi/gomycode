import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The signed visitor cookie (docs/SPEC.md section 5): "v1.<base64url(JSON claims)>.<base64url(HMAC-SHA256)>".
 * It proves "this browser passed the gate of link `lid` as visitor `vid`". It carries no authority by itself: the guard
 * (Task 12) still re-checks the link (revoked, expired, epoch, permission, scope) on every request.
 *
 * Secrets come from SHARE_COOKIE_SECRET: one or more comma-separated values of at least 32 characters. The FIRST signs, every
 * one verifies, so a secret is rotated by prepending the new one and dropping the old one 12 hours later.
 * Nothing here logs, and no error message contains a secret or a cookie.
 */

export interface VisitorClaims {
  /** share_links.id */
  lid: string;
  /** visitors.id */
  vid: string;
  /** share_links.cookie_epoch at issue time: bumping the epoch kills every cookie of the link at once. */
  ep: number;
  /** The password gate was passed (or the link has no password). */
  pw: boolean;
  /** Expiry, epoch seconds. */
  exp: number;
}

export const COOKIE_TTL_SEC = 43_200; // 12 h
const REFRESH_WHEN_LESS_THAN_SEC = 11 * 3600; // slide once an hour of the 12 has been used
const VERSION = "v1";
const MIN_SECRET_CHARS = 32;
const MAX_VALUE_CHARS = 1024;
const B64URL = /^[A-Za-z0-9_-]+$/;

/** Secrets usable for signing and verifying, newest first. Entries shorter than 32 characters are ignored. */
export function cookieSecretsFromEnv(env: Record<string, string | undefined> = process.env): string[] {
  return (env.SHARE_COOKIE_SECRET ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length >= MIN_SECRET_CHARS);
}

function signingSecretFromEnv(): string {
  const [first] = cookieSecretsFromEnv();
  if (!first) throw new Error("SHARE_COOKIE_SECRET is not set (needs at least 32 characters)");
  return first;
}

function mac(signingInput: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(signingInput, "utf8").digest();
}

/** Decodes base64url only when the text is exactly the canonical encoding of the bytes (no padding, no alternative spellings). */
function decodeCanonical(text: string): Buffer | null {
  if (!B64URL.test(text)) return null;
  const bytes = Buffer.from(text, "base64url");
  return bytes.toString("base64url") === text ? bytes : null;
}

export function signVisitorCookie(c: VisitorClaims, secret: string): string {
  if (typeof secret !== "string" || secret.length < MIN_SECRET_CHARS) {
    throw new Error("cookie secret is missing or too short");
  }
  const payload = Buffer.from(JSON.stringify({ lid: c.lid, vid: c.vid, ep: c.ep, pw: c.pw, exp: c.exp }), "utf8").toString("base64url");
  const signingInput = `${VERSION}.${payload}`;
  return `${signingInput}.${mac(signingInput, secret).toString("base64url")}`;
}

function claimsFrom(json: unknown): VisitorClaims | null {
  if (typeof json !== "object" || json === null || Array.isArray(json)) return null;
  const o = json as Record<string, unknown>;
  const { lid, vid, ep, pw, exp } = o;
  if (typeof lid !== "string" || lid.length < 1 || lid.length > 64) return null;
  if (typeof vid !== "string" || vid.length < 1 || vid.length > 64) return null;
  if (typeof ep !== "number" || !Number.isSafeInteger(ep) || ep < 0) return null;
  if (typeof pw !== "boolean") return null;
  if (typeof exp !== "number" || !Number.isSafeInteger(exp)) return null;
  return { lid, vid, ep, pw, exp };
}

/**
 * The claims of a genuine, unexpired cookie, or null. Null covers every failure alike (malformed, truncated, forged, wrong
 * secret, expired, wrong link) so callers cannot tell attackers anything. The signature is compared in constant time against
 * every secret; the payload is parsed only after it verified.
 *
 * `expectedLinkId`, when given, must equal the cookie's `lid` (the caller is handling that link).
 */
export function verifyVisitorCookie(
  value: string,
  secrets: string[],
  nowSec: number,
  expectedLinkId?: string,
): VisitorClaims | null {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_VALUE_CHARS) return null;
  const parts = value.split(".");
  if (parts.length !== 3 || parts[0] !== VERSION) return null;
  const [, payloadText, macText] = parts;
  const given = decodeCanonical(macText);
  const payload = decodeCanonical(payloadText);
  if (!given || given.length !== 32 || !payload) return null;

  const signingInput = `${VERSION}.${payloadText}`;
  let valid = false;
  for (const secret of secrets) {
    if (typeof secret !== "string" || secret.length < MIN_SECRET_CHARS) continue;
    // No early exit: every secret costs the same.
    if (timingSafeEqual(mac(signingInput, secret), given)) valid = true;
  }
  if (!valid) return null;

  let claims: VisitorClaims | null;
  try {
    claims = claimsFrom(JSON.parse(payload.toString("utf8")));
  } catch {
    return null;
  }
  if (!claims || claims.exp <= nowSec) return null;
  if (expectedLinkId !== undefined && claims.lid !== expectedLinkId) return null;
  return claims;
}

/**
 * Sliding expiry. Returns a cookie value for the claims, and `refreshed: true` when it is a NEW cookie (expiry moved to
 * now + ttl) that the caller should send; false means keep the cookie the browser already has. A cookie is renewed once
 * less than 11 h of its 12 remain.
 */
export function slideCookie(
  c: VisitorClaims,
  nowSec: number,
  ttlSec: number = COOKIE_TTL_SEC,
  secret: string = signingSecretFromEnv(),
): { value: string; refreshed: boolean } {
  const threshold = ttlSec === COOKIE_TTL_SEC ? REFRESH_WHEN_LESS_THAN_SEC : ttlSec - 3600;
  if (c.exp - nowSec < threshold) {
    return { value: signVisitorCookie({ ...c, exp: nowSec + ttlSec }, secret), refreshed: true };
  }
  return { value: signVisitorCookie(c, secret), refreshed: false };
}

/** One cookie per link, so two links open in one browser never overwrite each other: `atl_v_` + the first 12 id characters. */
export function visitorCookieName(linkId: string): string {
  const id = typeof linkId === "string" ? linkId.slice(0, 12) : "";
  return `atl_v_${id.replace(/[^A-Za-z0-9_-]/g, "_")}`;
}

/** Attributes for Set-Cookie (after `name=value; `). Secure in production; Max-Age 0 clears the cookie. */
export function cookieAttributes(isProd: boolean, maxAgeSec: number): string {
  const age = Number.isFinite(maxAgeSec) ? Math.max(0, Math.floor(maxAgeSec)) : 0;
  return `HttpOnly; Path=/; SameSite=Lax; Max-Age=${age}${isProd ? "; Secure" : ""}`;
}

/** One cookie's value out of a `Cookie` request header (not decoded; our values are base64url and dots). */
export function readCookie(header: string | null | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}
