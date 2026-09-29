"use client";

import type { DiscoverKind } from "@/lib/discover/catalog";
import * as React from "react";
import {
  CalendarDays,
  CalendarRange,
  Highlighter,
  Inbox,
  Moon,
  Plus,
  Search,
  Sun,
  SunMoon,
  X,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { NavItem } from "@/components/sidebar/NavItem";
import { Logo } from "@/components/shared/Logo";
import { CategoryGroup } from "@/components/sidebar/CategoryGroup";
import { FeedItem } from "@/components/sidebar/FeedItem";
import { SidebarFooter } from "@/components/sidebar/SidebarFooter";
import { useCategories, useFeeds } from "@/lib/hooks/useFeeds";
import { useArticleCount } from "@/lib/hooks/useArticles";
import { useReaderState } from "@/lib/hooks/useReaderState";
import type { CategorySummary, FeedSummary } from "@/lib/types";

interface SidebarProps {
  onAddFeed: (kind?: DiscoverKind) => void;
  onManageSources: () => void;
  onManageCategories: () => void;
  onContentFilters: () => void;
  onImportOpml: () => void;
  onShowShortcuts: () => void;
}

export function Sidebar({
  onAddFeed,
  onManageSources,
  onManageCategories,
  onContentFilters,
  onImportOpml,
  onShowShortcuts,
}: SidebarProps) {
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const { view, setView, search, setSearch, setMobilePane, laterTab, setLaterTab } =
    useReaderState();
  const { feeds, isLoading: feedsLoading, mutate: mutateFeeds } = useFeeds();
  const { categories, isLoading: categoriesLoading, mutate: mutateCategories } = useCategories();

  const [searchDraft, setSearchDraft] = React.useState(search);
  React.useEffect(() => {
    const timeout = setTimeout(() => setSearch(searchDraft), 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchDraft]);

  // Cleared from the results list: empty the box too.
  React.useEffect(() => {
    if (!search) setSearchDraft("");
  }, [search]);

  const totalUnread = feeds
    .filter((feed) => !feed.muted)
    .reduce((sum, feed) => sum + feed.unreadCount, 0);
  const todayCount = useArticleCount({ today: true });

  function refetchAll() {
    mutateFeeds();
    mutateCategories();
  }

  const uncategorizedFeeds = feeds.filter(
    (feed) => !feed.categoryId && feed.type === "rss" && !feed.newsDesk
  );
  const newsFeeds = feeds.filter((feed) => !feed.categoryId && feed.newsDesk);
  const youTubeChannels = feeds.filter((feed) => !feed.categoryId && feed.type === "youtube");
  const newsletterSenders = feeds.filter((feed) => !feed.categoryId && feed.type === "newsletter");

  function selectCategory(category: CategorySummary) {
    setView({ type: "category", id: category.id, label: category.name });
  }

  function selectFeed(feedId: string, title: string) {
    setView({ type: "feed", id: feedId, label: title });
  }

  function renderFeedGroup(label: string, groupFeeds: FeedSummary[], empty?: React.ReactNode) {
    if (groupFeeds.length === 0 && !empty) return null;
    return (
      <div key={label}>
        <p className="px-2.5 pb-1 pt-2 text-xs text-muted-foreground">{label}</p>
        <div className="space-y-0.5">
          {groupFeeds.length === 0 && empty}
          {groupFeeds.map((feed) => (
            <FeedItem
              key={feed.id}
              id={feed.id}
              title={feed.title}
              faviconUrl={feed.faviconUrl}
              unreadCount={feed.unreadCount}
              errorCount={feed.errorCount}
              muted={feed.muted}
              active={view.type === "feed" && view.id === feed.id}
              categories={categories}
              onClick={() => selectFeed(feed.id, feed.title)}
              onChanged={refetchAll}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <aside className="flex h-full w-full flex-col bg-card/40 md:border-r">
      <div className="hidden h-14 items-center gap-2.5 border-b px-4 md:flex">
        <Logo className="h-7 w-7" />
        <span className="text-[15px] font-semibold tracking-tight">Reader</span>
      </div>
      <div className="flex items-center gap-2 border-b p-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="sidebar-search"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              setSearch(searchDraft);
              setMobilePane("list");
              e.currentTarget.blur();
            }}
            enterKeyHint="search"
            placeholder="Search articles…"
            className="h-8 pl-8 pr-7"
          />
          {searchDraft && (
            <button
              type="button"
              onClick={() => setSearchDraft("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          aria-label="Toggle dark mode"
        >
          {!mounted ? (
            <SunMoon className="h-4 w-4" />
          ) : resolvedTheme === "dark" ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </Button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-3 scrollbar-thin">
        <div className="space-y-0.5">
          <NavItem
            icon={<Inbox className="h-4 w-4" />}
            label="All articles"
            count={totalUnread}
            active={view.type === "all"}
            onClick={() => setView({ type: "all", label: "All Articles" })}
          />
          <NavItem
            icon={<CalendarDays className="h-4 w-4" />}
            label="Today"
            count={todayCount}
            active={view.type === "today"}
            onClick={() => setView({ type: "today", label: "Today" })}
          />
          <NavItem
            icon={<CalendarRange className="h-4 w-4" />}
            label="Weekly recap"
            active={view.type === "recap"}
            onClick={() => setView({ type: "recap", label: "Weekly recap" })}
          />
          <NavItem
            icon={<Highlighter className="h-4 w-4" />}
            label="Highlights"
            active={view.type === "later" && laterTab === "highlights"}
            onClick={() => {
              setView({ type: "later", label: "Later" });
              setLaterTab("highlights");
            }}
          />
        </div>

        <div>
          <p className="px-2.5 pb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Library
          </p>
          {categoriesLoading || feedsLoading ? (
            <div className="space-y-2 px-2">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-3/4" />
            </div>
          ) : (
            <div className="space-y-1">
              {categories.map((category) => (
                <CategoryGroup
                  key={category.id}
                  category={category}
                  categories={categories}
                  activeView={view}
                  onSelectCategory={selectCategory}
                  onSelectFeed={selectFeed}
                  onChanged={refetchAll}
                />
              ))}

              {renderFeedGroup("RSS feeds", uncategorizedFeeds)}
              {renderFeedGroup("News sources", newsFeeds)}
              {renderFeedGroup(
                "YouTube channels",
                youTubeChannels,
                <button
                  type="button"
                  onClick={() => onAddFeed("youtube")}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                >
                  <Plus className="h-4 w-4" /> Add a channel
                </button>
              )}
              {renderFeedGroup(
                "Newsletters",
                newsletterSenders,
                <button
                  type="button"
                  onClick={() => onAddFeed("newsletter")}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                >
                  <Plus className="h-4 w-4" /> Add a newsletter
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <SidebarFooter
        onAddFeed={onAddFeed}
        onManageSources={onManageSources}
        onManageCategories={onManageCategories}
        onContentFilters={onContentFilters}
        onImportOpml={onImportOpml}
        onShowShortcuts={onShowShortcuts}
      />
    </aside>
  );
}
