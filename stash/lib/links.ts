import type { Enums } from "@/lib/supabase/types";

export type Platform = Enums<"platform">;

const URL_RE = /https?:\/\/[^\s<>"']+/i;

/** The first http(s) link in what another app shared (Instagram puts it in `text`). */
export function extractUrl(...candidates: Array<string | null | undefined>): string | null {
  for (const c of candidates) {
    if (!c) continue;
    const match = c.match(URL_RE);
    if (match) {
      // Trailing punctuation from a sentence isn't part of the link.
      const url = match[0].replace(/[),.;!?]+$/, "");
      try {
        return new URL(url).toString();
      } catch {
        // keep looking
      }
    }
  }
  return null;
}

export function detectPlatform(url: string): Platform {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return "web";
  }
  if (host.endsWith("instagram.com") || host === "instagr.am") return "instagram";
  if (host.endsWith("tiktok.com")) return "tiktok";
  if (host.endsWith("youtube.com") || host === "youtu.be") return "youtube";
  return "web";
}

/** Tracking parameters make the same reel look like two different links. */
export function cleanUrl(url: string): string {
  try {
    const u = new URL(url);
    for (const key of [...u.searchParams.keys()]) {
      if (/^(utm_|igsh|igshid|si$|_r$|_t$|is_from_webapp|sender_device|share_)/i.test(key)) u.searchParams.delete(key);
    }
    u.hash = "";
    return u.toString();
  } catch {
    return url;
  }
}

/** The platform's own embeddable player: the fallback when there's no stored copy. */
export function embedUrl(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  const parts = u.pathname.split("/").filter(Boolean);

  if (host.endsWith("instagram.com")) {
    const i = parts.findIndex((p) => p === "reel" || p === "p" || p === "tv" || p === "reels");
    const code = i >= 0 ? parts[i + 1] : undefined;
    return code ? `https://www.instagram.com/p/${code}/embed/` : null;
  }
  if (host.endsWith("tiktok.com")) {
    const i = parts.indexOf("video");
    const id = i >= 0 ? parts[i + 1] : undefined;
    return id && /^\d+$/.test(id) ? `https://www.tiktok.com/player/v1/${id}?autoplay=1&loop=1&rel=0` : null;
  }
  if (host === "youtu.be") {
    return parts[0] ? `https://www.youtube.com/embed/${parts[0]}?playsinline=1&autoplay=1` : null;
  }
  if (host.endsWith("youtube.com")) {
    const id = parts[0] === "shorts" || parts[0] === "embed" ? parts[1] : u.searchParams.get("v");
    return id ? `https://www.youtube.com/embed/${id}?playsinline=1&autoplay=1` : null;
  }
  return null;
}

export const PLATFORM_LABEL: Record<Platform, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  web: "Web",
  screenshot: "Screenshot",
};
