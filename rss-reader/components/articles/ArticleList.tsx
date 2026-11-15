"use client";

import * as React from "react";
import { useInView } from "react-intersection-observer";
import { ArrowLeft, ArrowUp, AtSign, Layers, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { useSWRConfig } from "swr";
import { cn, formatDateSeparator, formatRelativeTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ArticleCard } from "@/components/articles/ArticleCard";
import { ListToolbar } from "@/components/articles/ListToolbar";
import { ArticleSkeletonList } from "@/components/articles/ArticleSkeleton";
import { DailyBriefing } from "@/components/articles/DailyBriefing";
import { ForYouGreeting } from "@/components/articles/ForYouGreeting";
import { StoryBubbles } from "@/components/stories/StoryBubbles";
import { ContinueListening } from "@/components/audio/ContinueListening";
import { episodeOf, useAudio } from "@/components/audio/AudioProvider";
import { usePersonal } from "@/lib/hooks/usePersonal";
import dynamic from "next/dynamic";
import { useAppEvent } from "@/lib/app-events";
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
import { useT, tr } from "@/lib/i18n";
import { haptic } from "@/lib/native";
import { withViewTransition } from "@/lib/motion";
import { ChromeCollapse } from "@/components/layout/ChromeCollapse";
import type { ArticleSummary } from "@/lib/types";
import { ShortsGrid } from "@/components/video/ShortsGrid";
import { TileGrid } from "@/components/articles/TileGrid";
import { SourceHeader } from "@/components/sources/SourceHeader";
import type { DiscoverKind } from "@/lib/discover/catalog";
import { SearchFilters, LATER_TITLES, EmptyState } from "@/components/articles/list/ListParts";

const HighlightsList = dynamic(
  () => import("@/components/highlights/HighlightsList").then((m) => m.HighlightsList),
  { ssr: false }
);
const CollectionsView = dynamic(
  () => import("@/components/collections/CollectionsView").then((m) => m.CollectionsView),
  { ssr: false }
);

const ShortsPlayer = dynamic(
  () => import("@/components/video/ShortsPlayer").then((m) => m.ShortsPlayer),
  { ssr: false }
);
const TriageMode = dynamic(
  () => import("@/components/articles/TriageMode").then((m) => m.TriageMode),
  { ssr: false }
);
const ListenLater = dynamic(
  () => import("@/components/later/ListenLater").then((m) => m.ListenLater),
  { ssr: false }
);

interface ArticleListProps {
  onAddFeed: (kind?: DiscoverKind) => void;
  onSaveLink: () => void;
}

export function ArticleList({ onAddFeed, onSaveLink }: ArticleListProps) {
  const { mutate: globalMutate } = useSWRConfig();
  const audio = useAudio();
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
    searchMeaning,
    setSearchMeaning,
    newsletterKind,
    videoKind,
    podcastKind,
    setPodcastKind,
    listParams,
    mobilePane,
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
      toast.error(error instanceof Error ? error.message : tr("Could not refresh feeds"));
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
      toast.success(tr("Marked all as read"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr("Could not mark articles read"));
    } finally {
      setMarkingAllRead(false);
    }
  }

  async function handleMute(article: ArticleSummary) {
    try {
      await addRule({ action: "hide", match: "feed", value: article.feedId });
      toast.success(`Muted ${article.feed.title}`, {
        description: tr("It stays followed but leaves your lists. Unmute it in Sources."),
        action: {
          label: tr("Undo"),
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
      toast.error(error instanceof Error ? error.message : tr("Could not mute this source"));
    }
  }

  async function handleToggleSave(article: ArticleSummary) {
    haptic();
    try {
      await toggleArticleSaved(article.id, !article.isSaved);
      mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr("Could not update article"));
    }
  }

  async function handleToggleRead(article: ArticleSummary) {
    haptic();
    try {
      await toggleArticleRead(article.id, !article.isRead);
      mutate();
      toast(article.isRead ? tr("Marked unread") : tr("Marked read"), {
        action: {
          label: tr("Undo"),
          onClick: () => toggleArticleRead(article.id, article.isRead).then(() => mutate()),
        },
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr("Could not update article"));
    }
  }

  async function handleArchive(article: ArticleSummary, archived: boolean) {
    try {
      await toggleArticleArchived(article.id, archived);
      globalMutate((key) => typeof key === "string" && key.startsWith("/api/articles"));
      toast.success(archived ? tr("Archived") : tr("Moved back to Later"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr("Could not update article"));
    }
  }

  function handleSelect(article: ArticleSummary) {
    // Phones: an episode opens the full-screen player, like a podcast app.
    const asEpisode = !article.isVideo ? episodeOf(article) : null;
    if (asEpisode && window.matchMedia("(max-width: 767px)").matches) {
      setSelectedArticleId(article.id);
      audio.openPlayer(asEpisode);
      return;
    }
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
  const [triaging, setTriaging] = React.useState(false);
  // An article opened from triage: triage waits behind it and comes back where it was.
  const [triagePaused, setTriagePaused] = React.useState(false);
  // Phones: back from the article (or the player, for an episode) returns to triage.
  const lastPane = React.useRef(mobilePane);
  const lastExpanded = React.useRef(audio.expanded);
  React.useEffect(() => {
    const leftReader = lastPane.current === "reader" && mobilePane === "list";
    const closedPlayer = lastExpanded.current && !audio.expanded;
    lastPane.current = mobilePane;
    lastExpanded.current = audio.expanded;
    if (triagePaused && (leftReader || closedPlayer)) setTriagePaused(false);
  }, [mobilePane, audio.expanded, triagePaused]);
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
      <h1 className="sr-only">
        {searching ? t("Search") : isLater ? t(LATER_TITLES[laterTab]) : t(view.label)}
      </h1>
      {freshCount > 0 && (
        <button
          type="button"
          onClick={scrollToTop}
          className="absolute left-1/2 top-3 z-20 flex -translate-x-1/2 animate-rise-in items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-lg"
        >
          <ArrowUp className="h-3.5 w-3.5" />
          {freshCount} {t("new")}
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
              aria-label={t("Back to the front page")}
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
              aria-label={t("Back")}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div className="min-w-0 flex-1 pl-1 md:pl-0">
            <p className="truncate text-lg font-semibold leading-tight tracking-tight" aria-hidden>
              {searching ? t("Search") : isLater ? t(LATER_TITLES[laterTab]) : t(view.label)}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {searching ? (
                isLoading ? (
                  t("Searching…")
                ) : (
                  <>
                    {total} {t("result")}
                    {total === 1 ? "" : "s"} {t("for “")}
                    {search.trim()}&rdquo;
                  </>
                )
              ) : isLater ? (
                laterTab === "archive" ? (
                  `${total} finished`
                ) : laterTab === "snoozed" ? (
                  `${total} coming back later`
                ) : laterTab === "highlights" ? (
                  t("Passages and notes from your reading")
                ) : laterTab === "collections" ? (
                  t("Your saved articles, in named sets")
                ) : (
                  `${total} to read${minutes ? ` · ${formatMinutes(minutes)}` : ""}`
                )
              ) : ranked ? (
                learnedFrom ? (
                  `Learned from ${learnedFrom} articles · `
                ) : (
                  t("Ranked for you · ")
                )
              ) : (
                ""
              )}
              {!isLater &&
                !searching &&
                (lastFetched
                  ? `Updated ${formatRelativeTime(lastFetched)}`
                  : t("Not refreshed yet"))}
            </p>
          </div>
          {searching && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 shrink-0 gap-1.5 text-xs"
              onClick={() => setSearch("")}
            >
              <X className="h-3.5 w-3.5" /> {t("Clear")}
            </Button>
          )}
        </div>

        {searching ? (
          <SearchFilters
            scope={searchScope}
            onScope={setSearchScope}
            since={searchSince}
            onSince={setSearchSince}
            meaning={searchMeaning}
            onMeaning={setSearchMeaning}
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
                  {t("Copy")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => openUnsubscribe(emailFeed.id)}
                >
                  {t("Unsubscribe")}
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
              onTriage={
                !isLater && articles.some((a) => !a.isRead) ? () => setTriaging(true) : undefined
              }
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
        {view.type === "podcasts" &&
          !searching &&
          filterTab === "all" &&
          podcastKind === "latest" && (
            <ContinueListening onSeeAll={() => setPodcastKind("progress")} />
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
              // Magazine: the first story of a day is a big picture card, the rest are rows
              // with the picture on the left.
              const cardLayout =
                layout === "magazine"
                  ? showSeparator || (ranked && index === 0)
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
                      {index} {t("new since your last visit")}
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
                {t("You’re all caught up —")} {total} {t("article")}
                {total === 1 ? "" : "s"}
              </p>
            )}
          </>
        )}
      </div>
      {triaging && (
        <TriageMode
          articles={articles}
          hidden={triagePaused}
          onOpen={(article) => {
            setTriagePaused(true);
            handleSelect(article);
          }}
          onClose={() => {
            setTriaging(false);
            setTriagePaused(false);
            globalMutate((key) => typeof key === "string" && key.startsWith("/api/articles"));
          }}
        />
      )}
      {triaging && triagePaused && (
        <button
          type="button"
          onClick={() => setTriagePaused(false)}
          className="fixed bottom-24 left-1/2 z-30 hidden -translate-x-1/2 items-center gap-2 rounded-full bg-foreground px-4 py-2.5 text-sm font-semibold text-background shadow-xl md:flex"
        >
          <Layers className="h-4 w-4" /> {t("Back to triage")}
        </button>
      )}
      {listening && isLater && (
        <ListenLater articles={articles} onClose={() => setListening(false)} />
      )}
      {shortsAt !== null && (
        <ShortsPlayer articles={articles} startIndex={shortsAt} onClose={() => setShortsAt(null)} />
      )}
    </div>
  );
}

/** "45 min", "2 h", "2 h 15 min" */
function formatMinutes(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}
