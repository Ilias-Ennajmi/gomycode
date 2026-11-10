/*
 * Readers for the official data exports (no network, no DOM: unit-tested).
 *
 *   Instagram: Settings → Your activity → Download your information →
 *              your_instagram_activity/saved/saved_posts.json (or .html)
 *   TikTok:    Settings → Account → Download your data →
 *              user_data.json / user_data_tiktok.json ("Favorite Videos"),
 *              or "Favorite Videos.txt" in the TXT export
 *
 * Both companies change these files every year or so, so the readers walk the
 * whole structure looking for post links instead of trusting one exact shape.
 */

import { cleanUrl, youtubeId } from "@/lib/links";

export type ImportSource = "instagram" | "tiktok";
/** "links": any list of links (YouTube, articles, …) from a pasted text or a text / CSV / bookmarks file. */
export type ImportKind = ImportSource | "links";
export type ImportedLink = { url: string; savedAt: string | null; key: string };

const IG_POST = /^https?:\/\/(?:www\.|m\.)?instagram\.com\/(?:[A-Za-z0-9_.]+\/)?(p|reels?|tv)\/([A-Za-z0-9_-]{5,})/i;
const TT_VIDEO = /^https?:\/\/(?:[a-z]+\.)?(?:tiktok|tiktokv)\.com\/(?:@[\w.-]*\/video|share\/video|v|video)\/(\d{8,})/i;
const TT_SHORT = /^https?:\/\/(?:vm|vt)\.tiktok\.com\/[A-Za-z0-9]+\/?/i;
const URL_IN_TEXT = /https?:\/\/[^\s"'<>]+/gi;

/** Same post, same key, whatever form the link takes (reel vs p, tracking params, short links aside). */
export function dedupeKey(url: string): string {
  const ig = url.match(IG_POST);
  if (ig) return `ig:${ig[2]}`;
  const tt = url.match(TT_VIDEO);
  if (tt) return `tt:${tt[1]}`;
  const yt = youtubeId(url);
  if (yt) return `yt:${yt}`;
  try {
    const u = new URL(url);
    u.hash = "";
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|igsh|igshid|si$|_r$|_t$|is_from_webapp|sender_device|share_)/i.test(k)) u.searchParams.delete(k);
    return `url:${u.host.replace(/^www\./, "")}${u.pathname.replace(/\/$/, "")}${u.search}`.toLowerCase();
  } catch {
    return `url:${url.trim().toLowerCase()}`;
  }
}

export function normalizeInstagram(url: string): string | null {
  const m = url.trim().match(IG_POST);
  if (!m) return null;
  const kind = m[1].toLowerCase().startsWith("reel") ? "reel" : m[1].toLowerCase();
  return `https://www.instagram.com/${kind}/${m[2]}/`;
}

/** Canonical web link for a TikTok video, the form the player and the downloader both understand. */
export function normalizeTikTok(url: string): string | null {
  const u = url.trim();
  const m = u.match(TT_VIDEO);
  if (m) return `https://www.tiktok.com/@/video/${m[1]}`;
  const s = u.match(TT_SHORT);
  if (s) return s[0].endsWith("/") ? s[0] : `${s[0]}/`;
  return null;
}

/** Seconds, milliseconds or "2023-01-15 10:22:33" (UTC) → ISO string. */
export function toIso(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) {
    const ms = v > 1e12 ? v : v * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof v === "string" && v.trim()) {
    const s = v.trim();
    if (/^\d+$/.test(s)) return toIso(Number(s));
    const d = new Date(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(s) ? `${s.replace(" ", "T")}Z` : s);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

function unique(links: ImportedLink[]): ImportedLink[] {
  const seen = new Map<string, ImportedLink>();
  for (const l of links) {
    const prev = seen.get(l.key);
    // Keep the earliest date we saw for a post.
    if (!prev || (l.savedAt && (!prev.savedAt || l.savedAt < prev.savedAt))) seen.set(l.key, l);
  }
  return [...seen.values()];
}

const TS_KEYS = ["timestamp", "Timestamp", "saved_on", "date", "Date", "creation_timestamp"];

function ownTimestamp(obj: Record<string, unknown>): string | null {
  for (const k of TS_KEYS) {
    const iso = toIso(obj[k]);
    if (iso) return iso;
  }
  return null;
}

/**
 * Instagram saved_posts.json, any vintage:
 *   {"saved_saved_media":[{"title":"user","string_map_data":{"Saved on":{"href":…,"timestamp":…}}}]}
 *   {"saved_saved_media":[{"string_list_data":[{"href":…,"timestamp":…}]}]}
 *   [{"timestamp":…,"label_values":[{"label":"URL","value":…}]}]
 */
export function parseInstagramJson(data: unknown): ImportedLink[] {
  const out: ImportedLink[] = [];
  const walk = (node: unknown, ts: string | null, depth: number) => {
    if (depth > 12 || node === null || node === undefined) return;
    if (typeof node === "string") {
      const url = normalizeInstagram(node);
      if (url) out.push({ url, savedAt: ts, key: dedupeKey(url) });
      return;
    }
    if (Array.isArray(node)) {
      for (const child of node) walk(child, ts, depth + 1);
      return;
    }
    if (typeof node === "object") {
      const obj = node as Record<string, unknown>;
      const here = ownTimestamp(obj) ?? ts;
      for (const v of Object.values(obj)) walk(v, here, depth + 1);
    }
  };
  walk(data, null, 0);
  return unique(out);
}

/** Instagram's HTML export: every post link in the page. */
export function parseInstagramHtml(html: string): ImportedLink[] {
  const out: ImportedLink[] = [];
  for (const raw of html.match(URL_IN_TEXT) ?? []) {
    const url = normalizeInstagram(raw.replace(/&amp;/g, "&"));
    if (url) out.push({ url, savedAt: null, key: dedupeKey(url) });
  }
  return unique(out);
}

const squash = (k: string) => k.toLowerCase().replace(/[\s_-]/g, "");

/**
 * TikTok user_data.json: {"Activity":{"Favorite Videos":{"FavoriteVideoList":[{"Date":…,"Link":…}]}}}
 * (newer files: "Likes and Favorites", lower-case "date"/"link"). Only favourites are read,
 * never liked or watched videos.
 */
export function parseTikTokJson(data: unknown): ImportedLink[] {
  const out: ImportedLink[] = [];
  const lists: unknown[] = [];
  const find = (node: unknown, depth: number) => {
    if (depth > 10 || !node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const c of node) find(c, depth + 1);
      return;
    }
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      const key = squash(k);
      if ((key === "favoritevideolist" || key === "favouritevideolist") && Array.isArray(v)) lists.push(v);
      else if (key === "favoritevideos" || key === "favouritevideos") {
        if (Array.isArray(v)) lists.push(v);
        else find(v, depth + 1);
      } else find(v, depth + 1);
    }
  };
  find(data, 0);
  for (const list of lists) {
    for (const item of list as unknown[]) {
      if (!item || typeof item !== "object") continue;
      const entries = Object.entries(item as Record<string, unknown>);
      const link = entries.find(([k]) => /^(link|url|videolink)$/.test(squash(k)))?.[1];
      const date = entries.find(([k]) => /^(date|time|timestamp|favoriteddate)$/.test(squash(k)))?.[1];
      const url = typeof link === "string" ? normalizeTikTok(link) : null;
      if (url) out.push({ url, savedAt: toIso(date), key: dedupeKey(url) });
    }
  }
  return unique(out);
}

