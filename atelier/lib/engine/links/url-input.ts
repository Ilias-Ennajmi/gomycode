import { classifyUrl } from "./classify";
import { MAX_URL_LENGTH, parseHttpUrl } from "./url";

export type UrlInputResult = { ok: true; url: string } | { ok: false; message: string };

/**
 * Checks an address typed into the "Link card" or "Embed" dialog and explains what is wrong in a sentence. For "embed"
 * only YouTube, Vimeo and Figma addresses pass (the same test as pasting).
 */
export function validateUrlInput(kind: "link" | "embed", raw: string): UrlInputResult {
  const t = raw.trim();
  if (t.length === 0) return { ok: false, message: "Enter a web address." };
  if (t.length > MAX_URL_LENGTH) return { ok: false, message: "That address is too long (the limit is 2,048 characters)." };
  if (!/\s/.test(t)) {
    try {
      const u = new URL(t);
      if ((u.protocol === "http:" || u.protocol === "https:") && (u.username || u.password)) {
        return { ok: false, message: "Remove the username and password from the address." };
      }
    } catch {
      /* reported below */
    }
  }
  if (!parseHttpUrl(t)) return { ok: false, message: "That doesn't look like a web address. It should start with https://" };
  const c = classifyUrl(t);
  if (c.kind === "none") return { ok: false, message: "That doesn't look like a web address. It should start with https://" };
  if (kind === "embed" && c.kind !== "embed") {
    return { ok: false, message: "Only YouTube, Vimeo and Figma addresses can be embedded. Use a link card for other pages." };
  }
  return { ok: true, url: t };
}
