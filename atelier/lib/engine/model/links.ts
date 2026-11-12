/**
 * Links in rich text are limited to http(s) and mailto. This is the one place that decides what a typed or pasted
 * address means; the editor, the clipboard and the renderer all refuse anything it rejects.
 */

const CONTROL_OR_SPACE = /[\u0000-\u001f\u007f\s]/;
const SCHEME = /^([a-z][a-z0-9+.-]*):/i;
const HOST_WITH_PORT = /^[a-z0-9.-]+:\d+(?:[/?#]|$)/i;
const BARE_HOST = /^(?:localhost|[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,})(?::\d+)?(?:[/?#]|$)/i;
const EMAIL = /^[^\s@/:]+@[^\s@/:]+\.[a-z]{2,}$/i;

/**
 * The address to store for what the user typed, or null when it is not a safe link: only http(s) and mailto, no
 * whitespace or control characters anywhere (they are used to smuggle `javascript:`), and a real host. A bare host
 * (`example.com/x`) gets `https://`, a bare e-mail address gets `mailto:`.
 */
export function normalizeLinkHref(raw: string): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (v === "" || CONTROL_OR_SPACE.test(v) || v.startsWith("//")) return null;

  const scheme = SCHEME.exec(v);
  if (scheme && !HOST_WITH_PORT.test(v)) {
    const s = scheme[1].toLowerCase();
    if (s === "http" || s === "https") return /^https?:\/\/[^/?#\s]+/i.test(v) ? v : null;
    if (s === "mailto") return v.length > "mailto:".length ? v : null;
    return null;
  }
  if (EMAIL.test(v)) return `mailto:${v}`;
  return BARE_HOST.test(v) ? `https://${v}` : null;
}

/** True when `raw` already names an allowed scheme explicitly (what a link mark may carry). */
export function isSafeLinkHref(raw: string): boolean {
  const v = normalizeLinkHref(raw);
  return v !== null && /^(https?:|mailto:)/i.test(v) && v === raw.trim();
}
