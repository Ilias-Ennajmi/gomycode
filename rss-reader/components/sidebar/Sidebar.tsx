"use client";

import * as React from "react";
import { Inbox, Moon, Search, Star, Sun, SunMoon, X } from "lucide-react";
import { useTheme } from "next-themes";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { NavItem } from "@/components/sidebar/NavItem";
import { CategoryGroup } from "@/components/sidebar/CategoryGroup";
import { FeedItem } from "@/components/sidebar/FeedItem";
import { SidebarFooter } from "@/components/sidebar/SidebarFooter";
import { useCategories, useFeeds } from "@/lib/hooks/useFeeds";
import { useArticleCount } from "@/lib/hooks/useArticles";
import { useReaderState } from "@/lib/hooks/useReaderState";
import type { CategorySummary } from "@/lib/types";

interface SidebarProps {
  onAddFeed: () => void;
  onManageCategories: () => void;
  onImportOpml: () => void;
  onShowShortcuts: () => void;
}

export function Sidebar({
  onAddFeed,
  onManageCategories,
  onImportOpml,
  onShowShortcuts,
}: SidebarProps) {
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const { view, setView, search, setSearch } = useReaderState();
  const { feeds, isLoading: feedsLoading, mutate: mutateFeeds } = useFeeds();
  const { categories, isLoading: categoriesLoading, mutate: mutateCategories } =
    useCategories();

  const [searchDraft, setSearchDraft] = React.useState(search);
  React.useEffect(() => {
    const timeout = setTimeout(() => setSearch(searchDraft), 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchDraft]);

  const totalUnread = feeds.reduce((sum, feed) => sum + feed.unreadCount, 0);
  const todayCount = useArticleCount({ today: true });
  const savedCount = useArticleCount({ saved: true });

  function refetchAll() {
    mutateFeeds();
    mutateCategories();
  }

  const uncategorizedFeeds = feeds.filter((feed) => !feed.categoryId);

  function selectCategory(category: CategorySummary) {
    setView({ type: "category", id: category.id, label: category.name });
  }

  function selectFeed(feedId: string, title: string) {
    setView({ type: "feed", id: feedId, label: title });
  }

  return (
    <aside className="flex h-full w-full flex-col bg-background md:w-[240px] md:border-r">
      <div className="flex items-center gap-2 border-b p-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="sidebar-search"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
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
            label="All"
            count={totalUnread}
            active={view.type === "all"}
            onClick={() => setView({ type: "all", label: "All Articles" })}
          />
          <NavItem
            icon={<span className="text-sm leading-none">📅</span>}
            label="Today"
            count={todayCount}
            active={view.type === "today"}
            onClick={() => setView({ type: "today", label: "Today" })}
          />
          <NavItem
            icon={<Star className="h-4 w-4" />}
            label="Saved"
            count={savedCount}
            active={view.type === "saved"}
            onClick={() => setView({ type: "saved", label: "Saved" })}
          />
        </div>

        <div>
          <p className="px-2.5 pb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Categories
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

              {uncategorizedFeeds.length > 0 && (
                <div>
                  <p className="px-2.5 pb-1 pt-2 text-xs text-muted-foreground">
                    Uncategorized
                  </p>
                  <div className="space-y-0.5">
                    {uncategorizedFeeds.map((feed) => (
                      <FeedItem
                        key={feed.id}
                        id={feed.id}
                        title={feed.title}
                        faviconUrl={feed.faviconUrl}
                        unreadCount={feed.unreadCount}
                        errorCount={feed.errorCount}
                        active={view.type === "feed" && view.id === feed.id}
                        categories={categories}
                        onClick={() => selectFeed(feed.id, feed.title)}
                        onChanged={refetchAll}
                      />
                    ))}
                  </div>
                </div>
              )}

              {categories.length === 0 && feeds.length === 0 && !feedsLoading && (
                <p className="px-2.5 py-2 text-sm text-muted-foreground">
                  No feeds yet.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <SidebarFooter
        onAddFeed={onAddFeed}
        onManageCategories={onManageCategories}
        onImportOpml={onImportOpml}
        onShowShortcuts={onShowShortcuts}
      />
    </aside>
  );
}
