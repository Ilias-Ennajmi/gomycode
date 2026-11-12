/**
 * Hand-written Open Graph reader for link cards. It never executes, renders or fetches anything: it scans the first
 * 200 KB of the markup once, linearly, and returns PLAIN TEXT fields plus two http(s) URL strings. Anything hostile in the
 * page (script in the title, javascript: image URLs, a megabyte of description) comes out inert and length-capped.
 */

export interface LinkPreview {
  title: string;
  description: string;
  siteName: string;
  imageUrl: string | null;
  faviconUrl: string | null;
  finalUrl: string;
}

const SCAN_LIMIT = 200 * 1024;
const MAX_TITLE = 200;
const MAX_DESCRIPTION = 400;
const MAX_SITE_NAME = 100;
const MAX_URL = 2048;
const MAX_VALUES_PER_KEY = 5;
const MAX_TAGS = 4000;

// ---------------------------------------------------------------------------------------------------------------------
// Text cleaning

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", copy: "©", reg: "®", trade: "™",
  hellip: "…", mdash: "—", ndash: "–", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
  laquo: "«", raquo: "»", middot: "·", bull: "•", euro: "€", pound: "£", yen: "¥",
  cent: "¢", sect: "§", deg: "°", times: "×", eacute: "é", egrave: "è", agrave: "à",
  uuml: "ü", ouml: "ö", auml: "ä", szlig: "ß", ccedil: "ç", ntilde: "ñ",
};

/** One pass, so "&amp;lt;" becomes "&lt;" and never "<". Unknown or malformed references stay as written. */
function decodeEntities(s: string): string {
  return s.replace(/&(#[xX][0-9a-fA-F]{1,8}|#[0-9]{1,8}|[A-Za-z][A-Za-z0-9]{1,31});/g, (whole, body: string) => {
    if (body[0] === "#") {
      const cp = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(cp) || cp === 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return "";
      return String.fromCodePoint(cp);
    }
    return Object.hasOwn(NAMED, body) ? NAMED[body] : whole;
  });
}

const asciiLower = (s: string) => s.replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32)); // keeps string length

/** Removes tags (and the contents of script/style) in one linear pass. A lone "<" that does not open a tag is kept. */
function stripMarkup(s: string): string {
  if (!s.includes("<")) return s;
  const lower = asciiLower(s);
  let out = "";
  let i = 0;
  while (i < s.length) {
    const lt = s.indexOf("<", i);
    if (lt < 0) {
      out += s.slice(i);
      break;
    }
    out += s.slice(i, lt);
    const next = s[lt + 1];
    if (next === undefined || !/[A-Za-z/!?]/.test(next)) {
      out += "<";
      i = lt + 1;
      continue;
    }
    const raw = /^<(script|style)\b/.exec(lower.slice(lt, lt + 10));
    if (raw) {
      const close = lower.indexOf(`</${raw[1]}`, lt);
      const gt = close < 0 ? -1 : s.indexOf(">", close);
      i = gt < 0 ? s.length : gt + 1;
      continue;
    }
    const gt = s.indexOf(">", lt);
    i = gt < 0 ? s.length : gt + 1; // an unterminated tag swallows the rest
  }
  return out;
}

const INVISIBLE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f­​-‏‪-‮⁠-⁤⁦-⁩﻿￹-￻]/g;
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;

function clamp(s: string, max: number): string {
  if (s.length <= max) return s;
  let out = s.slice(0, max);
  if (/[\ud800-\udbff]$/.test(out)) out = out.slice(0, -1);
  return out.trimEnd();
}

/** Plain text: tags stripped, entities decoded once, control and invisible characters removed, whitespace collapsed. */
function cleanText(raw: string, max: number): string {
  const text = decodeEntities(stripMarkup(raw.slice(0, max * 10)))
    .replace(/\s+/g, " ")
    .replace(INVISIBLE, "")
    .replace(LONE_SURROGATE, "")
    .replace(/\s+/g, " ")
    .trim();
  return clamp(text, max);
}

// ---------------------------------------------------------------------------------------------------------------------
// URLs

