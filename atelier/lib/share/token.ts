import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Share-link tokens (docs/SPEC.md section 5). A token is 32 random bytes in base64url (43 characters) and is shown
 * to the owner once. Only its SHA-256 hex is stored, so a leaked database never contains a usable link.
 *
 * Server-only (node:crypto). Nothing here logs; callers must not log tokens either.
 */

export const TOKEN_LENGTH = 43;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

/** A fresh token and the hash to store. */
export function generateToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

/** SHA-256 hex of the token. Accepts any string (and survives a non-string): it is the first thing a hostile URL reaches. */
export function hashToken(token: string): string {
  return createHash("sha256")
    .update(typeof token === "string" ? token : "", "utf8")
    .digest("hex");
}

/** Cheap shape check, to reject junk URLs before any database call. `$` is not used so a trailing newline cannot slip through. */
export function isPlausibleToken(token: string): boolean {
  return typeof token === "string" && token.length === TOKEN_LENGTH && TOKEN_RE.test(token);
}

/**
 * Constant-time string equality for secrets and MACs. Both sides are hashed first, so the comparison always runs over two
 * 32-byte buffers: neither the content nor the length of the secret leaks through timing.
 */
export function safeEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}
