import type { EmbedProvider } from "../model/types";
import { MAX_URL_LENGTH, parseHttpUrl } from "./url";

/** The only origins an iframe on a board may load from (also the CSP `frame-src`). */
export const EMBED_ORIGINS = ["https://www.youtube-nocookie.com", "https://player.vimeo.com", "https://www.figma.com"] as const;

export type Embed = { provider: EmbedProvider; embedUrl: string; /** width / height */ aspect: number };

const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"]);
const VIMEO_HOSTS = new Set(["vimeo.com", "www.vimeo.com", "player.vimeo.com"]);
const FIGMA_HOSTS = new Set(["figma.com", "www.figma.com"]);

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^[0-9]{1,12}$/;
const VIMEO_HASH = /^[0-9a-f]{6,32}$/;
const FIGMA_KEY = /^[A-Za-z0-9]{4,64}$/;
const FIGMA_KINDS = new Set(["file", "design", "proto", "board", "slides", "make"]);

/** Seconds from `90`, `90s` or `1h2m3s`; null for anything else (and for absurd values). */
function parseStart(v: string | null): number | null {
  if (!v) return null;
  let n: number | null = null;
  if (/^\d{1,6}s?$/.test(v)) n = parseInt(v, 10);
  else {
    const m = /^(?:(\d{1,3})h)?(?:(\d{1,4})m)?(?:(\d{1,6})s)?$/.exec(v);
    if (m && (m[1] || m[2] || m[3])) n = (Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0)) * 60 + Number(m[3] ?? 0);
  }
  return n !== null && n > 0 && n <= 360_000 ? n : null;
}

function youtube(u: URL): Embed | null {
  const parts = u.pathname.split("/").filter(Boolean);
  let id: string | undefined;
  let shorts = false;
  if (u.hostname === "youtu.be") id = parts[0];
  else if (u.pathname === "/watch" || u.pathname === "/watch/") id = u.searchParams.get("v") ?? undefined;
  else if (parts[0] === "shorts") {
    id = parts[1];
    shorts = true;
  } else if (parts[0] === "embed") id = parts[1];
  if (!id || !YOUTUBE_ID.test(id)) return null;
  const start = parseStart(u.searchParams.get("t") ?? u.searchParams.get("start"));
  return {
    provider: "youtube",
    embedUrl: `https://www.youtube-nocookie.com/embed/${id}${start ? `?start=${start}` : ""}`,
    aspect: shorts ? 9 / 16 : 16 / 9,
  };
}

function vimeo(u: URL): Embed | null {
  const p = u.pathname.split("/").filter(Boolean);
  let id: string | undefined;
  let hash: string | undefined;
  if (u.hostname === "player.vimeo.com") {
    if (p[0] === "video") id = p[1];
    hash = u.searchParams.get("h") ?? undefined;
  } else if (p[0] === "channels" && p.length >= 3) id = p[2];
  else if (p[0] === "groups" && p[2] === "videos") id = p[3];
  else if ((p[0] === "album" || p[0] === "showcase") && p[2] === "video") id = p[3];
  else {
    id = p[0];
    if (p.length >= 2) {
      hash = p[1];
      if (p.length > 2) return null;
    }
  }
  if (!id || !VIMEO_ID.test(id)) return null;
  if (hash !== undefined && !VIMEO_HASH.test(hash)) return null;
  return { provider: "vimeo", embedUrl: `https://player.vimeo.com/video/${id}${hash ? `?h=${hash}` : ""}`, aspect: 16 / 9 };
}

function figma(u: URL): Embed | null {
  const p = u.pathname.split("/").filter(Boolean);
  if (p.length < 2 || !FIGMA_KINDS.has(p[0]) || !FIGMA_KEY.test(p[1])) return null;
  // Rebuilt from the parsed parts: always https on www.figma.com, no credentials, no fragment.
  const original = `https://www.figma.com${u.pathname}${u.search}`;
  return { provider: "figma", embedUrl: `https://www.figma.com/embed?embed_host=atelier&url=${encodeURIComponent(original)}`, aspect: 16 / 9 };
}

/**
 * The embed for a pasted address, or null. The iframe URL is derived here from validated IDs; nothing from the pasted
 * URL (other than those IDs, an optional start time and, for Figma, the original path) reaches it. Hosts must match
 * exactly (no lookalikes such as `youtube.com.evil.io`, no trailing dot, no port, no credentials).
 */
export function toEmbed(raw: string): Embed | null {
  const u = parseHttpUrl(raw);
  if (!u || u.port !== "") return null;
  if (YOUTUBE_HOSTS.has(u.hostname)) return youtube(u);
  if (VIMEO_HOSTS.has(u.hostname)) return vimeo(u);
  if (FIGMA_HOSTS.has(u.hostname)) return figma(u);
  return null;
}

/**
 * Whether `u` may be loaded in an iframe: https, no credentials, an origin from EMBED_ORIGINS and the provider's embed
 * path. Checked when an embed is validated and again by EmbedView right before it creates an iframe.
 */
export function isAllowedEmbedUrl(u: string): boolean {
  if (typeof u !== "string" || u.length === 0 || u.length > MAX_URL_LENGTH) return false;
  let url: URL;
  try {
    url = new URL(u);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "") return false;
  if (!(EMBED_ORIGINS as readonly string[]).includes(url.origin)) return false;
  switch (url.origin) {
    case "https://www.youtube-nocookie.com":
      return url.pathname.startsWith("/embed/");
    case "https://player.vimeo.com":
      return url.pathname.startsWith("/video/");
    default:
      return url.pathname === "/embed";
  }
}
