import type { Enums } from "@/lib/supabase/types";
import { PLATFORM_LABEL, type Platform } from "@/lib/links";

/*
 * How a save plays (contract 0007 §7). The worker decides and writes `playback`,
 * `video_state` and `embed_url`; this file only reads them. Pure, so it is unit-tested.
 */

export type PlaybackMode = "file" | "embed" | "link" | "image" | "article";

export type PlaybackInput = {
  platform: Platform;
  playback?: Enums<"playback"> | null;
  videoState?: Enums<"video_state"> | null;
  videoPath?: string | null;
  embedUrl?: string | null;
};

// The same three official players the database accepts (saves_embed_url_check).
const EMBED_RE =
  /^https:\/\/(www\.tiktok\.com\/player\/v1\/[0-9]{5,25}|www\.instagram\.com\/(p|reel|tv)\/[A-Za-z0-9_-]{5,40}\/embed|www\.youtube-nocookie\.com\/embed\/[A-Za-z0-9_-]{6,20})$/;

/** The stored embed URL if it is one of the three official players, else null. */
export function safeEmbedUrl(url: string | null | undefined): string | null {
  return typeof url === "string" && url.length <= 300 && EMBED_RE.test(url) ? url : null;
}

export type EmbedKind = "tiktok" | "instagram" | "youtube";

export function embedKind(url: string): EmbedKind {
  if (url.startsWith("https://www.tiktok.com/")) return "tiktok";
  if (url.startsWith("https://www.instagram.com/")) return "instagram";
  return "youtube";
}

/** The iframe address: the checked URL plus the player options each platform documents. */
export function embedSrc(url: string, opts: { autoplay?: boolean } = {}): string {
  const auto = opts.autoplay ? "1" : "0";
  switch (embedKind(url)) {
    case "tiktok":
      return `${url}?autoplay=${auto}&loop=1&rel=0&music_info=0&description=0`;
    case "youtube":
      return `${url}?playsinline=1&rel=0&autoplay=${auto}`;
    default:
      return url; // Instagram's embed takes no options
  }
}

/**
 * Shape of the embed's frame. TikTok and Reels are portrait; a YouTube video is
 * landscape unless the saved link is a Short; an Instagram post is a tall card.
 */
export function embedAspect(url: string, sourceUrl?: string | null): "portrait" | "landscape" | "card" {
  const kind = embedKind(url);
  if (kind === "tiktok") return "portrait";
  if (kind === "instagram") return /\/reel\//.test(url) ? "portrait" : "card";
  return sourceUrl && /\/shorts\//.test(sourceUrl) ? "portrait" : "landscape";
}

/** What the player shows for a save. Never a dead end: file → embed → link. */
export function playbackMode(s: PlaybackInput): { mode: PlaybackMode; embedUrl: string | null } {
  if (s.platform === "screenshot") return { mode: "image", embedUrl: null };
  const embed = safeEmbedUrl(s.embedUrl);
  const stored = Boolean(s.videoPath) && (s.videoState ?? "stored") === "stored";
  if (stored && (s.playback ?? "video") === "video") return { mode: "file", embedUrl: embed };
  if (s.platform === "web") return { mode: "article", embedUrl: null };
  if (embed && s.playback !== "link" && s.playback !== "none") return { mode: "embed", embedUrl: embed };
  return { mode: "link", embedUrl: embed };
}

/** Where a failed file playback falls back to. */
export function fallbackMode(s: PlaybackInput): PlaybackMode {
  if (s.platform === "screenshot") return "image";
  if (s.platform === "web") return "article";
  return safeEmbedUrl(s.embedUrl) ? "embed" : "link";
}

/** One quiet line on why there is no in-app copy. Null when there is nothing to explain. */
export function videoNote(videoState: Enums<"video_state"> | null | undefined, platform: Platform): string | null {
  const from = PLATFORM_LABEL[platform];
  switch (videoState) {
    case "evicted":
      return `The saved copy was cleared to make room. It plays from ${from}.`;
    case "blocked":
      return `${from} didn't allow a saved copy. It plays from ${from}.`;
    case "too_big":
      return `Too long to keep a copy. It plays from ${from}.`;
    default:
      return null;
  }
}

export function openInLabel(platform: Platform): string {
  if (platform === "web") return "Open the article";
  if (platform === "screenshot") return "Open";
  return `Open in ${PLATFORM_LABEL[platform]}`;
}

// --- Live progress -------------------------------------------------------------------

export type ProcessStep = Enums<"process_step">;

/** The steps a person sees, in order (queued and ready are the ends). */
export const PROCESS_STEPS = ["fetching", "watching", "reading", "filing"] as const;

export const PROCESS_LABEL: Record<ProcessStep, string> = {
  queued: "Waiting",
  fetching: "Fetching",
  watching: "Watching",
  reading: "Reading",
  filing: "Filing",
  ready: "Ready",
};

/** 0 while waiting, 1–4 for the visible steps, 5 when done. */
export function processIndex(step: ProcessStep | null | undefined): number {
  if (!step || step === "queued") return 0;
  if (step === "ready") return PROCESS_STEPS.length + 1;
  return PROCESS_STEPS.indexOf(step) + 1;
}

/** The label for a save that is still processing. Articles and screenshots are read, not watched. */
export function processLabel(step: ProcessStep | null | undefined, platform?: Platform): string {
  if (step === "watching" && (platform === "web" || platform === "screenshot")) return "Reading";
  return PROCESS_LABEL[step ?? "queued"];
}

// --- AI state --------------------------------------------------------------------------

export type AiNote = { text: string; link?: { href: string; label: string }; retry?: boolean };

/** What a ready save without a summary says, calmly. Null when the summary exists or is on its way. */
export function aiNote(aiState: Enums<"ai_state"> | null | undefined): AiNote | null {
  switch (aiState) {
    case "no_key":
      return { text: "Summaries turn on once an AI key is added.", link: { href: "/settings#setup", label: "See Setup" } };
    case "not_owner":
      return { text: "Summaries are on for the owner's phones only.", link: { href: "/settings#setup", label: "See Setup" } };
    case "over_budget":
      return { text: "This month's AI budget is used up. Summaries start again next month." };
    case "failed":
      return { text: "The summary didn't work this time.", retry: true };
    default:
      return null;
  }
}
