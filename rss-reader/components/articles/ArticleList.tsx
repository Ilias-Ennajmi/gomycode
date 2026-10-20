"use client";

import * as React from "react";
import { useInView } from "react-intersection-observer";
import {
  Archive,
  ArrowLeft,
  ArrowUp,
  Bell,
  Bookmark,
  AlarmClock,
  AtSign,
  Headphones,
  Hourglass,
  Inbox,
  Loader2,
  Mail,
  MonitorPlay,
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
import { ArticleCard } from "@/components/articles/ArticleCard";
import { ListToolbar } from "@/components/articles/ListToolbar";
import { Chip } from "@/components/ui/chip";
import { ArticleSkeletonList } from "@/components/articles/ArticleSkeleton";
import { DailyBriefing } from "@/components/articles/DailyBriefing";
import { ForYouGreeting } from "@/components/articles/ForYouGreeting";
import { StoryBubbles } from "@/components/stories/StoryBubbles";
import { usePersonal } from "@/lib/hooks/usePersonal";
import { HighlightsList } from "@/components/highlights/HighlightsList";
import { CollectionsView } from "@/components/collections/CollectionsView";
import dynamic from "next/dynamic";

const ShortsPlayer = dynamic(
  () => import("@/components/video/ShortsPlayer").then((m) => m.ShortsPlayer),
  { ssr: false }
);
const ListenLater = dynamic(
  () => import("@/components/later/ListenLater").then((m) => m.ListenLater),
  { ssr: false }
);
import { requestAppEvent, useAppEvent } from "@/lib/app-events";
import { useListLayout } from "@/lib/hooks/useListLayout";
import { copySignupAddress, openUnsubscribe } from "@/lib/hooks/useNewsletter";
import { isSourceTab, useReaderState } from "@/lib/hooks/useReaderState";
import {
  useCounts,
  useArticles,
  toggleArticleArchived,
  toggleArticleRead,
  toggleArticleSaved,
} from "@/lib/hooks/useArticles";
import { markAllRead, refreshFeeds, refreshToastMessage, useFeeds } from "@/lib/hooks/useFeeds";
import { PullIndicator, usePullToRefresh } from "@/lib/hooks/usePullToRefresh";
import { showChrome, syncChromeScroll, useHideOnScroll } from "@/lib/hooks/useChrome";
import { useLastVisit } from "@/lib/hooks/useLastVisit";
import { useFilters } from "@/lib/hooks/useFilters";
import { useT } from "@/lib/i18n";
import { haptic } from "@/lib/native";
import { withViewTransition } from "@/lib/motion";
import { ChromeCollapse } from "@/components/layout/ChromeCollapse";
import type { ArticleSummary, LaterTab, SearchScope, SearchSince } from "@/lib/types";
import { ShortsGrid } from "@/components/video/ShortsGrid";
import { TileGrid } from "@/components/articles/TileGrid";
import { SourceHeader } from "@/components/sources/SourceHeader";
import type { DiscoverKind } from "@/lib/discover/catalog";

interface ArticleListProps {
  onAddFeed: (kind?: DiscoverKind) => void;
  onSaveLink: () => void;
}

export function ArticleList({ onAddFeed, onSaveLink }: ArticleListProps) {
  const { mutate: globalMutate } = useSWRConfig();
  const {
    view,
    filterTab,
    sort,
    selectedArticleId,
    setSelectedArticleId,
    search,
    setSearch,
    searchScope,
    setSearchScope,
    searchSince,
    setSearchSince,
    newsletterKind,
    videoKind,
    podcastKind,
    setPodcastKind,
    listParams,
    setMobilePane,
    laterTab,
    setLaterTab,
    setView,
  } = useReaderState();

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
  const snoozedCount = useCounts().snoozed;
  const { layout, setLayout } = useListLayout(search.trim() ? "search" : view.type);
  const { feeds } = useFeeds();
  const { addRule, removeRule } = useFilters();
  const { t } = useT();
  const { personal } = usePersonal();
  const [refreshing, setRefreshing] = React.useState(false);
  const [markingAllRead, setMarkingAllRead] = React.useState(false);

  const { ref: sentinelRef, inView } = useInView({ rootMargin: "200px" });

  // Each view starts at the top instead of inheriting the previous scroll offset.
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const { bind: bindPull, pull, refreshing: pulling } = usePullToRefresh();
  const hideOnScroll = useHideOnScroll();

  // Each list remembers where you were: switching News → Podcasts → News comes back to the
  // same spot, and a list you haven't seen starts at the top.
  const listKey = JSON.stringify([listParams, sort, search, searchScope, searchSince]);
  const positions = React.useRef(new Map<string, number>());
  const restoreFor = React.useRef<string | null>(null);
  React.useEffect(() => {
    restoreFor.current = listKey;
    showChrome();
  }, [listKey]);
  React.useEffect(() => {
    if (restoreFor.current !== listKey || isLoading) return;
    restoreFor.current = null;
    const saved = positions.current.get(listKey) ?? 0;
    syncChromeScroll(saved);
    showChrome();
    scrollRef.current?.scrollTo({ top: saved });
  }, [listKey, isLoading, articles.length]);
  const onScrollList = (event: React.UIEvent<HTMLElement>) => {
    positions.current.set(listKey, event.currentTarget.scrollTop);
    hideOnScroll(event);
    setScrolledDown(event.currentTarget.scrollTop > 240);
  };
  const [scrolledDown, setScrolledDown] = React.useState(false);

  // Tapping the tab you're on, or the "new" pill, goes to the top.
  const scrollToTop = React.useCallback(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    showChrome();
  }, []);
  useAppEvent("scroll-top", scrollToTop);

  // New articles arriving while you're further down (the hourly refresh, a pull): say so,
  // with a way up, instead of moving the list under your thumb.
  const newestId = React.useRef<{ key: string; id: string | undefined } | null>(null);
  const [freshCount, setFreshCount] = React.useState(0);
  React.useEffect(() => {
    const first = articles[0]?.id;
    const previous = newestId.current;
    newestId.current = { key: listKey, id: first };
    if (!previous || previous.key !== listKey || !previous.id || !first || previous.id === first) {
      return;
    }
    const at = articles.findIndex((a) => a.id === previous.id);
    if (at > 0 && scrollRef.current && scrollRef.current.scrollTop > 240) {
      setFreshCount((n) => n + at);
    }
  }, [articles, listKey]);
  React.useEffect(() => {
    if (!scrolledDown) setFreshCount(0);
  }, [scrolledDown]);
  React.useEffect(() => setFreshCount(0), [listKey]);

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

  async function handleMute(article: ArticleSummary) {
    try {
      await addRule({ action: "hide", match: "feed", value: article.feedId });
      toast.success(`Muted ${article.feed.title}`, {
        description: "It stays followed but leaves your lists. Unmute it in Sources.",
        action: {
          label: "Undo",
          onClick: async () => {
            const res = await fetch("/api/filters");
            const { rules } = (await res.json()) as {
              rules: { id: string; action: string; match: string; value: string }[];
            };
            const rule = rules.find(
              (r) => r.action === "hide" && r.match === "feed" && r.value === article.feedId
            );
            if (rule) await removeRule(rule.id);
          },
        },
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not mute this source");
    }
  }

  async function handleToggleSave(article: ArticleSummary) {
    haptic();
    try {
      await toggleArticleSaved(article.id, !article.isSaved);
      mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update article");
    }
  }

  async function handleToggleRead(article: ArticleSummary) {
    haptic();
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
    // The card's picture glides into the article's picture (view transitions).
    const image = scrollRef.current?.querySelector<HTMLElement>(
      `[data-article-id="${article.id}"] [data-card-image]`
    );
    withViewTransition(
      () => {
        setSelectedArticleId(article.id);
        setMobilePane("reader");
      },
      { prepare: () => image && (image.style.viewTransitionName = "article-image") }
    );
    // The name moves on to the article's own picture.
    if (image) setTimeout(() => (image.style.viewTransitionName = ""), 50);
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
      } else if (key === "m" && currentIndex >= 0) {
        handleToggleRead(articles[currentIndex]);
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

  // "New since your last visit": where the articles you've already seen start.
  const visitKey = `${view.type}:${view.id ?? ""}`;
  const lastVisit = useLastVisit(visitKey);
  const datedList = !ranked && !isLater && !searching && sort === "newest" && filterTab === "all";
  const newSinceVisit =
    datedList && lastVisit
      ? articles.findIndex((a) => new Date(a.createdAt).getTime() <= lastVisit)
      : -1;
  const showHighlights = isLater && laterTab === "highlights";
  const showCollections = isLater && laterTab === "collections";
  // Shorts open in the vertical player; Later can be read aloud as a playlist.
  const [shortsAt, setShortsAt] = React.useState<number | null>(null);
  const [listening, setListening] = React.useState(false);
  React.useEffect(() => setListening(false), [view.type, laterTab]);
  const showVideoKinds = view.type === "youtube" && !searching;
  const shortsGrid = showVideoKinds && videoKind === "short";
  // A source's own list gets its page header (who it is, settings, unfollow).
  const sourceFeed =
    view.type === "feed" && !searching ? feeds.find((f) => f.id === view.id) : undefined;
  // An email newsletter's own list shows its sign-up address.
  const emailFeed =
    view.type === "feed" && !searching ? feeds.find((f) => f.id === view.id && f.email) : undefined;
  const fromSourcesList = ["feed", "category", "all", "today"].includes(view.type);
  const newsSection = view.type === "news" && Boolean(view.id);
  let lastDateLabel = "";

  return (
    <div className="relative flex h-full flex-col">
      {freshCount > 0 && (
        <button
          type="button"
          onClick={scrollToTop}
          className="absolute left-1/2 top-3 z-20 flex -translate-x-1/2 animate-rise-in items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-lg"
        >
          <ArrowUp className="h-3.5 w-3.5" />
          {freshCount} new
        </button>
      )}
      <ChromeCollapse>
        {/* Phones show a title row only where there's somewhere to go back to; the tabs above
          already say where you are. */}
        <div
          className={cn(
            "flex items-center gap-1 border-b px-2 py-1.5 md:px-3 md:py-2.5",
            !(searching || fromSourcesList || newsSection || view.type === "alerts") &&
              "max-md:hidden"
          )}
        >
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
              className={cn(
                "h-8 w-8 shrink-0 md:hidden",
                !(fromSourcesList || view.type === "alerts") && "hidden"
              )}
              onClick={() => setMobilePane("sidebar")}
              aria-label="Back"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div className="min-w-0 flex-1 pl-1 md:pl-0">
            <h2 className="truncate text-lg font-semibold leading-tight tracking-tight">
              {searching ? t("Search") : isLater ? t(LATER_TITLES[laterTab]) : t(view.label)}
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
                ) : laterTab === "collections" ? (
                  "Your saved articles, in named sets"
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
          {searching && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 shrink-0 gap-1.5 text-xs"
              onClick={() => setSearch("")}
            >
              <X className="h-3.5 w-3.5" /> Clear
            </Button>
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
            {sourceFeed && <SourceHeader feed={sourceFeed} total={total} />}
            <ListToolbar
              isLater={isLater}
              ranked={ranked}
              total={total}
              minutes={minutes ?? 0}
              lastFetched={lastFetched}
              learnedFrom={learnedFrom ?? 0}
              layout={layout}
              onLayout={setLayout}
              refreshing={refreshing}
              onRefresh={handleRefresh}
              onListen={isLater && laterTab === "queue" ? () => setListening(true) : undefined}
              canMarkAllRead={articles.length > 0}
              markingAllRead={markingAllRead}
              onMarkAllRead={handleMarkAllRead}
              snoozedCount={snoozedCount}
              onAddFeed={onAddFeed}
              onSaveLink={onSaveLink}
              formatMinutes={formatMinutes}
            />
          </>
        )}
      </ChromeCollapse>

      <div
        ref={(node) => {
          (scrollRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
          bindPull(node);
        }}
        onScroll={onScrollList}
        className="flex-1 overflow-y-auto overscroll-contain scrollbar-thin"
      >
        <PullIndicator pull={pull} refreshing={pulling} />
        {view.type === "foryou" && !searching && filterTab === "all" && (
          <>
            <ForYouGreeting />
            <StoryBubbles />
            {personal.briefingCard && <DailyBriefing />}
          </>
        )}
        {isSourceTab(view.type) && !searching && filterTab === "all" && (
          <StoryBubbles scope={view.type} />
        )}
        {showHighlights ? (
          <HighlightsList />
        ) : showCollections ? (
          <CollectionsView />
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
                  : view.type === "podcasts" && podcastKind === "progress"
                    ? "podcasts-progress"
                    : view.type
            }
            onAddFeed={onAddFeed}
            onSaveLink={onSaveLink}
            onGoLater={() => setLaterTab("queue")}
            onShowLatest={() => setPodcastKind("latest")}
            onRefresh={handleRefresh}
          />
        ) : shortsGrid || layout === "grid" ? (
          <>
            {shortsGrid ? (
              <ShortsGrid
                articles={articles}
                selectedId={selectedArticleId}
                onSelect={(article) =>
                  setShortsAt(
                    Math.max(
                      0,
                      articles.findIndex((a) => a.id === article.id)
                    )
                  )
                }
              />
            ) : (
              <TileGrid
                articles={articles}
                selectedId={selectedArticleId}
                onSelect={handleSelect}
              />
            )}
            {hasMore && (
              <div ref={sentinelRef} className="flex justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}
          </>
        ) : (
          <>
            {articles.map((article, index) => {
              const dateLabel = formatDateSeparator(article.publishedAt);
              const showSeparator = !ranked && !isLater && dateLabel !== lastDateLabel;
              lastDateLabel = dateLabel;
              // Magazine: the first story of a day (or every fifth) is a big picture card,
              // the rest are rows, so the page has a rhythm instead of a wall.
              const cardLayout =
                layout === "magazine"
                  ? showSeparator || index % 5 === 0 || (ranked && index === 0)
                    ? "cards"
                    : "list"
                  : layout;

              return (
                <React.Fragment key={article.id}>
                  {index === newSinceVisit && index > 0 && (
                    <div
                      className="flex items-center gap-3 px-4 py-2 text-xs font-semibold text-primary"
                      role="separator"
                    >
                      <span className="h-px flex-1 bg-primary/30" />
                      {index} new since your last visit
                      <span className="h-px flex-1 bg-primary/30" />
                    </div>
                  )}
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
                    onMuteSource={() => handleMute(article)}
                    onSelectRelated={handleSelect}
                    layout={cardLayout}
                    editorial={layout === "magazine"}
                    lead={layout === "magazine" && cardLayout === "cards"}
                    enterDelay={index < 10 ? index * 35 : undefined}
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
      {listening && isLater && (
        <ListenLater articles={articles} onClose={() => setListening(false)} />
      )}
      {shortsAt !== null && (
        <ShortsPlayer articles={articles} startIndex={shortsAt} onClose={() => setShortsAt(null)} />
      )}
    </div>
  );
}

const SCOPES: { id: SearchScope; label: string }[] = [
  { id: "all", label: "Everything" },
  { id: "news", label: "News" },
  { id: "rss", label: "RSS" },
  { id: "youtube", label: "YouTube" },
  { id: "newsletter", label: "Newsletters" },
  { id: "podcast", label: "Podcasts" },
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

const LATER_TITLES: Record<LaterTab, string> = {
  queue: "Later",
  snoozed: "Snoozed",
  archive: "Archive",
  highlights: "Highlights",
  collections: "Collections",
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
  onGoLater,
  onShowLatest,
  onRefresh,
}: {
  search: string;
  view: string;
  onAddFeed: (kind?: DiscoverKind) => void;
  onSaveLink: () => void;
  onGoLater: () => void;
  onShowLatest: () => void;
  onRefresh: () => void;
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
        action="Back to Later"
        onAction={onGoLater}
      />
    );
  }

  if (view === "later-archive") {
    return (
      <EmptyMessage
        icon={<Archive className="h-10 w-10" />}
        text="Your archive is empty. Items you finish in Later end up here."
        action="Back to Later"
        onAction={onGoLater}
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

  if (view === "alerts") {
    return (
      <EmptyMessage
        icon={<Bell className="h-10 w-10" />}
        text="No alerts yet. Add words or sources to watch, and anything new that matches lands here with a notification."
        action="Add an alert"
        onAction={() => requestAppEvent("content-filters")}
      />
    );
  }

  if (view === "podcasts") {
    return (
      <EmptyMessage
        icon={<Headphones className="h-10 w-10" />}
        text="No episodes yet. Follow a podcast and new episodes land here, ready to play while you read."
        action="Find podcasts"
        onAction={() => onAddFeed("podcast")}
      />
    );
  }

  if (view === "podcasts-progress") {
    return (
      <EmptyMessage
        icon={<Hourglass className="h-10 w-10" />}
        text="Nothing in progress. Episodes you start and don't finish wait here."
        action="See the latest episodes"
        onAction={onShowLatest}
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
        <Button size="sm" variant="outline" onClick={onRefresh}>
          Refresh now
        </Button>
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
