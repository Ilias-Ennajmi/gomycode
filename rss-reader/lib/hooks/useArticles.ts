"use client";

import useSWR from "swr";
import useSWRInfinite from "swr/infinite";
import { useMemo } from "react";
import type { ArticleListParams, ArticleSort, ArticleSummary } from "@/lib/types";

const PAGE_SIZE = 20;

interface ArticlesResponse {
  articles: ArticleSummary[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
  learnedFrom?: number;
}

function toSearchParams(params: ArticleListParams) {
  const search = new URLSearchParams();
  if (params.view) search.set("view", params.view);
  if (params.source) search.set("source", params.source);
  if (params.news) search.set("news", params.news);
  if (params.later) search.set("later", params.later);
  if (params.feedId) search.set("feedId", params.feedId);
  if (params.categoryId) search.set("categoryId", params.categoryId);
  if (params.saved) search.set("saved", "true");
  if (params.today) search.set("today", "true");
  if (params.unread) search.set("unread", "true");
  if (params.search) search.set("search", params.search);
  return search;
}

export function useArticles(params: ArticleListParams, sort: ArticleSort = "newest") {
  const getKey = (pageIndex: number, previousPageData: ArticlesResponse | null) => {
    if (previousPageData && !previousPageData.hasMore) return null;
    const search = toSearchParams(params);
    search.set("sort", sort);
    search.set("page", String(pageIndex + 1));
    search.set("limit", String(PAGE_SIZE));
    return `/api/articles?${search.toString()}`;
  };

  const { data, error, isLoading, isValidating, size, setSize, mutate } =
    useSWRInfinite<ArticlesResponse>(getKey, {
      refreshInterval: 5 * 60 * 1000,
      revalidateFirstPage: false,
    });

  const articles = useMemo(() => data?.flatMap((page) => page.articles) ?? [], [data]);

  return {
    articles,
    total: data?.[0]?.total ?? 0,
    learnedFrom: data?.[0]?.learnedFrom,
    hasMore: data ? Boolean(data[data.length - 1]?.hasMore) : false,
    isLoading,
    isLoadingMore: isValidating && size > 0,
    error,
    loadMore: () => setSize(size + 1),
    mutate,
  };
}

/** A single article, for ones opened from a briefing or a grouped story. */
export function useArticle(id: string | null) {
  const { data, mutate } = useSWR<{ article: ArticleSummary }>(id ? `/api/articles/${id}` : null);
  return { article: data?.article ?? null, mutate };
}

export function useArticleCount(params: ArticleListParams) {
  const search = toSearchParams(params);
  search.set("limit", "1");
  const { data } = useSWR<ArticlesResponse>(`/api/articles?${search.toString()}`, {
    refreshInterval: 5 * 60 * 1000,
  });
  return data?.total ?? 0;
}

async function patchArticle(
  id: string,
  data: { isRead?: boolean; isSaved?: boolean; isArchived?: boolean; readProgress?: number }
) {
  const res = await fetch(`/api/articles/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Could not update article");
  return body.article as ArticleSummary;
}

export function toggleArticleRead(id: string, isRead: boolean) {
  return patchArticle(id, { isRead });
}

export function toggleArticleSaved(id: string, isSaved: boolean) {
  return patchArticle(id, { isSaved });
}

/** Archive marks a Read Later item done; unarchiving puts it back in the queue. */
export function toggleArticleArchived(id: string, isArchived: boolean) {
  return patchArticle(id, { isArchived });
}

export function saveReadingProgress(id: string, readProgress: number) {
  return patchArticle(id, { readProgress });
}

export interface FullArticle {
  status: "full" | "limited" | "failed";
  content: string | null;
}

/** The full page for excerpt-only feeds; fetched once, then cached server-side. */
export function useFullArticle(id: string | null) {
  const { data, isLoading } = useSWR<FullArticle>(id ? `/api/articles/${id}/full` : null, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });
  return { full: data ?? null, isLoading };
}
