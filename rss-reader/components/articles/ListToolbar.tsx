"use client";

import * as React from "react";
import {
  ArrowDownUp,
  Bell,
  BookDown,
  CheckCheck,
  Grid2x2,
  Headphones,
  Search,
  Hourglass,
  LayoutGrid,
  ListTree,
  MoreHorizontal,
  Newspaper,
  Plus,
  RefreshCw,
  Rows3,
  Smartphone,
  Sparkles,
} from "lucide-react";
import { CatchUpSheet } from "@/components/articles/CatchUpSheet";
import { useT } from "@/lib/i18n";
import { cn, formatRelativeTime } from "@/lib/utils";
import { Chip } from "@/components/ui/chip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { requestAppEvent } from "@/lib/app-events";
import { useCategoryOptions } from "@/lib/hooks/useCategoryOptions";
import { isSourceTab, useReaderState } from "@/lib/hooks/useReaderState";
import type { ListLayout } from "@/lib/hooks/useListLayout";
import type { DiscoverKind } from "@/lib/discover/catalog";
import type { LaterTab, VideoKind, VideoLength } from "@/lib/types";

const TAB_ADD: Record<string, { kind: DiscoverKind; label: string }> = {
  rss: { kind: "rss", label: "Add a site" },
  youtube: { kind: "youtube", label: "Add a channel" },
  newsletters: { kind: "newsletter", label: "Add a newsletter" },
  podcasts: { kind: "podcast", label: "Add a podcast" },
};

const VIDEO_KINDS: { id: VideoKind; label: string }[] = [
  { id: "long", label: "Videos" },
  { id: "short", label: "Shorts" },
  { id: "all", label: "All" },
];
const VIDEO_LENGTHS: { id: VideoLength; label: string }[] = [
  { id: "short", label: "Under 10 min" },
  { id: "medium", label: "10–30 min" },
  { id: "long", label: "30+ min" },
];

const LAYOUTS: { id: ListLayout; label: string; icon: React.ElementType }[] = [
  { id: "list", label: "Compact list", icon: Rows3 },
  { id: "magazine", label: "Magazine", icon: Newspaper },
  { id: "cards", label: "Big pictures", icon: LayoutGrid },
  { id: "grid", label: "Grid", icon: Grid2x2 },
];

/** Four little icons in the chip row: rows, magazine, big pictures, grid of tiles. */
function LayoutSwitch({
  value,
  onChange,
}: {
  value: ListLayout;
  onChange: (l: ListLayout) => void;
}) {
  const { t } = useT();
  return (
    <span
      role="radiogroup"
      aria-label="Layout"
      className="ml-0.5 flex shrink-0 items-center rounded-full border p-0.5"
    >
      {LAYOUTS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={value === id}
          aria-label={t(label)}
          title={t(label)}
          onClick={() => onChange(id)}
          className={cn(
            "flex h-6 w-7 items-center justify-center rounded-full transition-colors",
            value === id
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      ))}
    </span>
  );
}

function Divider() {
  return <span className="mx-0.5 h-4 w-px shrink-0 self-center bg-border" aria-hidden />;
}

export interface ListToolbarProps {
  /** Later: read the queue aloud as a playlist. */
  onListen?: () => void;
  isLater: boolean;
  ranked: boolean;
  total: number;
  minutes: number;
  lastFetched: Date | null;
  learnedFrom: number;
  layout: ListLayout;
  onLayout: (layout: ListLayout) => void;
  refreshing: boolean;
  onRefresh: () => void;
  canMarkAllRead: boolean;
  markingAllRead: boolean;
  onMarkAllRead: () => void;
  snoozedCount: number;
  onAddFeed: (kind?: DiscoverKind) => void;
  onSaveLink: () => void;
  formatMinutes: (minutes: number) => string;
}

/**
 * Everything that narrows or controls a list, in one thin row: filters as chips that scroll
 * sideways, and a single "⋯" for the rest (add, refresh, layout, sort, mark all read). It
 * replaces what used to be four stacked bars.
 */
