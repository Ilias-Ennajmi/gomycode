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
}

function toSearchParams(params: ArticleListParams) {
  const search = new URLSearchParams();
  if (params.view) search.set("view", params.view);
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
    hasMore: data ? Boolean(data[data.length - 1]?.hasMore) : false,
    isLoading,
    isLoadingMore: isValidating && size > 0,
    error,
    loadMore: () => setSize(size + 1),
    mutate,
  };
}

export function useArticleCount(params: ArticleListParams) {
  const search = toSearchParams(params);
  search.set("limit", "1");
  const { data } = useSWR<ArticlesResponse>(`/api/articles?${search.toString()}`, {
    refreshInterval: 5 * 60 * 1000,
  });
  return data?.total ?? 0;
}

async function patchArticle(id: string, data: { isRead?: boolean; isSaved?: boolean }) {
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