function toHttpUrl(raw: string, base: URL | null): string | null {
  const value = decodeEntities(raw).trim();
  if (value === "" || value.length > MAX_URL * 2) return null;
  let u: URL;
  try {
    u = base ? new URL(value, base) : new URL(value);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (u.username !== "" || u.password !== "") return null;
  return u.href.length <= MAX_URL ? u.href : null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Scanner

type Scan = { metas: Map<string, string[]>; icons: string[]; title: string | null };

const WANTED_META = new Set(["og:title", "twitter:title", "og:description", "description", "og:site_name", "og:image", "og:image:secure_url", "og:image:url", "twitter:image", "twitter:image:src"]);

function scan(src: string): Scan {
  const n = src.length;
  const lower = asciiLower(src);
  const metas = new Map<string, string[]>();
  const icons: string[] = [];
  let title: string | null = null;
  let tags = 0;
  const isSpace = (c: string) => c === " " || c === "\t" || c === "\n" || c === "\r" || c === "\f";

  let i = 0;
  while (i < n) {
    const lt = src.indexOf("<", i);
    if (lt < 0) break;
    if (src.startsWith("<!--", lt)) {
      const end = src.indexOf("-->", lt + 4);
      i = end < 0 ? n : end + 3;
      continue;
    }
    const c = src[lt + 1];
    if (c === "/" || c === "!" || c === "?") {
      const gt = src.indexOf(">", lt + 1);
      i = gt < 0 ? n : gt + 1;
      continue;
    }
    if (c === undefined || !/[A-Za-z]/.test(c)) {
      i = lt + 1;
      continue;
    }
    if (++tags > MAX_TAGS) break;

    let j = lt + 1;
    while (j < n && /[A-Za-z0-9:-]/.test(src[j])) j++;
    const name = lower.slice(lt + 1, j);

    // Attributes, one linear pass. Reaching the end of input inside a tag keeps what was read (and ends the scan).
    const attrs = new Map<string, string>();
    let k = j;
    let closed = false;
    while (k < n) {
      while (k < n && (isSpace(src[k]) || src[k] === "/")) k++;
      if (k >= n) break;
      if (src[k] === ">") {
        k++;
        closed = true;
        break;
      }
      const nameStart = k;
      while (k < n && !isSpace(src[k]) && src[k] !== "=" && src[k] !== ">" && src[k] !== "/") k++;
      const attr = lower.slice(nameStart, k);
      while (k < n && isSpace(src[k])) k++;
      let value = "";
      if (src[k] === "=") {
        k++;
        while (k < n && isSpace(src[k])) k++;
        const q = src[k];
        if (q === '"' || q === "'") {
          const end = src.indexOf(q, k + 1);
          value = src.slice(k + 1, end < 0 ? n : end);
          k = end < 0 ? n : end + 1;
        } else {
          const start = k;
          while (k < n && !isSpace(src[k]) && src[k] !== ">") k++;
          value = src.slice(start, k);
        }
      }
      if (attr !== "" && !attrs.has(attr)) attrs.set(attr, value);
    }
    i = k;

    if (name === "meta") {
      const key = (attrs.get("property") ?? attrs.get("name") ?? "").trim().toLowerCase();
      const content = attrs.get("content");
      if (WANTED_META.has(key) && content !== undefined) {
        const list = metas.get(key) ?? [];
        if (list.length < MAX_VALUES_PER_KEY) list.push(content);
        metas.set(key, list);
      }
    } else if (name === "link") {
      const rel = (attrs.get("rel") ?? "").toLowerCase().split(/\s+/);
      const href = attrs.get("href");
      if (rel.includes("icon") && href !== undefined && icons.length < MAX_VALUES_PER_KEY) icons.push(href);
    } else if (name === "script" || name === "style") {
      if (!closed) break;
      const close = lower.indexOf(`</${name}`, k);
      if (close < 0) break;
      const gt = src.indexOf(">", close);
      i = gt < 0 ? n : gt + 1;
    } else if (name === "title" && title === null && closed) {
      const close = lower.indexOf("</title", k);
      title = src.slice(k, close < 0 ? n : close);
      if (close < 0) break;
      i = close;
    }
  }
  return { metas, icons, title };
}

// ---------------------------------------------------------------------------------------------------------------------

function firstText(values: (string[] | undefined)[], max: number): string {
  for (const list of values) {
    for (const raw of list ?? []) {
      const t = cleanText(raw, max);
      if (t !== "") return t;
    }
  }
  return "";
}

export function parseOpenGraph(html: string, baseUrl: string): LinkPreview {
  let base: URL | null = null;
  try {
    base = new URL(baseUrl);
  } catch {
    base = null;
  }
  const hostname = base ? base.hostname : "";
  const { metas, icons, title } = scan(String(html).slice(0, SCAN_LIMIT));

  const pageTitle = firstText([metas.get("og:title"), metas.get("twitter:title"), title === null ? undefined : [title]], MAX_TITLE) || clamp(hostname, MAX_TITLE);
  const description = firstText([metas.get("og:description"), metas.get("description")], MAX_DESCRIPTION);
  const siteName = firstText([metas.get("og:site_name")], MAX_SITE_NAME) || clamp(hostname, MAX_SITE_NAME);

  let imageUrl: string | null = null;
  for (const key of ["og:image", "og:image:secure_url", "og:image:url", "twitter:image", "twitter:image:src"]) {
    for (const raw of metas.get(key) ?? []) {
      imageUrl = toHttpUrl(raw, base);
      if (imageUrl) break;
    }
    if (imageUrl) break;
  }

  let faviconUrl: string | null = null;
  for (const raw of icons) {
    faviconUrl = toHttpUrl(raw, base);
    if (faviconUrl) break;
  }
  if (!faviconUrl && base && (base.protocol === "http:" || base.protocol === "https:")) faviconUrl = `${base.origin}/favicon.ico`;

  return { title: pageTitle, description, siteName, imageUrl, faviconUrl, finalUrl: base ? base.href.slice(0, MAX_URL) : "" };
}

/**
 * Bytes to text: the charset from the Content-Type header, else from a <meta charset> in the first KB, else UTF-8.
 * Unknown or unsupported labels fall back to UTF-8; this never throws.
 */
export function decodeHtmlBody(bytes: Uint8Array, contentType: string): string {
  let label = /charset\s*=\s*"?([A-Za-z0-9_.:-]+)/i.exec(contentType)?.[1];
  if (!label) {
    const head = new TextDecoder("latin1").decode(bytes.subarray(0, 1024));
    label = /<meta[^>]+charset\s*=\s*["']?([A-Za-z0-9_.:-]+)/i.exec(head)?.[1];
    if (label && /^utf-?16/i.test(label)) label = undefined; // a page that is readable as ASCII here is not UTF-16
  }
  try {
    return new TextDecoder(label ?? "utf-8").decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}
