/** Longest URL the board accepts anywhere (a link card, an embed source, a pasted address). */
export const MAX_URL_LENGTH = 2048;

/**
 * Strict parse of an address typed or pasted by the owner. Returns the WHATWG URL only for a lone http(s) URL:
 * no whitespace inside, no credentials (`https://youtube.com@evil.com/` is refused outright), at most 2,048
 * characters. Everything else (javascript:, data:, file:, ftp:, relative strings, prose) is null.
 */
export function parseHttpUrl(raw: unknown): URL | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (t.length === 0 || t.length > MAX_URL_LENGTH) return null;
  if (/[\s\u0000-\u001f\u007f]/.test(t)) return null;
  let u: URL;
  try {
    u = new URL(t);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (u.username !== "" || u.password !== "") return null;
  if (u.hostname === "") return null;
  return u;
}

/** The host shown on a card ("www.example.com"), or "" when the address is not a web URL. */
export function hostnameOf(raw: string): string {
  const u = parseHttpUrl(raw);
  return u ? u.hostname : "";
}
