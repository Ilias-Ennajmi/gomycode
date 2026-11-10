/*
 * Recovery codes, the part that needs no network (contract 0007 §4.3). The code is made
 * and checked only by the Edge Function `stash-recovery`; the app never derives anything
 * from it. This file tidies what a person types or scans, and words the errors.
 */

/** Crockford base32: no I, L, O or U. */
export const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const CODE_LENGTH = 20;
const GROUP = 5;

/** Uppercase, letters and digits only, O→0, I→1, L→1 (the same rule the function applies). */
export function normalizeCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
}

export function isValidCode(input: string): boolean {
  const n = normalizeCode(input);
  return n.length === CODE_LENGTH && [...n].every((c) => CODE_ALPHABET.includes(c));
}

/** XXXXX-XXXXX-XXXXX-XXXXX, also for a code still being typed. */
export function formatCode(input: string): string {
  const n = normalizeCode(input).slice(0, CODE_LENGTH);
  return n.match(new RegExp(`.{1,${GROUP}}`, "g"))?.join("-") ?? "";
}

/** Characters a code can't contain (U, or anything left after tidying), for a precise hint. */
export function badCharacters(input: string): string[] {
  return [...new Set([...normalizeCode(input)].filter((c) => !CODE_ALPHABET.includes(c)))];
}

/** What to show under the field while typing. Null when there is nothing to say yet. */
export function codeHint(input: string): string | null {
  const n = normalizeCode(input);
  if (!n) return null;
  const bad = badCharacters(input);
  if (bad.length) return `A code never contains ${bad.join(", ")}. Check that character.`;
  if (n.length > CODE_LENGTH) return "That's too long. A code has 20 characters.";
  if (n.length < CODE_LENGTH) return `${CODE_LENGTH - n.length} more to go.`;
  return null;
}

// The QR holds a link to /restore with the code after the #, so the code never reaches a server log.
const RESTORE_PATH = "/restore";

export function recoveryLink(origin: string, code: string): string {
  return `${origin.replace(/\/$/, "")}${RESTORE_PATH}#${formatCode(code)}`;
}

/** The code inside a scanned QR or a pasted text (a restore link, or the code itself). Null if none. */
export function extractCode(text: string | null | undefined): string | null {
  if (!text) return null;
  const hash = text.includes("#") ? text.slice(text.lastIndexOf("#") + 1) : text;
  let decoded = hash;
  try {
    decoded = decodeURIComponent(hash);
  } catch {
    // not URL-encoded
  }
  if (isValidCode(decoded)) return formatCode(decoded);
  const match = text.toUpperCase().match(/[0-9A-Z]{5}(?:[-\s]?[0-9A-Z]{5}){3}/);
  return match && isValidCode(match[0]) ? formatCode(match[0]) : null;
}

export type RecoveryAction = "create" | "restore";
export type RecoveryError = "invalid_code" | "not_found" | "rate_limited" | "unauthorized" | "offline" | "unavailable" | "pending_saves" | "failed";

/** Maps the function's `{error}` and HTTP status to one of the cases the app explains. */
export function recoveryError(status: number | null, code: string | null | undefined): RecoveryError {
  if (code === "invalid_code" || code === "not_found" || code === "rate_limited" || code === "unauthorized") return code;
  if (status === 429) return "rate_limited";
  if (status === 401) return "unauthorized";
  if (status === 400) return "invalid_code";
  // A 404 without the function's own body means the function isn't deployed yet.
  if (status === 404 || status === 502 || status === 503) return "unavailable";
  if (status === null) return "offline";
  return "failed";
}

export function recoveryErrorText(error: RecoveryError, action: RecoveryAction): string {
  switch (error) {
    case "invalid_code":
      return "That isn't a recovery code. It has 20 letters and digits, like 4F7QK-2M9XA-0TB3R-H8ZNC.";
    case "not_found":
      return "No Stash matches that code. Check each character, or the code was replaced by a newer one.";
    case "rate_limited":
      return action === "create"
        ? "You've made 5 codes today. Try again tomorrow; the last code still works."
        : "Too many tries from this connection. Wait an hour, then try again.";
    case "unauthorized":
      return "This phone isn't connected yet. Open Stash with a connection and try again.";
    case "offline":
      return "This needs a connection. Nothing was changed.";
    case "unavailable":
      return "Recovery isn't switched on for this Stash yet. Nothing was changed.";
    case "pending_saves":
      return "Some saves on this phone haven't been sent yet. Connect, wait a moment, then try again.";
    default:
      return "That didn't work. Nothing was changed. Try again in a moment.";
  }
}
