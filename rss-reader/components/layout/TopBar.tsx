"use client";

import { Plus, Search, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/shared/Logo";
import { useFeeds } from "@/lib/hooks/useFeeds";
import { useArticleCount } from "@/lib/hooks/useArticles";
import { useReaderState, type ViewState, type ViewType } from "@/lib/hooks/useReaderState";

const TABS: ViewState[] = [
  { type: "foryou", label: "For You" },
  { type: "news", label: "News" },
  { type: "rss", label: "RSS" },
  { type: "youtube", label: "YouTube" },
  { type: "newsletters", label: "Newsletters" },
  { type: "later", label: "Later" },
];

interface TopBarProps {
  className?: string;
  onSaveLink: () => void;
}

/** Section tabs across the top, Readwise-style; phones also get search and settings. */
export function TopBar({ className, onSaveLink }: TopBarProps) {
  const { view, setView, mobilePane, setMobilePane } = useReaderState();
  const { feeds } = useFeeds();
  const laterCount = useArticleCount({ later: "queue" });

  // A single feed belongs to the tab for its kind of source.
  function activeTab(): ViewType | null {
    if (mobilePane === "settings") return null;
    if (view.type !== "feed") return TABS.some((t) => t.type === view.type) ? view.type : null;
    const feed = feeds.find((f) => f.id === view.id);
    if (feed?.newsDesk) return "news";
    return feed?.type === "youtube"
      ? "youtube"
      : feed?.type === "newsletter"
        ? "newsletters"
        : "rss";
  }
  const active = activeTab();

  function select(tab: ViewState) {
    // From a section list inside News, the tab goes back to the front page.
    if (view.type === tab.type && !(tab.type === "news" && view.id)) setMobilePane("list");
    else setView(tab);
  }

  function openSearch() {
    setMobilePane("sidebar");
    requestAnimationFrame(() => document.getElementById("sidebar-search")?.focus());
  }

  return (
    <header className={cn("shrink-0 border-b bg-background/95 pt-safe backdrop-blur", className)}>
      <div className="flex h-12 items-center gap-2 px-4 md:hidden">
        <Logo className="h-6 w-6" />
        <span className="text-[15px] font-semibold tracking-tight">Reader</span>
        <div className="ml-auto flex items-center">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={openSearch}
            aria-label="Search"
          >
            <Search className="h-[18px] w-[18px]" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={onSaveLink}
            aria-label="Save a link"
          >
            <Plus className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-9 w-9", mobilePane === "settings" && "text-primary")}
            onClick={() => setMobilePane("settings")}
            aria-label="Settings"
          >
            <Settings className="h-[18px] w-[18px]" />
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 pr-3 md:h-14 md:pr-5">
        <nav
          aria-label="Sections"
          className="flex min-w-0 flex-1 items-center overflow-x-auto px-2 scrollbar-none md:px-3"
        >
          {TABS.map((tab) => {
            const isActive = active === tab.type;
            return (
              <button
                key={tab.type}
                type="button"
                onClick={(event) => {
                  event.currentTarget.scrollIntoView({ inline: "nearest", block: "nearest" });
                  select(tab);
                }}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "relative flex h-11 shrink-0 items-center gap-1.5 px-2 text-[11.5px] font-semibold uppercase tracking-[0.05em] transition-colors md:h-14 md:px-3 md:text-[12.5px] md:tracking-[0.08em]",
                  isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {tab.label}
                {tab.type === "later" && laterCount > 0 && (
                  <span className="rounded-full bg-primary/15 px-1.5 py-px text-[10.5px] font-semibold tracking-normal text-primary">
                    {laterCount > 99 ? "99+" : laterCount}
                  </span>
                )}
                {isActive && (
                  <span className="absolute inset-x-2 bottom-0 h-[2px] rounded-full bg-primary md:inset-x-3" />
                )}
              </button>
            );
          })}
        </nav>
        <Button
          size="sm"
          className="hidden h-8 gap-1.5 rounded-full md:inline-flex"
          onClick={onSaveLink}
        >
          <Plus className="h-4 w-4" /> Save link
        </Button>
      </div>
    </header>
  );
}
