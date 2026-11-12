import type { Provenance } from "../model/types";
import { sanitizeSourceUrl } from "./validate";

export type ProvenanceInput = {
  /** text/html from the clipboard or a drag. */
  html?: string;
  /** text/plain or text/uri-list. */
  text?: string;
  /** The page the picture came from, when the caller knows it (share target, extension, drag from a page). */
  url?: string;
  /** Dropped file name. Never turned into a credit; accepted so callers can pass everything they have. */
  fileName?: string;
  /** Test seam; defaults to the current time. */
  now?: Date;
};

// Hostile or accidental megabytes of markup: only the start is read.
const MAX_HTML = 400_000;
const MAX_TEXT = 100_000;
const MAX_LINES = 200;
// Elements whose content is not markup. An unclosed one swallows the rest of the document, as in a browser.
const RAW_TEXT = /^(script|style|textarea|title|noscript|template|xmp|iframe)$/i;
const NAMED: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">" };

function decodeEntities(s: string): string {
  if (!s.includes("&")) return s;
  return s.replace(/&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([a-zA-Z]{2,5}));/g, (m, dec: string | undefined, hex: string | undefined, name: string | undefined) => {
    if (name) return NAMED[name.toLowerCase()] ?? m;
    const cp = dec !== undefined ? Number(dec) : parseInt(hex as string, 16);
    return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff) ? String.fromCodePoint(cp) : "";
  });
}

const isSpace = (c: number) => c === 32 || c === 9 || c === 10 || c === 12 || c === 13;

/** `src` values of the <img> tags in document order. A single linear pass; never executes or builds a DOM. */
function imgSources(html: string): string[] {
  const out: string[] = [];
  const n = html.length;
  let i = 0;
  while (i < n) {
    const lt = html.indexOf("<", i);
    if (lt === -1 || lt + 1 >= n) break;
    i = lt + 1;
    if (html.startsWith("!--", i)) {
      const end = html.indexOf("-->", i + 3);
      if (end === -1) break;
      i = end + 3;
      continue;
    }
    // Tag name.
    let j = i;
    while (j < n && /[A-Za-z0-9]/.test(html[j]!)) j++;
    if (j === i) continue; // "<" followed by something that is not a tag name
    const name = html.slice(i, j);
    if (RAW_TEXT.test(name)) {
      const close = new RegExp(`</${name}[\\s/>]`, "ig");
      close.lastIndex = j;
      const m = close.exec(html);
      if (!m) break;
      i = m.index + m[0].length;
      continue;
    }
    const isImg = name.toLowerCase() === "img";
    // Attributes, up to the closing ">" (quotes respected).
    let src: string | null = null;
    let k = j;
    let closed = false;
    while (k < n) {
      const c = html.charCodeAt(k);
      if (c === 62) {
        closed = true;
        k++;
        break;
      }
      if (isSpace(c) || c === 47) {
        k++;
        continue;
      }
      let ns = k;
      while (k < n && !isSpace(html.charCodeAt(k)) && html[k] !== "=" && html[k] !== ">" && html[k] !== "/") k++;
      const attr = html.slice(ns, k).toLowerCase();
      if (k === ns) k++; // a stray "=" or similar: move on so the loop always advances
      while (k < n && isSpace(html.charCodeAt(k))) k++;
      let value = "";
      if (html[k] === "=") {
        k++;
        while (k < n && isSpace(html.charCodeAt(k))) k++;
        const q = html[k];
        if (q === '"' || q === "'") {
          const end = html.indexOf(q, k + 1);
          if (end === -1) {
            k = n;
            break;
          }
          value = html.slice(k + 1, end);
          k = end + 1;
        } else {
          ns = k;
          while (k < n && !isSpace(html.charCodeAt(k)) && html[k] !== ">") k++;
          value = html.slice(ns, k);
        }
      }
      if (isImg && attr === "src" && src === null) src = value;
    }
    i = k;
    if (closed && isImg && src !== null) out.push(src);
  }
  return out;
}

function imageUrl(src: string, base: string | null): string | null {
  const s = decodeEntities(src).trim();
  if (s === "") return null;
  if (/^https?:\/\//i.test(s)) return sanitizeSourceUrl(s);
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return null; // data:, blob:, javascript:, file: ...
  if (!base) return null;
  try {
    return sanitizeSourceUrl(new URL(s, base).href);
  } catch {
    return null;
  }
}

function stamp(now: Date | undefined): string | null {
  const d = now ?? new Date();
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/**
 * What the clipboard, a drag or a share says about where a picture came from. Pure; the result is only ever a validated
 * http(s) link and a capture date, never markup, and a credit or licence is never guessed.
 *
 * Source link, first match wins: the page `url` the caller supplies, the `SourceURL:` header some browsers put in
 * clipboard HTML, a line of `text` that is just a link (a pasted link or a uri-list), the first absolute http(s)
 * `<img src>` in `html` (relative ones resolve against `url`; data:, blob: and javascript: sources are ignored).
 * Returns `{}` when no usable link is found.
 */
export function extractProvenance(input: ProvenanceInput): Partial<Provenance> {
  const base = sanitizeSourceUrl(input.url);
  const html = typeof input.html === "string" ? input.html.slice(0, MAX_HTML) : "";
  let source: string | null = base;

  if (!source && html) {
    const header = /^SourceURL:(\S+)/im.exec(html.slice(0, 4000));
    if (header) source = sanitizeSourceUrl(header[1]);
  }
  if (!source && typeof input.text === "string") {
    const lines = input.text.slice(0, MAX_TEXT).split(/\r?\n/, MAX_LINES);
    for (const line of lines) {
      const t = line.trim();
      if (t === "" || t.startsWith("#")) continue;
      source = sanitizeSourceUrl(t);
      if (source) break;
    }
  }
  if (!source && html) {
    for (const src of imgSources(html)) {
      source = imageUrl(src, base);
      if (source) break;
    }
  }
  if (!source) return {};
  return { sourceUrl: source, capturedAt: stamp(input.now) };
}
