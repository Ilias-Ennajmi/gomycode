"use client";

import { getBrowserClient } from "@/lib/supabase/client";

/*
 * Signed Storage URLs (thumbnails, voice notes) last 7 days and are remembered
 * in localStorage, so the same image keeps the same URL: the service worker's
 * image cache can then serve it offline.
 */

const KEY = "stash.signed";
const TTL_S = 7 * 24 * 3600;
const MARGIN_MS = 12 * 3600 * 1000;

type Entry = { url: string; exp: number };

function readCache(): Record<string, Entry> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, Entry>;
  } catch {
    return {};
  }
}

function writeCache(cache: Record<string, Entry>) {
  try {
    const now = Date.now();
    const fresh = Object.fromEntries(Object.entries(cache).filter(([, e]) => e.exp > now));
    localStorage.setItem(KEY, JSON.stringify(fresh));
  } catch {
    // storage full or blocked: URLs are simply signed again next time
  }
}

export async function signedUrls(bucket: string, paths: string[]): Promise<Record<string, string>> {
  const cache = readCache();
  const now = Date.now();
  const out: Record<string, string> = {};
  const missing: string[] = [];
  for (const p of new Set(paths.filter(Boolean))) {
    const hit = cache[`${bucket}/${p}`];
    if (hit && hit.exp - MARGIN_MS > now) out[p] = hit.url;
    else missing.push(p);
  }
  const supabase = getBrowserClient();
  if (missing.length && supabase && navigator.onLine) {
    const { data } = await supabase.storage.from(bucket).createSignedUrls(missing, TTL_S);
    for (const row of data ?? []) {
      if (row.signedUrl && row.path) {
        out[row.path] = row.signedUrl;
        cache[`${bucket}/${row.path}`] = { url: row.signedUrl, exp: now + TTL_S * 1000 };
      }
    }
    writeCache(cache);
  }
  return out;
}

/** The app's own video URL: a redirect to a short-lived link to the stored MP4. */
export function videoUrl(saveId: string): string {
  return `/api/media/${saveId}`;
}
