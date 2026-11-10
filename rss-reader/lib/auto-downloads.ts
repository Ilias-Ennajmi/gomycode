"use client";

import * as React from "react";
import { usePref } from "@/lib/prefs";
import { episodeOf, type Episode } from "@/components/audio/AudioProvider";
import { downloadEpisode, useDownloads, type Download } from "@/lib/downloads";
import type { ArticleSummary } from "@/lib/types";

// New episodes of the shows you pick, downloaded by themselves when the app is open on a
// connection that isn't metered (Wi-Fi, ethernet), up to a storage limit. A web app can't
// run in the background, so this happens when Reader is opened (or comes back online) and
// at most every 30 minutes; each download then goes through lib/downloads.ts like a manual
// one, and finished ones remove themselves once listened to. Per device: nothing here syncs.

export interface AutoDownloadPrefs {
  /** Feed ids of the shows to keep fresh. */
  shows: string[];
  /** Storage the downloads may use, in megabytes. */
  limitMB: number;
}

export const AUTO_DEFAULTS: AutoDownloadPrefs = { shows: [], limitMB: 1000 };
export const LIMITS_MB = [500, 1000, 2000, 5000] as const;
/** The newest episodes of a show kept ready. */
export const PER_SHOW = 2;
const EVERY_MS = 30 * 60 * 1000;
const RAN_KEY = "auto-download-ran";
const FAILED_KEY = "auto-download-failed";
// About 128 kbit/s, for judging whether an episode fits before it's downloaded.
const BYTES_PER_SECOND = 16_000;

/** Which episodes to download now. Pure, for tests. */
export function pickAutoDownloads({
  episodes,
  downloaded,
  shows,
  limitBytes,
  failed = [],
  perShow = PER_SHOW,
}: {
  episodes: ArticleSummary[];
  downloaded: Record<string, Download>;
  shows: string[];
  limitBytes: number;
  failed?: string[];
  perShow?: number;
}): Episode[] {
  let used = Object.values(downloaded).reduce((sum, d) => sum + d.bytes, 0);
  const picked: Episode[] = [];
  const rank = new Map<string, number>();
  const newest = [...episodes].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
  for (const article of newest) {
    if (!shows.includes(article.feedId) || article.isRead) continue;
    // Each show's newest few unread episodes are the ones to have.
    const place = rank.get(article.feedId) ?? 0;
    rank.set(article.feedId, place + 1);
    if (place >= perShow || downloaded[article.id] || failed.includes(article.id)) continue;
    const episode = episodeOf(article);
    if (!episode) continue;
    const size = (article.durationSeconds ?? 45 * 60) * BYTES_PER_SECOND;
    if (used + size > limitBytes) continue;
    used += size;
    picked.push(episode);
  }
  return picked;
}

/** True on a connection that isn't metered or slow, as far as the browser says. */
export function connectionAllowsDownloads() {
  const c = (
    navigator as Navigator & {
      connection?: { type?: string; saveData?: boolean; effectiveType?: string };
    }
  ).connection;
  if (!c) return true;
  if (c.saveData || c.type === "cellular") return false;
  return !/^(slow-2g|2g|3g)$/.test(c.effectiveType ?? "");
}

function readList(key: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "[]") as string[];
  } catch {
    return [];
  }
}

/** Mounted once (AppShell): keeps the chosen shows' newest episodes on the device. */
export function useAutoDownloads() {
  const [prefs] = usePref<AutoDownloadPrefs>("auto-download", AUTO_DEFAULTS);
  const { byId } = useDownloads();
  const downloaded = React.useRef(byId);
  downloaded.current = byId;
  const running = React.useRef(false);

  const run = React.useCallback(async () => {
    if (running.current || prefs.shows.length === 0) return;
    if (!navigator.onLine || !navigator.serviceWorker?.controller) return;
    if (!connectionAllowsDownloads()) return;
    const last = Number(localStorage.getItem(RAN_KEY) ?? 0);
    if (Date.now() - last < EVERY_MS) return;
    running.current = true;
    localStorage.setItem(RAN_KEY, String(Date.now()));
    try {
      const res = await fetch("/api/articles?source=podcast&unread=true&sort=newest&limit=80");
      if (!res.ok) return;
      const { articles } = (await res.json()) as { articles: ArticleSummary[] };
      const todo = pickAutoDownloads({
        episodes: articles,
        downloaded: downloaded.current,
        shows: prefs.shows,
        limitBytes: prefs.limitMB * 1024 * 1024,
        failed: readList(FAILED_KEY),
      });
      for (const episode of todo) {
        if (!connectionAllowsDownloads()) break;
        try {
          await downloadEpisode(episode);
        } catch {
          // A show whose server refuses (no CORS) isn't tried again and again.
          localStorage.setItem(
            FAILED_KEY,
            JSON.stringify([...readList(FAILED_KEY), episode.id].slice(-200))
          );
        }
      }
    } finally {
      running.current = false;
    }
  }, [prefs]);

  React.useEffect(() => {
    // Let the app settle first: this isn't what you opened it for.
    const timer = setTimeout(() => void run(), 8000);
    const again = () => void run();
    window.addEventListener("online", again);
    document.addEventListener("visibilitychange", again);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("online", again);
      document.removeEventListener("visibilitychange", again);
    };
  }, [run]);
}
