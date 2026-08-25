"use client";

import * as React from "react";
import { useInView } from "react-intersection-observer";
import { ArrowLeft, CheckCheck, Inbox, Loader2, RefreshCw, SearchX } from "lucide-react";
import { toast } from "sonner";
import { useSWRConfig } from "swr";
import { cn, formatDateSeparator, formatRelativeTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArticleCard } from "@/components/articles/ArticleCard";
import { ArticleSkeletonList } from "@/components/articles/ArticleSkeleton";
import { useReaderState } from "@/lib/hooks/useReaderState";
import { useArticles, toggleArticleSaved } from "@/lib/hooks/useArticles";
import { markAllRead, refreshFeeds, useFeeds } from "@/lib/hooks/useFeeds";
import type { ArticleFilter, ArticleSummary } from "@/lib/types";

interface ArticleListProps {
  onAddFeed: () => void;
}

export function ArticleList({ onAddFeed }: ArticleListProps) {
  const { mutate: globalMutate } = useSWRConfig();
  const {
    view,
    filterTab,
    setFilterTab,
    sort,
    setSort,
    selectedArticleId,
    setSelectedArticleId,
    search,
    listParams,
    setMobilePane,
  } = useReaderState();

  const { articles, total, hasMore, isLoading, isLoadingMore, loadMore, mutate } =
    useArticles(listParams, sort);
  const { feeds } = useFeeds();
  const [refreshing, setRefreshing] = React.useState(false);
  const [markingAllRead, setMarkingAllRead] = React.useState(false);

  const { ref: sentinelRef, inView } = useInView({ rootMargin: "200px" });

  React.useEffect(() => {
    if (inView && hasMore && !isLoading && !isLoadingMore) {
      loadMore();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, hasMore]);

  const lastFetched = feeds.reduce<Date | null>((latest, feed) => {
    if (!feed.lastFetched) return latest;
    const d = new Date(feed.lastFetched);
    return !latest || d > latest ? d : latest;
  }, null);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const result = await refreshFeeds();
      globalMutate(() => true, undefined, { revalidate: true });
      mutate();
      if (result.errors.length > 0) {
        toast.error(`Refreshed with ${result.errors.length} error(s)`);
      } else {
        toast.success(`Refreshed — feeds are up to date`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not refresh feeds");
    } finally {
      setRefreshing(false);
    }
  }

  async function handleMarkAllRead() {
    setMarkingAllRead(true);
    try {
      await markAllRead({
        feedId: view.type === "feed" ? view.id : undefined,
        categoryId: view.type === "category" ? view.id : undefined,
      });
      await mutate();
      toast.success("Marked all as read");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not mark articles read");
    } finally {
      setMarkingAllRead(false);
    }
  }

  async function handleToggleSave(article: ArticleSummary) {
    try {
      await toggleArticleSaved(article.id, !article.isSaved);
      mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update article");
    }
  }

  function handleSelect(article: ArticleSummary) {
    setSelectedArticleId(article.id);
    setMobilePane("reader");
  }

  // Keyboard navigation scoped to the currently loaded article list.
  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName.toLowerCase();
        if (tag === "input" || tag === "textarea" || target.isContentEditable) return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (articles.length === 0) return;

      const key = event.key.toLowerCase();
      const currentIndex = articles.findIndex((a) => a.id === selectedArticleId);

      if (key === "j") {
        event.preventDefault();
        const next = articles[Math.min(articles.length - 1, currentIndex + 1)];
        if (next) handleSelect(next);
      } else if (key === "k") {
        event.preventDefault();
        const prev = articles[Math.max(0, currentIndex - 1)];
        if (prev) handleSelect(prev);
      } else if ((key === "o" || key === "enter") && currentIndex >= 0) {
        setMobilePane("reader");
      } else if (key === "v" && currentIndex >= 0) {
        window.open(articles[currentIndex].link, "_blank", "noopener,noreferrer");
      } else if ((key === "s" || key === "b") && currentIndex >= 0) {
        handleToggleSave(articles[currentIndex]);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articles, selectedArticleId]);

  let lastDateLabel = "";

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b p-3">
        <div className="flex min-w-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 md:hidden"
            onClick={() => setMobilePane("sidebar")}
            aria-label="Back to sidebar"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <h2 className="truncate font-semibold">{view.label}</h2>
            <p className="text-xs text-muted-foreground">
              {lastFetched ? `Updated ${formatRelativeTime(lastFetched)}` : "Not refreshed yet"}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={handleRefresh}
          disabled={refreshing}
          aria-label="Refresh feeds"
        >
          <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
        </Button>
      </div>

      <div className="flex items-center justify-between gap-2 border-b p-2">
        <Tabs value={filterTab} onValueChange={(v) => setFilterTab(v as ArticleFilter)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="unread">Unread</TabsTrigger>
            <TabsTrigger value="saved">Saved</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-1">
          <Select value={sort} onValueChange={(v) => setSort(v as "newest" | "oldest")}>
            <SelectTrigger className="h-8 w-[110px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="oldest">Oldest</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={handleMarkAllRead}
            disabled={markingAllRead || articles.length === 0}
          >
            <CheckCheck className="h-3.5 w-3.5" /> Mark all read
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {isLoading ? (
          <ArticleSkeletonList />
        ) : articles.length === 0 ? (
          <EmptyState search={search} view={view.type} onAddFeed={onAddFeed} />
        ) : (
          <>
            {articles.map((article) => {
              const dateLabel = formatDateSeparator(article.publishedAt);
              const showSeparator = dateLabel !== lastDateLabel;
              lastDateLabel = dateLabel;

              return (
                <React.Fragment key={article.id}>
                  {showSeparator && (
                    <div className="sticky top-0 z-10 border-b bg-muted/90 px-3 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur">
                      {dateLabel}
                    </div>
                  )}
                  <ArticleCard
                    article={article}
                    active={article.id === selectedArticleId}
                    searchQuery={search}
                    onClick={() => handleSelect(article)}
                    onToggleSave={() => handleToggleSave(article)}
                  />
                </React.Fragment>
              );
            })}

            {hasMore && (
              <div ref={sentinelRef} className="flex justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}

            {!hasMore && total > 0 && (
              <p className="py-4 text-center text-xs text-muted-foreground">
                You&rsquo;re all caught up — {total} article{total === 1 ? "" : "s"}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function EmptyState({
  search,
  view,
  onAddFeed,
}: {
  search: string;
  view: string;
  onAddFeed: () => void;
}) {
  if (search) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
        <SearchX className="h-8 w-8" />
        <p className="text-sm">No results for &ldquo;{search}&rdquo;</p>
      </div>
    );
  }

  if (view === "feed") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
        <Inbox className="h-8 w-8" />
        <p className="text-sm">No articles yet. Try refreshing.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground">
      <Inbox className="h-10 w-10" />
      <p className="text-sm">No articles here yet.</p>
      <Button size="sm" onClick={onAddFeed}>
        Add your first RSS feed
      </Button>
    </div>
  );
}
