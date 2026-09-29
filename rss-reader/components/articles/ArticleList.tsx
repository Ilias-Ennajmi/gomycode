"use client";

import * as React from "react";
import { useInView } from "react-intersection-observer";
import {
  Archive,
  ArrowLeft,
  Bookmark,
  AlarmClock,
  AtSign,
  CheckCheck,
  Inbox,
  ListTree,
  Loader2,
  Mail,
  MonitorPlay,
  Plus,
  RefreshCw,
  Rss,
  SearchX,
  X,
} from "lucide-react";
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
import { CategoryChips } from "@/components/articles/CategoryChips";
import { ArticleSkeletonList } from "@/components/articles/ArticleSkeleton";
import { DailyBriefing } from "@/components/articles/DailyBriefing";
import { HighlightsList } from "@/components/highlights/HighlightsList";
import { requestAppEvent } from "@/lib/app-events";
import { copySignupAddress, openUnsubscribe } from "@/lib/hooks/useNewsletter";
import { isSourceTab, useReaderState } from "@/lib/hooks/useReaderState";
import {
  useArticleCount,
  useArticles,
  toggleArticleArchived,
  toggleArticleRead,
  toggleArticleSaved,
} from "@/lib/hooks/useArticles";
import { markAllRead, refreshFeeds, refreshToastMessage, useFeeds } from "@/lib/hooks/useFeeds";
import { PullIndicator, usePullToRefresh } from "@/lib/hooks/usePullToRefresh";
import type {
  ArticleFilter,
  ArticleSummary,
  LaterTab,
  NewsletterKind,
  SearchScope,
  SearchSince,
} from "@/lib/types";
import type { DiscoverKind } from "@/lib/discover/catalog";

const TAB_DISCOVER: Record<string, { kind: DiscoverKind; label: string }> = {
  rss: { kind: "rss", label: "Add site" },
  youtube: { kind: "youtube", label: "Add channel" },
  newsletters: { kind: "newsletter", label: "Add newsletter" },
};

interface ArticleListProps {
  onAddFeed: (kind?: DiscoverKind) => void;
  onSaveLink: () => void;
}

