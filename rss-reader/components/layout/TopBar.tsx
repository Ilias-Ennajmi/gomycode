"use client";

import * as React from "react";
import { AtSign, Compass, Link2, Newspaper, Plus, Search, Settings } from "lucide-react";
import { useT } from "@/lib/i18n";
import { requestAppEvent } from "@/lib/app-events";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useReaderState, type ViewType } from "@/lib/hooks/useReaderState";
import { shortCount, tabKey, useSectionTabs } from "@/lib/hooks/useSectionTabs";
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

interface TopBarProps {
  /** The phone copy is the page banner; the desktop copy (hidden on phones) is plain. */
  landmark?: boolean;
  /** Phones show the section's name here; its tabs are in the bottom bar. */
  phone?: boolean;
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
  phone = false,
}: TopBarProps) {
  const { view, mobilePane, setMobilePane } = useReaderState();
  const { tabs, active, select, hasNew, laterCount, unread } = useSectionTabs();
  const { t } = useT();
  const keyOf = tabKey;
  const short = shortCount;

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

  // Phones: the tabs live in the bottom bar; the top shows where you are.
  const activeTab = tabs.find((tab) => keyOf(tab) === active);
  const title =
    mobilePane === "settings"
      ? "Settings"
      : mobilePane === "sidebar"
        ? "Library"
        : (activeTab?.label ?? view.label);

  function openSearch() {
    setMobilePane("sidebar");
    requestAnimationFrame(() => document.getElementById("sidebar-search")?.focus());
  }

  const Tag = landmark ? "header" : "div";
  return (
    <Tag className={cn("shrink-0 border-b bg-background/95 pt-safe backdrop-blur", className)}>
      <div className="flex items-center gap-1 pr-1.5 md:h-14 md:gap-2 md:pr-5">
        {phone && (
          <p className="min-w-0 flex-1 truncate px-4 py-2.5 text-[22px] font-bold tracking-tight">
            {t(title)}
          </p>
        )}
        <nav
          ref={navRef}
          aria-label="Sections"
          className={cn(
            "relative flex min-w-0 flex-1 items-center overflow-x-auto px-2 scrollbar-none md:px-3",
            phone && "hidden"
          )}
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
