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

/** The video id of a YouTube link (watch, youtu.be, /shorts/, /embed/, /live/). Null for channels, playlists, etc. */
export function youtubeId(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^(www|m|music)\./, "");
  const parts = u.pathname.split("/").filter(Boolean);
  let id: string | null | undefined;
  if (host === "youtu.be") id = parts[0];
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (parts[0] === "watch") id = u.searchParams.get("v");
    else if (parts[0] === "shorts" || parts[0] === "embed" || parts[0] === "live") id = parts[1];
  }
  return id && /^[A-Za-z0-9_-]{6,20}$/.test(id) ? id : null;
}

/** Tracking parameters make the same reel look like two different links. */
export function cleanUrl(url: string): string {
  try {
    const u = new URL(url);
    // One YouTube video, one link: youtu.be, /shorts/ and watch?v= with a playlist all save the same thing.
    const yt = youtubeId(url);
    if (yt) {
      const short = /\/shorts\//.test(u.pathname);
      const t = u.searchParams.get("t");
      return short ? `https://www.youtube.com/shorts/${yt}` : `https://www.youtube.com/watch?v=${yt}${t && /^\d+s?$/.test(t) ? `&t=${t}` : ""}`;
    }
    for (const key of [...u.searchParams.keys()]) {
      if (/^(utm_|igsh|igshid|si$|_r$|_t$|is_from_webapp|sender_device|share_|fbclid$|gclid$|mc_cid$|mc_eid$|ref_src$)/i.test(key)) u.searchParams.delete(key);
    }
    u.hash = "";
    return u.toString();
  } catch {
    return url;
  }
}

// The embed address of a save is written by the worker (saves.embed_url, checked by the
// database); see lib/playback.ts. Nothing here builds one.

/** What to call a save's source in a sentence ("an article" rather than "Web"). */
export function sourceNoun(platform: Platform): string {
  if (platform === "web") return "article";
  if (platform === "screenshot") return "screenshot";
  if (platform === "youtube") return "video";
  return "reel";
}

export const PLATFORM_LABEL: Record<Platform, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  web: "Web",
  screenshot: "Screenshot",
};

/** A link worth sharing or opening: screenshots ("screenshot:<id>.jpg") have none. */
export function publicUrl(sourceUrl: string): string | undefined {
  return /^https?:\/\//i.test(sourceUrl) ? sourceUrl : undefined;
}