export function ArticleList({ onAddFeed, onSaveLink }: ArticleListProps) {
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
    setSearch,
    searchScope,
    setSearchScope,
    searchSince,
    setSearchSince,
    newsletterKind,
    setNewsletterKind,
    listParams,
    setMobilePane,
    laterTab,
    setLaterTab,
    setView,
  } = useReaderState();
  const sourceTab = isSourceTab(view.type) ? view.type : null;

  const {
    articles,
    total,
    hasMore,
    isLoading,
    isLoadingMore,
    loadMore,
    mutate,
    learnedFrom,
    minutes,
  } = useArticles(listParams, sort);
  const snoozedCount = useArticleCount({ later: "snoozed" });
  const { feeds } = useFeeds();
  const [refreshing, setRefreshing] = React.useState(false);
  const [markingAllRead, setMarkingAllRead] = React.useState(false);

  const { ref: sentinelRef, inView } = useInView({ rootMargin: "200px" });

  // Each view starts at the top instead of inheriting the previous scroll offset.
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const { bind: bindPull, pull, refreshing: pulling } = usePullToRefresh();
  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [view, filterTab, search, listParams.categoryId, searchScope, searchSince, newsletterKind]);

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
      toast.success(refreshToastMessage(result));
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
        categoryId: view.type === "category" ? view.id : listParams.categoryId,
        source: listParams.source,
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

  async function handleToggleRead(article: ArticleSummary) {
    try {
      await toggleArticleRead(article.id, !article.isRead);
      mutate();
      toast(article.isRead ? "Marked unread" : "Marked read", {
        action: {
          label: "Undo",
          onClick: () => toggleArticleRead(article.id, article.isRead).then(() => mutate()),
        },
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update article");
    }
  }

  async function handleArchive(article: ArticleSummary, archived: boolean) {
    try {
      await toggleArticleArchived(article.id, archived);
      globalMutate((key) => typeof key === "string" && key.startsWith("/api/articles"));
      toast.success(archived ? "Archived" : "Moved back to Later");
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
      if (target instanceof HTMLElement && target.closest('[role="dialog"], [role="menu"]')) return;
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

  const searching = Boolean(search.trim());
  // Search results are ranked by relevance, like For You by interest: no date separators.
  const ranked = view.type === "foryou" || searching;
  const isLater = view.type === "later" && !searching;
  const showHighlights = isLater && laterTab === "highlights";
  const showNewsletterKinds = view.type === "newsletters" && !searching;
  // An email newsletter's own list shows its sign-up address.
  const emailFeed =
    view.type === "feed" && !searching ? feeds.find((f) => f.id === view.id && f.email) : undefined;
  const fromSourcesList = ["feed", "category", "all", "today"].includes(view.type);
  const newsSection = view.type === "news" && Boolean(view.id);
  let lastDateLabel = "";

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b p-3">
        <div className="flex min-w-0 items-center gap-1">
          {newsSection ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => setView({ type: "news", label: "News" })}
              aria-label="Back to the front page"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className={cn("h-8 w-8 shrink-0 md:hidden", !fromSourcesList && "hidden")}
              onClick={() => setMobilePane("sidebar")}
              aria-label="Back"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold leading-tight tracking-tight">
              {searching ? "Search" : isLater ? LATER_TITLES[laterTab] : view.label}
            </h2>
            <p className="truncate text-xs text-muted-foreground">
              {searching ? (
                isLoading ? (
                  "Searching…"
                ) : (
                  <>
                    {total} result{total === 1 ? "" : "s"} for &ldquo;{search.trim()}&rdquo;
                  </>
                )
              ) : isLater ? (
                laterTab === "archive" ? (
                  `${total} finished`
                ) : laterTab === "snoozed" ? (
                  `${total} coming back later`
                ) : laterTab === "highlights" ? (
                  "Passages and notes from your reading"
                ) : (
                  `${total} to read${minutes ? ` · ${formatMinutes(minutes)}` : ""}`
                )
              ) : ranked ? (
                learnedFrom ? (
                  `Learned from ${learnedFrom} articles · `
                ) : (
                  "Ranked for you · "
                )
              ) : (
                ""
              )}
              {!isLater &&
                !searching &&
                (lastFetched ? `Updated ${formatRelativeTime(lastFetched)}` : "Not refreshed yet")}
            </p>
          </div>
        </div>
        {searching ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 shrink-0 gap-1.5 text-xs"
            onClick={() => setSearch("")}
          >
            <X className="h-3.5 w-3.5" /> Clear
          </Button>
        ) : (
          <div className="flex shrink-0 items-center gap-1">
            {!isLater && !newsSection && (
              <Button
                size="sm"
                className="h-8 gap-1 rounded-full px-3 text-xs"
                onClick={() =>
                  view.type === "newsletters" && newsletterKind === "email"
                    ? requestAppEvent("email-newsletter")
                    : onAddFeed(TAB_DISCOVER[view.type]?.kind ?? "all")
                }
                title={TAB_DISCOVER[view.type] ? undefined : "Discover sources"}
              >
                <Plus className="h-3.5 w-3.5" />
                {TAB_DISCOVER[view.type] ? (
                  <>
                    {/* Phones: just "Add", so the title keeps its room. */}
                    <span className="max-sm:hidden">{TAB_DISCOVER[view.type].label}</span>
                    <span className="sm:hidden">Add</span>
                  </>
                ) : (
                  <span className="max-sm:sr-only">Discover</span>
                )}
              </Button>
            )}
            {sourceTab && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 rounded-full text-xs md:hidden"
                onClick={() => setMobilePane("sidebar")}
              >
                <ListTree className="h-3.5 w-3.5" />
                {view.type === "youtube" ? "Channels" : "Sources"}
              </Button>
            )}
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
        )}
      </div>

      {searching ? (
        <SearchFilters
          scope={searchScope}
          onScope={setSearchScope}
          since={searchSince}
          onSince={setSearchSince}
        />
      ) : (
        <>
          {emailFeed?.email && (
            <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2 text-xs">
              <AtSign className="h-3.5 w-3.5 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {emailFeed.email}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => copySignupAddress(emailFeed.email!)}
              >
                Copy
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => openUnsubscribe(emailFeed.id)}
              >
                Unsubscribe
              </Button>
            </div>
          )}
          {showNewsletterKinds && (
            <NewsletterKinds kind={newsletterKind} onChange={setNewsletterKind} />
          )}
          {sourceTab && <CategoryChips tab={sourceTab} />}

          <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
            {isLater ? (
              <Tabs
                value={laterTab}
                onValueChange={(v) => setLaterTab(v as LaterTab)}
                className="min-w-0 overflow-x-auto scrollbar-none"
              >
                <TabsList>
                  <TabsTrigger value="queue">Later</TabsTrigger>
                  {(snoozedCount > 0 || laterTab === "snoozed") && (
                    <TabsTrigger value="snoozed">Snoozed</TabsTrigger>
                  )}
                  <TabsTrigger value="archive">Archive</TabsTrigger>
                  <TabsTrigger value="highlights">Highlights</TabsTrigger>
                </TabsList>
              </Tabs>
            ) : (
              <Tabs value={filterTab} onValueChange={(v) => setFilterTab(v as ArticleFilter)}>
                <TabsList>
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="unread">Unread</TabsTrigger>
                  <TabsTrigger value="saved">Saved</TabsTrigger>
                </TabsList>
              </Tabs>
            )}

            <div className="flex items-center gap-1">
              {!ranked && !(isLater && laterTab !== "queue" && laterTab !== "archive") && (
                <Select value={sort} onValueChange={(v) => setSort(v as "newest" | "oldest")}>
                  <SelectTrigger className="h-8 w-[92px] text-xs sm:w-[110px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Newest</SelectItem>
                    <SelectItem value="oldest">Oldest</SelectItem>
                  </SelectContent>
                </Select>
              )}
              {isLater ? (
                laterTab === "queue" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    onClick={onSaveLink}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span className="max-sm:sr-only">Save link</span>
                  </Button>
                )
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  onClick={handleMarkAllRead}
                  disabled={markingAllRead || articles.length === 0}
                  title="Mark all read"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  <span className="sr-only">Mark all read</span>
                </Button>
              )}
            </div>
          </div>
        </>
      )}

      <div
        ref={(node) => {
          (scrollRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
          bindPull(node);
        }}
        className="flex-1 overflow-y-auto overscroll-contain scrollbar-thin"
      >
        <PullIndicator pull={pull} refreshing={pulling} />
        {view.type === "foryou" && !searching && filterTab === "all" && <DailyBriefing />}
        {showHighlights ? (
          <HighlightsList />
        ) : isLoading ? (
          <ArticleSkeletonList />
        ) : articles.length === 0 ? (
          <EmptyState
            search={search}
            view={
              isLater
                ? `later-${laterTab}`
                : view.type === "newsletters" && newsletterKind
                  ? `newsletters-${newsletterKind}`
                  : view.type
            }
            onAddFeed={onAddFeed}
            onSaveLink={onSaveLink}
          />
        ) : (
          <>
            {articles.map((article) => {
              const dateLabel = formatDateSeparator(article.publishedAt);
              const showSeparator = !ranked && !isLater && dateLabel !== lastDateLabel;
              lastDateLabel = dateLabel;

              return (
                <React.Fragment key={article.id}>
                  {showSeparator && (
                    <div className="sticky top-0 z-10 border-b bg-background/90 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">
                      {dateLabel}
                    </div>
                  )}
                  <ArticleCard
                    article={article}
                    active={article.id === selectedArticleId}
                    searchQuery={search}
                    onClick={() => handleSelect(article)}
                    onToggleSave={() => handleToggleSave(article)}
                    onToggleRead={() => handleToggleRead(article)}
                    onSelectRelated={handleSelect}
                    onArchive={
                      article.isSaved
                        ? () => handleArchive(article, !article.archivedAt)
                        : undefined
                    }
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
                You&rsquo;re all caught up — {total} article
                {total === 1 ? "" : "s"}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const SCOPES: { id: SearchScope; label: string }[] = [
  { id: "all", label: "Everything" },
  { id: "news", label: "News" },
  { id: "rss", label: "RSS" },
  { id: "youtube", label: "YouTube" },
  { id: "newsletter", label: "Newsletters" },
  { id: "later", label: "Later" },
  { id: "highlights", label: "Highlighted" },
];

/** Where to search and how far back. */
function SearchFilters({
  scope,
  onScope,
  since,
  onSince,
}: {
  scope: SearchScope;
  onScope: (scope: SearchScope) => void;
  since: SearchSince;
  onSince: (since: SearchSince) => void;
}) {
  return (
    <div className="flex items-center gap-2 border-b px-3 py-2">
      <div
        role="toolbar"
        aria-label="Search in"
        className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto scrollbar-none"
      >
        {SCOPES.map((option) => (
          <Chip
            key={option.id}
            active={scope === option.id}
            onClick={(event) => {
              event.currentTarget.scrollIntoView({ inline: "nearest", block: "nearest" });
              onScope(option.id);
            }}
          >
            {option.label}
          </Chip>
        ))}
      </div>
      <Select value={since} onValueChange={(v) => onSince(v as SearchSince)}>
        <SelectTrigger className="h-7 w-[104px] shrink-0 text-xs" aria-label="When">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="any">Any time</SelectItem>
          <SelectItem value="day">Past day</SelectItem>
          <SelectItem value="week">Past week</SelectItem>
          <SelectItem value="month">Past month</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

/** Newsletters → All · Substack & web · Email. */
function NewsletterKinds({
  kind,
  onChange,
}: {
  kind: NewsletterKind | null;
  onChange: (kind: NewsletterKind | null) => void;
}) {
  const options: { id: NewsletterKind | null; label: string; icon?: React.ReactNode }[] = [
    { id: null, label: "All" },
    { id: "web", label: "Substack & web", icon: <Rss className="h-3.5 w-3.5" /> },
    { id: "email", label: "Email", icon: <Mail className="h-3.5 w-3.5" /> },
  ];
  return (
    <div role="toolbar" aria-label="Kind of newsletter" className="flex gap-1.5 border-b px-3 py-2">
      {options.map((option) => (
        <Chip
          key={option.id ?? "all"}
          active={kind === option.id}
          onClick={() => onChange(option.id)}
        >
          {option.icon}
          {option.label}
        </Chip>
      ))}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
        active
          ? "border-foreground bg-foreground text-background"
          : "text-muted-foreground hover:bg-accent hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

const LATER_TITLES: Record<LaterTab, string> = {
  queue: "Later",
  snoozed: "Snoozed",
  archive: "Archive",
  highlights: "Highlights",
};

/** "45 min", "2 h", "2 h 15 min" */
function formatMinutes(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

function EmptyState({
  search,
  view,
  onAddFeed,
  onSaveLink,
}: {
  search: string;
  view: string;
  onAddFeed: (kind?: DiscoverKind) => void;
  onSaveLink: () => void;
}) {
  if (search) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
        <SearchX className="h-8 w-8" />
        <p className="text-sm">No results for &ldquo;{search}&rdquo;</p>
      </div>
    );
  }

  if (view === "later-queue") {
    return (
      <EmptyMessage
        icon={<Bookmark className="h-10 w-10" />}
        text="Nothing to read later yet. Save any link, or tap the bookmark on an article."
        action="Save a link"
        onAction={onSaveLink}
      />
    );
  }

  if (view === "later-snoozed") {
    return (
      <EmptyMessage
        icon={<AlarmClock className="h-10 w-10" />}
        text="Nothing snoozed. Snooze an article to have it come back to Later when you have time."
      />
    );
  }

  if (view === "later-archive") {
    return (
      <EmptyMessage
        icon={<Archive className="h-10 w-10" />}
        text="Your archive is empty. Items you finish in Later end up here."
      />
    );
  }

  if (view === "youtube") {
    return (
      <EmptyMessage
        icon={<MonitorPlay className="h-10 w-10" />}
        text="No videos yet. Follow a YouTube channel and its new uploads land here."
        action="Find YouTube channels"
        onAction={() => onAddFeed("youtube")}
      />
    );
  }

  if (view === "newsletters-email") {
    return (
      <EmptyMessage
        icon={<AtSign className="h-10 w-10" />}
        text="No email newsletters yet. Get an address to sign up with, and every issue lands here."
        action="Get an address"
        onAction={() => requestAppEvent("email-newsletter")}
      />
    );
  }

  if (view === "newsletters" || view === "newsletters-web") {
    return (
      <EmptyMessage
        icon={<Mail className="h-10 w-10" />}
        text="No newsletters yet. Follow Substack and other newsletters and new issues land here."
        action="Find newsletters"
        onAction={() => onAddFeed("newsletter")}
      />
    );
  }

  if (view === "rss") {
    return (
      <EmptyMessage
        icon={<Rss className="h-10 w-10" />}
        text="No articles yet. Follow a few sites to get started."
        action="Discover sites"
        onAction={() => onAddFeed("rss")}
      />
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
      <Button size="sm" onClick={() => onAddFeed()}>
        Discover sources
      </Button>
    </div>
  );
}

function EmptyMessage({
  icon,
  text,
  action,
  onAction,
}: {
  icon: React.ReactNode;
  text: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground">
      {icon}
      <p className="max-w-xs text-sm">{text}</p>
      {action && onAction && (
        <Button size="sm" onClick={onAction}>
          {action}
        </Button>
      )}
    </div>
  );
}