/** TikTok TXT export ("Favorite Videos.txt"): "Date: 2023-01-15 10:22:33\nLink: https://…". */
export function parseTikTokText(text: string): ImportedLink[] {
  const out: ImportedLink[] = [];
  let date: string | null = null;
  for (const line of text.split(/\r?\n/)) {
    const d = line.match(/^\s*date\s*:\s*(.+)$/i);
    if (d) {
      date = toIso(d[1]);
      continue;
    }
    for (const raw of line.match(URL_IN_TEXT) ?? []) {
      const url = normalizeTikTok(raw);
      if (url) out.push({ url, savedAt: date, key: dedupeKey(url) });
    }
  }
  return unique(out);
}

// A YouTube Takeout playlist CSV lists bare video ids ("dQw4w9WgXcQ,2024-01-05T10:00:00+00:00").
const YT_CSV_ROW = /^\s*([A-Za-z0-9_-]{11})\s*,\s*(\d{4}-\d{2}-\d{2}[T ][^,\s]*)?/;
const MAX_LINKS = 2000;

/**
 * Any list of links: a pasted text, a .txt / .csv file, exported bookmarks (HTML), a
 * YouTube Takeout playlist. Instagram, TikTok and YouTube links are tidied to their
 * canonical form; everything else is kept as an article link.
 */
export function parseLinkList(text: string): ImportedLink[] {
  const out: ImportedLink[] = [];
  const seen = new Set<string>();
  const add = (raw: string, savedAt: string | null = null) => {
    if (out.length >= MAX_LINKS) return;
    const trimmed = raw.replace(/&amp;/g, "&").replace(/[),.;!?\]]+$/, "");
    let url: string;
    try {
      url = new URL(trimmed).toString();
    } catch {
      return;
    }
    url = normalizeInstagram(url) ?? normalizeTikTok(url) ?? cleanUrl(url);
    const key = dedupeKey(url);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ url, savedAt, key });
  };
  for (const line of text.split(/\r?\n/)) {
    const found = line.match(URL_IN_TEXT);
    if (found) {
      for (const u of found) add(u);
      continue;
    }
    const row = line.match(YT_CSV_ROW);
    if (row) add(`https://www.youtube.com/watch?v=${row[1]}`, row[2] ? toIso(row[2]) : null);
  }
  return out;
}

/** Files inside an export ZIP that hold saved/favourite links. */
export function isWantedEntry(name: string, source: ImportSource): boolean {
  const n = name.toLowerCase();
  if (n.startsWith("__macosx/")) return false;
  if (source === "instagram") return /(^|\/)saved_posts\.(json|html)$/.test(n);
  return /(^|\/)user_data(_tiktok)?\.json$/.test(n) || /(^|\/)favou?rite ?videos?\.txt$/.test(n);
}

/** Reads one file (from the ZIP or picked directly) into links. */
export function parseExportFile(name: string, text: string, source: ImportSource): ImportedLink[] {
  const lower = name.toLowerCase();
  if (lower.endsWith(".json")) {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return [];
    }
    return source === "instagram" ? parseInstagramJson(data) : parseTikTokJson(data);
  }
  if (source === "instagram") return parseInstagramHtml(text);
  return parseTikTokText(text);
}

/** Links not already saved (by post id), in the order found. */
export function newLinks(links: ImportedLink[], existingUrls: Iterable<string>): ImportedLink[] {
  const have = new Set<string>();
  for (const u of existingUrls) have.add(dedupeKey(u));
  return links.filter((l) => !have.has(l.key));
}
