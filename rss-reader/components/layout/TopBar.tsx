"use client";

import * as React from "react";
import { AtSign, Compass, Link2, Newspaper, Plus, Search, Settings } from "lucide-react";
import { useT } from "@/lib/i18n";
import { requestAppEvent } from "@/lib/app-events";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useCategories, useFeeds } from "@/lib/hooks/useFeeds";
import { usePersonal } from "@/lib/hooks/usePersonal";
import { useCounts } from "@/lib/hooks/useArticles";
import { useReaderState, type ViewState, type ViewType } from "@/lib/hooks/useReaderState";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DiscoverKind } from "@/lib/discover/catalog";

/** The Discover channel that fits each tab. */
const TAB_KIND: Partial<Record<ViewType, DiscoverKind>> = {
  rss: "rss",
  youtube: "youtube",
  newsletters: "newsletter",
  podcasts: "podcast",
};
const KIND_LABEL: Record<DiscoverKind, string> = {
  all: "Add sources",
  rss: "Add sites & blogs",
  youtube: "Add YouTube channels",
  newsletter: "Add newsletters",
  podcast: "Add podcasts",
};

const SEEN_KEY = "reader-tab-seen";

/** For each tab: is there more unread than when it was last open? Remembered on this device. */
function useNewSinceLastLook(unread: Partial<Record<ViewType, number>>, active: ViewType | null) {
  const [seen, setSeen] = React.useState<Record<string, number>>({});
  React.useEffect(() => {
    try {
      setSeen(JSON.parse(localStorage.getItem(SEEN_KEY) ?? "{}"));
    } catch {
      // Not remembered: no dots until this visit has looked at each tab.
    }
  }, []);

  // The key of the unread counts, so effects run when they change, not on every render.
  const signature = Object.entries(unread)
    .map(([tab, count]) => `${tab}:${count ?? 0}`)
    .join(",");
  React.useEffect(() => {
    setSeen((previous) => {
      const next = { ...previous };
      let changed = false;
      for (const [tab, count] of Object.entries(unread)) {
        const current = count ?? 0;
        // Open now, or first time seen, or fewer than before (read some): that's the new baseline.
        if (tab === active || next[tab] === undefined || current < next[tab]) {
          if (next[tab] !== current) {
            next[tab] = current;
            changed = true;
          }
        }
      }
      if (!changed) return previous;
      try {
        localStorage.setItem(SEEN_KEY, JSON.stringify(next));
      } catch {
        // Fine: dots just reset next time.
      }
      return next;
    });
    // `signature` stands for `unread`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, active]);

  return (tab: ViewType) => (unread[tab] ?? 0) > (seen[tab] ?? Number.POSITIVE_INFINITY);
}

function short(n: number) {
  return n > 99 ? "99+" : String(n);
}

const TABS: ViewState[] = [
  { type: "foryou", label: "For You" },
  { type: "news", label: "News" },
  { type: "rss", label: "RSS" },
  { type: "youtube", label: "YouTube" },
  { type: "newsletters", label: "Newsletters" },
  { type: "podcasts", label: "Podcasts" },
  { type: "later", label: "Later" },
];

interface TopBarProps {
  /** The phone copy is the page banner; the desktop copy (hidden on phones) is plain. */
  landmark?: boolean;
  className?: string;
  onSaveLink: () => void;
  onAddFeed: (kind?: DiscoverKind) => void;
  onManageNews: () => void;
}

/** Section tabs across the top, Readwise-style; phones also get search and settings. */
export function TopBar({
  className,
  onSaveLink,
  onAddFeed,
  onManageNews,
  landmark = true,
}: TopBarProps) {
  const { view, setView, mobilePane, setMobilePane } = useReaderState();
  const { feeds } = useFeeds();
  const { categories } = useCategories();
  const { personal } = usePersonal();
  const counts = useCounts();
  const { t } = useT();
  const laterCount = counts.later;
  // The bar as personalised: built-in tabs in the chosen order minus the hidden ones, then
  // any categories pinned as tabs.
  const tabs = React.useMemo<ViewState[]>(
    () => [
      ...personal.tabs
        .filter((type) => !personal.hiddenTabs.includes(type))
        .map((type) => TABS.find((tab) => tab.type === type)!)
        .filter(Boolean),
      ...personal.pinnedCategories
        .map((id) => categories.find((c) => c.id === id))
        .filter((c): c is NonNullable<typeof c> => Boolean(c))
        .map((c) => ({ type: "category" as const, id: c.id, label: c.name })),
    ],
    [personal.tabs, personal.hiddenTabs, personal.pinnedCategories, categories]
  );
  const keyOf = (tab: { type: ViewType; id?: string }) => `${tab.type}:${tab.id ?? ""}`;
  // Unread per tab, so it's clear where something new is waiting.
  const unread: Partial<Record<ViewType, number>> = {
    news: counts.news,
    rss: counts.rss,
    youtube: counts.youtube,
    newsletters: counts.newsletters,
    podcasts: counts.podcasts,
  };

  // A single feed belongs to the tab for its kind of source.
  function activeType(): ViewType | null {
    if (mobilePane === "settings") return null;
    // The briefing and the recap are reached from For You.
    if (view.type === "briefing" || view.type === "recap") return "foryou";
    if (view.type === "category") return "category";
    if (view.type !== "feed") return tabs.some((t) => t.type === view.type) ? view.type : null;
    const feed = feeds.find((f) => f.id === view.id);
    if (feed?.newsDesk) return "news";
    return feed?.type === "youtube"
      ? "youtube"
      : feed?.type === "newsletter"
        ? "newsletters"
        : feed?.type === "podcast"
          ? "podcasts"
          : "rss";
  }
  const activeTypeValue = activeType();
  // A pinned category lights its own tab; another category lights nothing.
  const active =
    activeTypeValue === "category"
      ? tabs.some((t) => t.type === "category" && t.id === view.id)
        ? keyOf({ type: "category", id: view.id })
        : null
      : activeTypeValue
        ? keyOf({ type: activeTypeValue })
        : null;
  // A dot on a tab says "something new since you last looked", not a count that never goes
  // away: each tab remembers how many unread it had when it was last open.
  const hasNew = useNewSinceLastLook(
    unread,
    activeTypeValue === "category" ? null : activeTypeValue
  );

  // Opened from a link or shortcut (e.g. Highlights, inside Later): bring the tab into view.
  const navRef = React.useRef<HTMLElement>(null);
  React.useEffect(() => {
    navRef.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView({ inline: "nearest", block: "nearest" });
    // Again when the counts arrive and widen the tabs.
  }, [
    active,
    laterCount,
    unread.news,
    unread.rss,
    unread.youtube,
    unread.newsletters,
    unread.podcasts,
  ]);

  // Where the underline sits: measured from the active tab, re-measured when counts change
  // the widths or the window resizes.
  const [underline, setUnderline] = React.useState({ left: 0, width: 0 });
  React.useLayoutEffect(() => {
    const nav = navRef.current;
    const tab = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !tab) {
      setUnderline({ left: 0, width: 0 });
      return;
    }
    const measure = () => {
      const inset = window.matchMedia("(min-width: 768px)").matches ? 12 : 8;
      setUnderline({ left: tab.offsetLeft + inset, width: tab.offsetWidth - inset * 2 });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [
    active,
    laterCount,
    unread.news,
    unread.rss,
    unread.youtube,
    unread.newsletters,
    unread.podcasts,
  ]);

  function select(tab: ViewState) {
    // From a section list inside News, the tab goes back to the front page.
    if (view.type === tab.type && view.id === tab.id && !(tab.type === "news" && view.id)) {
      // Tapping the tab you're on goes back to the top, like a native app.
      setMobilePane("list");
      requestAppEvent("scroll-top");
    } else setView(tab);
  }

  function openSearch() {
    setMobilePane("sidebar");
    requestAnimationFrame(() => document.getElementById("sidebar-search")?.focus());
  }

  const Tag = landmark ? "header" : "div";
  return (
    <Tag className={cn("shrink-0 border-b bg-background/95 pt-safe backdrop-blur", className)}>
      <div className="flex items-center gap-1 pr-1.5 md:h-14 md:gap-2 md:pr-5">
        <nav
          ref={navRef}
          aria-label="Sections"
          className="relative flex min-w-0 flex-1 items-center overflow-x-auto px-2 scrollbar-none md:px-3"
        >
          {tabs.map((tab) => {
            const isActive = active === keyOf(tab);
            return (
              <button
                key={keyOf(tab)}
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
                {t(tab.label)}
                {tab.type === "later" && laterCount > 0 && (
                  <span className="rounded-full bg-primary/15 px-1.5 py-px text-[10.5px] font-semibold tracking-normal text-primary">
                    {short(laterCount)}
                  </span>
                )}
                {!isActive && hasNew(tab.type) && (
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-primary"
                    aria-label="New since you last looked"
                  />
                )}
              </button>
            );
          })}
          {/* One underline for all the tabs: it slides to the active one. */}
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute bottom-0 h-[2px] rounded-full bg-primary transition-[left,width] duration-300 ease-spring",
              underline.width === 0 && "opacity-0"
            )}
            style={{ left: underline.left, width: underline.width }}
          />
        </nav>
        <div className="flex shrink-0 items-center md:hidden">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={openSearch}
            aria-label="Search"
          >
            <Search className="h-[18px] w-[18px]" />
          </Button>
          <AddMenu
            kind={TAB_KIND[view.type] ?? "all"}
            onAddFeed={onAddFeed}
            onManageNews={onManageNews}
            onSaveLink={onSaveLink}
          >
            <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Add">
              <Plus className="h-5 w-5" />
            </Button>
          </AddMenu>
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
        <AddMenu
          kind={TAB_KIND[view.type] ?? "all"}
          onAddFeed={onAddFeed}
          onManageNews={onManageNews}
          onSaveLink={onSaveLink}
        >
          <Button size="sm" className="hidden h-8 gap-1.5 rounded-full md:inline-flex">
            <Plus className="h-4 w-4" /> {t("Add")}
          </Button>
        </AddMenu>
      </div>
    </Tag>
  );
}

/** One "+" for everything you can add, scoped to the tab you're on. */
function AddMenu({
  kind,
  onAddFeed,
  onManageNews,
  onSaveLink,
  children,
}: {
  kind: DiscoverKind;
  onAddFeed: (kind?: DiscoverKind) => void;
  onManageNews: () => void;
  onSaveLink: () => void;
  children: React.ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Add</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => onAddFeed(kind)} className="gap-2.5 py-2">
          <Compass className="h-4 w-4 text-primary" />
          <span>
            <span className="block text-sm">{KIND_LABEL[kind]}</span>
            <span className="block text-xs text-muted-foreground">
              Browse, search, or follow a topic
            </span>
          </span>
        </DropdownMenuItem>
        {(kind === "newsletter" || kind === "all") && (
          <DropdownMenuItem
            onSelect={() => requestAppEvent("email-newsletter")}
            className="gap-2.5 py-2"
          >
            <AtSign className="h-4 w-4 text-primary" />
            <span>
              <span className="block text-sm">Email newsletter</span>
              <span className="block text-xs text-muted-foreground">
                Get an address to sign up with
              </span>
            </span>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={onManageNews} className="gap-2.5 py-2">
          <Newspaper className="h-4 w-4 text-primary" />
          <span>
            <span className="block text-sm">News sources</span>
            <span className="block text-xs text-muted-foreground">Choose the outlets in News</span>
          </span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onSaveLink} className="gap-2.5 py-2">
          <Link2 className="h-4 w-4 text-primary" />
          <span>
            <span className="block text-sm">Save a link</span>
            <span className="block text-xs text-muted-foreground">Read it later</span>
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