export function ListToolbar(props: ListToolbarProps) {
  const {
    view,
    filterTab,
    setFilterTab,
    laterTab,
    setLaterTab,
    newsletterKind,
    setNewsletterKind,
    videoKind,
    setVideoKind,
    videoLength,
    setVideoLength,
    podcastKind,
    setPodcastKind,
  } = useReaderState();
  const sourceTab = isSourceTab(view.type) ? view.type : null;
  const category = useCategoryOptions(sourceTab);
  const { t } = useT();

  const scroller = React.useRef<HTMLDivElement>(null);
  const [fade, setFade] = React.useState({ left: false, right: false });
  const measure = React.useCallback(() => {
    const node = scroller.current;
    if (!node) return;
    const left = node.scrollLeft > 4;
    const right = node.scrollLeft + node.clientWidth < node.scrollWidth - 4;
    // Same values, same object: this runs after every render, and a fresh object each time
    // would render forever (the row is measured even while hidden behind Settings).
    setFade((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
  }, []);
  React.useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  });

  const scrollIntoView = (event: React.MouseEvent<HTMLElement>) =>
    event.currentTarget.scrollIntoView({ inline: "nearest", block: "nearest" });

  const toggleFilter = (value: "unread" | "saved") =>
    setFilterTab(filterTab === value ? "all" : value);

  return (
    <div className="flex items-center border-b">
      <div
        ref={scroller}
        onScroll={measure}
        role="toolbar"
        aria-label="Filters"
        className={cn(
          "flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto px-3 py-1.5 scrollbar-none",
          // A soft edge says "there's more this way".
          fade.right && "[mask-image:linear-gradient(to_right,black_calc(100%-28px),transparent)]",
          fade.left &&
            !fade.right &&
            "[mask-image:linear-gradient(to_left,black_calc(100%-28px),transparent)]",
          fade.left &&
            fade.right &&
            "[mask-image:linear-gradient(to_right,transparent,black_28px,black_calc(100%-28px),transparent)]"
        )}
      >
        {props.isLater ? (
          <>
            {(
              [
                ["queue", t("Later")],
                ...(props.snoozedCount > 0 || laterTab === "snoozed"
                  ? [["snoozed", t("Snoozed")]]
                  : []),
                ["archive", t("Archive")],
                ["highlights", t("Highlights")],
                ["collections", t("Collections")],
              ] as [LaterTab, string][]
            ).map(([id, label]) => (
              <Chip
                key={id}
                active={laterTab === id}
                onClick={(event) => {
                  scrollIntoView(event);
                  setLaterTab(id);
                }}
              >
                {label}
              </Chip>
            ))}
          </>
        ) : (
          <>
            <Chip active={filterTab === "unread"} onClick={() => toggleFilter("unread")}>
              {t("Unread")}
            </Chip>
            <Chip active={filterTab === "saved"} onClick={() => toggleFilter("saved")}>
              {t("Saved")}
            </Chip>
            <LayoutSwitch value={props.layout} onChange={props.onLayout} />

            {view.type === "youtube" && (
              <>
                <Divider />
                {VIDEO_KINDS.map((option) => (
                  <Chip
                    key={option.id}
                    active={videoKind === option.id}
                    onClick={(event) => {
                      scrollIntoView(event);
                      setVideoKind(option.id);
                    }}
                  >
                    {option.id === "short" && <Smartphone className="h-3.5 w-3.5" />}
                    {t(option.label)}
                  </Chip>
                ))}
                {videoKind !== "short" &&
                  VIDEO_LENGTHS.map((option) => (
                    <Chip
                      key={option.id}
                      quiet
                      active={videoLength === option.id}
                      onClick={(event) => {
                        scrollIntoView(event);
                        setVideoLength(videoLength === option.id ? null : option.id);
                      }}
                    >
                      {t(option.label)}
                    </Chip>
                  ))}
              </>
            )}

            {view.type === "newsletters" && (
              <>
                <Divider />
                <Chip
                  active={newsletterKind === "web"}
                  onClick={() => setNewsletterKind(newsletterKind === "web" ? null : "web")}
                >
                  {t("Substack & web")}
                </Chip>
                <Chip
                  active={newsletterKind === "email"}
                  onClick={() => setNewsletterKind(newsletterKind === "email" ? null : "email")}
                >
                  {t("Email")}
                </Chip>
              </>
            )}

            {view.type === "podcasts" && (
              <>
                <Divider />
                <Chip
                  active={podcastKind === "progress"}
                  onClick={() => setPodcastKind(podcastKind === "progress" ? "latest" : "progress")}
                >
                  <Hourglass className="h-3.5 w-3.5" /> {t("In progress")}
                </Chip>
              </>
            )}

            {category.options.length > 0 && (
              <>
                <Divider />
                {category.options.map((option) => (
                  <Chip
                    key={option.id}
                    quiet
                    active={category.selected === option.id}
                    onClick={(event) => {
                      scrollIntoView(event);
                      category.toggle(option.id);
                    }}
                  >
                    {option.color && (
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: option.color }}
                        aria-hidden
                      />
                    )}
                    {option.name}
                  </Chip>
                ))}
              </>
            )}
          </>
        )}
      </div>

      <div className="flex shrink-0 items-center pr-2">
        <button
          type="button"
          onClick={props.onRefresh}
          disabled={props.refreshing}
          aria-label="Refresh feeds"
          className="hidden h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground md:flex"
        >
          <RefreshCw className={cn("h-4 w-4", props.refreshing && "animate-spin")} />
        </button>
        <OptionsMenu {...props} />
      </div>
    </div>
  );
}

