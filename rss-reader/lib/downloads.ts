"use client";

import * as React from "react";
import type { Episode } from "@/components/audio/AudioProvider";

// Episodes kept on the device for listening without a connection. The file goes in the
// Cache API under a same-origin path (/offline-audio/<id>) that the service worker serves,
// seeking included (public/sw.js); the player switches to that path when it exists.
// What's downloaded (episode details, size) is listed in localStorage for the UI.
//
// The file is fetched by the service worker (/episode-download?url=…): the page's content
// policy only lets it talk to this site. The browser can only save a file the show's server
// lets it read (CORS); most big podcast hosts do, and when one doesn't the download says so.

export const EPISODE_CACHE = "episodes-offline";
const KEY = "episode-downloads";

export interface Download {
  episode: Episode;
  bytes: number;
  at: number;
}

type Listener = () => void;
const listeners = new Set<Listener>();
const progress = new Map<string, number>();
let cachedList: Record<string, Download> | null = null;

function read(): Record<string, Download> {
  if (cachedList) return cachedList;
  try {
    cachedList = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, Download>;
  } catch {
    cachedList = {};
  }
  return cachedList;
}

function write(next: Record<string, Download>) {
  cachedList = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked: the file is still cached; the list just won't survive.
  }
  listeners.forEach((l) => l());
}

export function offlinePath(id: string) {
  return `/offline-audio/${encodeURIComponent(id)}`;
}

/** Where the player should load an episode from: the saved copy when there is one. */
export function sourceOf(episode: Pick<Episode, "id" | "audioUrl">) {
  if (typeof window === "undefined") return episode.audioUrl;
  return read()[episode.id] && navigator.serviceWorker?.controller
    ? offlinePath(episode.id)
    : episode.audioUrl;
}

export function isDownloaded(id: string) {
  return Boolean(read()[id]);
}

export class DownloadError extends Error {}

/** Saves an episode on the device, reporting progress (0–1) as it goes. */
export async function downloadEpisode(episode: Episode) {
  if (read()[episode.id] || progress.has(episode.id)) return;
  if (!("caches" in window) || !navigator.serviceWorker?.controller) {
    throw new DownloadError("Downloads need the installed app or a reload of this page.");
  }
  progress.set(episode.id, 0);
  listeners.forEach((l) => l());
  try {
    const res = await fetch(`/episode-download?url=${encodeURIComponent(episode.audioUrl)}`);
    if (res.status === 502) {
      throw new DownloadError(
        `${episode.feedTitle}'s server doesn't let browsers save its episodes.`
      );
    }
    if (!res.ok || !res.body) throw new DownloadError(`The download failed (${res.status}).`);
    const total = Number(res.headers.get("content-length")) || 0;
    const type = res.headers.get("content-type") || "audio/mpeg";
    let received = 0;
    // Streamed straight into the cache (an hour-long episode is 50–100 MB), counted on the way.
    const counted = res.body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          received += chunk.length;
          if (total) {
            progress.set(episode.id, Math.min(1, received / total));
            listeners.forEach((l) => l());
          }
          controller.enqueue(chunk);
        },
      })
    );
    const cache = await caches.open(EPISODE_CACHE);
    await cache.put(
      offlinePath(episode.id),
      new Response(counted, { headers: { "Content-Type": type } })
    );
    if (received < 1024) {
      await cache.delete(offlinePath(episode.id));
      throw new DownloadError("The server sent an empty file.");
    }
    // Ask the browser not to clear downloads when space runs low.
    void navigator.storage?.persist?.().catch(() => undefined);
    write({ ...read(), [episode.id]: { episode, bytes: received, at: Date.now() } });
  } finally {
    progress.delete(episode.id);
    listeners.forEach((l) => l());
  }
}

export async function removeDownload(id: string) {
  if (!read()[id]) return;
  const rest = { ...read() };
  delete rest[id];
  write(rest);
  if ("caches" in window) {
    await (await caches.open(EPISODE_CACHE)).delete(offlinePath(id)).catch(() => undefined);
  }
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY) {
      cachedList = null;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

const EMPTY: Record<string, Download> = {};

/** Everything downloaded, newest first, and live download progress by episode id. */
export function useDownloads() {
  const all = React.useSyncExternalStore(subscribe, read, () => EMPTY);
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => subscribe(force), []);
  const list = React.useMemo(() => Object.values(all).sort((a, b) => b.at - a.at), [all]);
  return { list, byId: all, progress: new Map(progress) };
}

export function formatBytes(bytes: number) {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  return `${Math.max(1, Math.round(bytes / 1e6))} MB`;
}
