"use client";

import { useEffect, useMemo, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/client";
import { bucketPolicy, forget, pickFresh, prune, remember, type SignedCache } from "@/lib/signedCache";

/*
 * Signed Storage URLs, made by the phone's own session (row-level security on
 * storage.objects decides what it may read) and remembered in localStorage until
 * shortly before they end. See lib/signedCache.ts for how long each bucket's links live.
 */

const KEY = "stash.signed";
export const VIDEO_BUCKET = "stash-video";

function readCache(): SignedCache {
  try {
    return (JSON.parse(localStorage.getItem(KEY) ?? "{}") as SignedCache) ?? {};
  } catch {
    return {};
  }
}

function writeCache(cache: SignedCache) {
  try {
    localStorage.setItem(KEY, JSON.stringify(prune(cache, Date.now())));
  } catch {
    // storage full or blocked: URLs are simply signed again next time
  }
}

// One request per bucket+path at a time, however many screens ask.
const inFlight = new Map<string, Promise<Record<string, string>>>();

export async function signedUrls(bucket: string, paths: Array<string | null | undefined>): Promise<Record<string, string>> {
  const now = Date.now();
  const { fresh, missing } = pickFresh(readCache(), bucket, paths, now);
  const supabase = getBrowserClient();
  if (!missing.length || !supabase || (typeof navigator !== "undefined" && !navigator.onLine)) return fresh;

  const key = `${bucket}|${missing.slice().sort().join("|")}`;
  let request = inFlight.get(key);
  if (!request) {
    request = (async () => {
      const { data } = await supabase.storage.from(bucket).createSignedUrls(missing, bucketPolicy(bucket).ttlS);
      const signed: Record<string, string> = {};
      for (const row of data ?? []) if (row.signedUrl && row.path) signed[row.path] = row.signedUrl;
      if (Object.keys(signed).length) writeCache(remember(readCache(), bucket, signed, Date.now()));
      return signed;
    })()
      .catch(() => ({}) as Record<string, string>)
      .finally(() => inFlight.delete(key));
    inFlight.set(key, request);
  }
  return { ...fresh, ...(await request) };
}

/** The playable address of a stored video (6 h link, reused until near its end). Null offline or when refused. */
export async function videoUrl(save: { videoPath?: string | null }): Promise<string | null> {
  if (!save.videoPath) return null;
  return (await signedUrls(VIDEO_BUCKET, [save.videoPath]))[save.videoPath] ?? null;
}

/** A link that stopped working before its time (clock skew, revoked): sign it again next time. */
export function forgetSignedUrl(bucket: string, path: string) {
  writeCache(forget(readCache(), bucket, path));
}

/**
 * Video links for a short list of saves (the one playing and the next two in Play),
 * signed in one request so the next video can start loading before it is on screen.
 */
export function useVideoUrls(paths: Array<string | null | undefined>): Record<string, string> {
  const wanted = useMemo(() => [...new Set(paths.filter((p): p is string => Boolean(p)))].sort(), [paths]);
  const key = wanted.join("|");
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!key) return;
    let alive = true;
    void signedUrls(VIDEO_BUCKET, key.split("|")).then((u) => {
      if (alive && Object.keys(u).length) setUrls((prev) => ({ ...prev, ...u }));
    });
    return () => {
      alive = false;
    };
  }, [key]);
  return urls;
}