function OptionsMenu(props: ListToolbarProps) {
  const { view, sort, setSort, newsletterKind, laterTab, setMobilePane } = useReaderState();
  const { t } = useT();
  const add = TAB_ADD[view.type];
  const sourceTab = isSourceTab(view.type);
  const [catchUp, setCatchUp] = React.useState(false);
  // The catch-up reads a pile of unread articles: lists of sources, not Later or Alerts.
  const canCatchUp =
    !props.isLater &&
    view.type !== "alerts" &&
    view.type !== "today" &&
    view.type !== "saved" &&
    props.canMarkAllRead;
  const canSort =
    !props.ranked && !(props.isLater && laterTab !== "queue" && laterTab !== "archive");
  const info = props.isLater
    ? laterTab === "queue"
      ? `${props.total} to read${props.minutes ? ` · ${props.formatMinutes(props.minutes)}` : ""}`
      : laterTab === "archive"
        ? `${props.total} finished`
        : laterTab === "snoozed"
          ? `${props.total} coming back later`
          : null
    : [
        props.ranked
          ? props.learnedFrom
            ? `Learned from ${props.learnedFrom} articles`
            : "Ranked for you"
          : null,
        props.lastFetched
          ? `Updated ${formatRelativeTime(props.lastFetched)}`
          : "Not refreshed yet",
      ]
        .filter(Boolean)
        .join(" · ");

  return (
    <>
      {canCatchUp && <CatchUpSheet open={catchUp} onOpenChange={setCatchUp} />}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="List options"
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground data-[state=open]:bg-accent"
          >
            <MoreHorizontal className="h-5 w-5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          {info && (
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              {info}
            </DropdownMenuLabel>
          )}
          {view.type === "alerts" && (
            <DropdownMenuItem onSelect={() => requestAppEvent("content-filters")} className="gap-2">
              <Bell className="h-4 w-4" /> {t("Alert rules")}
            </DropdownMenuItem>
          )}
          {props.isLater && laterTab === "queue" && (
            <>
              <DropdownMenuItem onSelect={props.onSaveLink} className="gap-2">
                <Plus className="h-4 w-4" /> {t("Save a link")}
              </DropdownMenuItem>
              {props.onListen && (
                <DropdownMenuItem onSelect={props.onListen} className="gap-2">
                  <Headphones className="h-4 w-4" /> {t("Listen to Later")}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem asChild className="gap-2">
                <a href="/api/later/epub" download>
                  <BookDown className="h-4 w-4" /> {t("Download as EPUB")}
                </a>
              </DropdownMenuItem>
            </>
          )}
          {view.type === "podcasts" && (
            <DropdownMenuItem onSelect={() => requestAppEvent("find-episodes")} className="gap-2">
              <Search className="h-4 w-4" /> {t("Find episodes")}
            </DropdownMenuItem>
          )}
          {add && (
            <DropdownMenuItem
              onSelect={() =>
                view.type === "newsletters" && newsletterKind === "email"
                  ? requestAppEvent("email-newsletter")
                  : props.onAddFeed(add.kind)
              }
              className="gap-2"
            >
              {view.type === "podcasts" ? (
                <Headphones className="h-4 w-4" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {t(add.label)}
            </DropdownMenuItem>
          )}
          {sourceTab && (
            <DropdownMenuItem onSelect={() => setMobilePane("sidebar")} className="gap-2 md:hidden">
              <ListTree className="h-4 w-4" />
              {view.type === "youtube" ? t("Channels") : t("Sources")}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onSelect={props.onRefresh}
            disabled={props.refreshing}
            className="gap-2 md:hidden"
          >
            <RefreshCw className="h-4 w-4" /> {t("Refresh feeds")}
          </DropdownMenuItem>
          {canCatchUp && (
            <DropdownMenuItem onSelect={() => setCatchUp(true)} className="gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> {t("Catch me up")}
            </DropdownMenuItem>
          )}
          {!props.isLater && (
            <DropdownMenuItem
              onSelect={props.onMarkAllRead}
              disabled={props.markingAllRead || !props.canMarkAllRead}
              className="gap-2"
            >
              <CheckCheck className="h-4 w-4" /> {t("Mark all as read")}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="flex items-center gap-1.5 text-xs">
            {props.layout === "magazine" ? (
              <Newspaper className="h-3.5 w-3.5" />
            ) : props.layout === "grid" ? (
              <Grid2x2 className="h-3.5 w-3.5" />
            ) : props.layout === "cards" ? (
              <LayoutGrid className="h-3.5 w-3.5" />
            ) : (
              <Rows3 className="h-3.5 w-3.5" />
            )}
            Layout
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={props.layout}
            onValueChange={(value) => props.onLayout(value as ListLayout)}
          >
            <DropdownMenuRadioItem value="magazine">{t("Magazine")}</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="list">{t("Compact list")}</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="cards">{t("Big pictures")}</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="grid">{t("Grid")}</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          {canSort && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="flex items-center gap-1.5 text-xs">
                <ArrowDownUp className="h-3.5 w-3.5" /> {t("Sort")}
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={sort}
                onValueChange={(value) => setSort(value as "newest" | "oldest")}
              >
                <DropdownMenuRadioItem value="newest">{t("Newest first")}</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="oldest">{t("Oldest first")}</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
