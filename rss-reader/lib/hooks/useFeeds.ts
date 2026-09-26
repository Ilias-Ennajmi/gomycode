"use client";

import { useEffect, useRef } from "react";
import useSWR from "swr";
import type { CategorySummary, FeedSummary, FeedType } from "@/lib/types";

const EMPTY_FEEDS: FeedSummary[] = [];
const EMPTY_CATEGORIES: CategorySummary[] = [];

async function jsonOrThrow<T>(res: Response, fallback: string): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || fallback);
  return body as T;
}

export function useFeeds() {
  const { data, error, isLoading, mutate } = useSWR<{ feeds: FeedSummary[] }>("/api/feeds");
  return { feeds: data?.feeds ?? EMPTY_FEEDS, isLoading, error, mutate };
}

export function useCategories() {
  const { data, error, isLoading, mutate } = useSWR<{ categories: CategorySummary[] }>(
    "/api/categories"
  );
  return { categories: data?.categories ?? EMPTY_CATEGORIES, isLoading, error, mutate };
}

export async function updateFeed(id: string, data: { title?: string; categoryId?: string | null }) {
  const res = await fetch(`/api/feeds/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const body = await jsonOrThrow<{ feed: FeedSummary }>(res, "Could not update feed");
  return body.feed;
}

export async function deleteFeed(id: string) {
  const res = await fetch(`/api/feeds/${id}`, { method: "DELETE" });
  await jsonOrThrow(res, "Could not delete feed");
}

export async function createCategory(name: string, color: string, icon?: string) {
  const res = await fetch("/api/categories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, color, icon }),
  });
  const body = await jsonOrThrow<{ category: CategorySummary }>(res, "Could not create category");
  return body.category;
}

export async function updateCategory(
  id: string,
  data: { name?: string; color?: string; icon?: string | null; order?: number }
) {
  const res = await fetch(`/api/categories/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const body = await jsonOrThrow<{ category: CategorySummary }>(res, "Could not update category");
  return body.category;
}

export async function deleteCategory(id: string) {
  const res = await fetch(`/api/categories/${id}`, { method: "DELETE" });
  await jsonOrThrow(res, "Could not delete category");
}

export interface RefreshResult {
  updated: number;
  newArticles: number;
  errors: string[];
}

export async function refreshFeeds(feedId?: string) {
  const res = await fetch("/api/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(feedId ? { feedId } : {}),
  });
  return jsonOrThrow<RefreshResult>(res, "Could not refresh feeds");
}

export function refreshToastMessage(result: RefreshResult) {
  if (result.errors.length > 0) {
    return `Refreshed — ${result.newArticles} new, ${result.errors.length} feed(s) failed`;
  }
  if (result.newArticles === 0) return "Refreshed — you're up to date";
  return `Refreshed — ${result.newArticles} new article${result.newArticles === 1 ? "" : "s"}`;
}

const STALE_AFTER_MS = 30 * 60 * 1000;

/**
 * Refreshes feeds in the background when the app is opened or brought back to
 * the foreground and nothing has been fetched for 30 minutes. This keeps
 * content fresh without depending on a frequent server cron.
 */
export function useAutoRefresh(onNewArticles: (result: RefreshResult) => void) {
  const { feeds, isLoading } = useFeeds();
  const inFlight = useRef(false);
  const latestFeeds = useRef(feeds);
  latestFeeds.current = feeds;
  const callback = useRef(onNewArticles);
  callback.current = onNewArticles;

  useEffect(() => {
    if (isLoading) return;

    function refreshIfStale() {
      const current = latestFeeds.current;
      if (inFlight.current || document.visibilityState !== "visible" || current.length === 0) {
        return;
      }
      const lastFetched = Math.max(
        0,
        ...current.map((f) => (f.lastFetched ? new Date(f.lastFetched).getTime() : 0))
      );
      if (Date.now() - lastFetched < STALE_AFTER_MS) return;

      inFlight.current = true;
      refreshFeeds()
        .then((result) => callback.current(result))
        .catch(() => undefined)
        .finally(() => {
          inFlight.current = false;
        });
    }

    refreshIfStale();
    document.addEventListener("visibilitychange", refreshIfStale);
    return () => document.removeEventListener("visibilitychange", refreshIfStale);
  }, [isLoading]);
}

export async function markAllRead(params: {
  feedId?: string;
  categoryId?: string;
  source?: FeedType;
}) {
  const res = await fetch("/api/articles/mark-all-read", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  return jsonOrThrow<{ updated: number }>(res, "Could not mark articles read");
}
