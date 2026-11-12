import type { Provenance } from "../model/types";

export const MAX_SOURCE_URL = 2048;
export const MAX_CREDIT = 200;
export const MAX_LICENCE = 100;

export const emptyProvenance = (): Provenance => ({ sourceUrl: null, credit: "", licence: "", capturedAt: null });

/** Licences offered as suggestions in the Source section; the field stays free text. */
export const LICENCE_SUGGESTIONS = ["CC BY 4.0", "CC BY-SA 4.0", "CC0", "All rights reserved", "Editorial use only"] as const;

// Whitespace and control characters never belong in a link; a browser would silently strip some of them, which is how
// "java\nscript:" style tricks work, so they are rejected rather than normalised.
const BAD_URL_CHARS = /[\s\u0000-\u001f\u007f]/;

/**
 * The link to a picture's source, or null. Only http and https, at most 2048 characters, no embedded credentials
 * (`https://user:pw@host`), no whitespace or control characters. Returns the normalised href.
 */
export function sanitizeSourceUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > MAX_SOURCE_URL + 64) return null;
  const raw = value.trim();
  if (raw === "" || raw.length > MAX_SOURCE_URL) return null;
  if (!/^https?:\/\//i.test(raw) || BAD_URL_CHARS.test(raw)) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if ((u.protocol !== "http:" && u.protocol !== "https:") || u.username !== "" || u.password !== "" || u.hostname === "") return null;
  return u.href.length <= MAX_SOURCE_URL ? u.href : null;
}

/** One line of plain text: breaks become spaces, other control characters are dropped, the ends are trimmed. */
export function cleanLine(value: string): string {
  return value
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
}

/** "YYYY-MM-DD" (a real calendar day) or a full ISO date-time; anything else is not a capture date. */
export function isCaptureDate(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 40) return false;
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (day) {
    const [y, m, d] = [Number(day[1]), Number(day[2]), Number(day[3])];
    const t = new Date(Date.UTC(y, m - 1, d));
    return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
  }
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})?$/.test(value) && !Number.isNaN(Date.parse(value));
}

/** A clean Provenance, or null when any field is unusable (the caller shows the message; nothing is half-saved). */
export function validateProvenance(p: unknown): Provenance | null {
  if (typeof p !== "object" || p === null) return null;
  const r = p as Record<string, unknown>;
  let sourceUrl: string | null = null;
  if (r.sourceUrl !== null && r.sourceUrl !== undefined && r.sourceUrl !== "") {
    sourceUrl = sanitizeSourceUrl(r.sourceUrl);
    if (sourceUrl === null) return null;
  }
  const credit = r.credit === undefined ? "" : typeof r.credit === "string" ? cleanLine(r.credit) : null;
  const licence = r.licence === undefined ? "" : typeof r.licence === "string" ? cleanLine(r.licence) : null;
  if (credit === null || licence === null || credit.length > MAX_CREDIT || licence.length > MAX_LICENCE) return null;
  let capturedAt: string | null = null;
  if (r.capturedAt !== null && r.capturedAt !== undefined && r.capturedAt !== "") {
    if (!isCaptureDate(r.capturedAt)) return null;
    capturedAt = r.capturedAt;
  }
  return { sourceUrl, credit, licence, capturedAt };
}

/** Whether there is anything worth showing or exporting. */
export function hasProvenance(p: Provenance | null | undefined): p is Provenance {
  return !!p && (p.sourceUrl !== null || p.credit.trim() !== "" || p.licence.trim() !== "");
}

/** Hostname of a source link without a leading "www.", or "". */
export function sourceHost(url: string | null): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

/**
 * The line shown under a picture when credits are on: "Credit · Licence", else the host of the source link, else "".
 * Plain text: whatever draws it must not interpret it as markup.
 */
export function creditLine(p: Provenance | null | undefined): string {
  if (!p) return "";
  const credit = cleanLine(p.credit ?? "");
  const licence = cleanLine(p.licence ?? "");
  const parts = [credit, licence].filter((s) => s !== "");
  if (parts.length) return parts.join(" · ");
  return sourceHost(p.sourceUrl ?? null);
}
