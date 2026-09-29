"use client";

import * as React from "react";
import {
  AlarmClock,
  Archive,
  ArchiveRestore,
  Bookmark,
  Check,
  ChevronDown,
  Highlighter,
  Layers,
  Play,
  TrendingUp,
} from "lucide-react";
import { cn, formatRelativeTime, readingTime, stripHtml } from "@/lib/utils";
import { FeedFavicon } from "@/components/shared/FeedFavicon";
import { Highlight } from "@/components/shared/Highlight";
import type { ArticleSummary } from "@/lib/types";
import { haptic } from "@/lib/native";
import { SnoozeMenu, isSnoozed } from "@/components/articles/SnoozeMenu";
import { formatSnooze } from "@/lib/snooze";

interface ArticleCardProps {
  article: ArticleSummary;
  active: boolean;
  searchQuery?: string;
  onClick: () => void;
  onToggleSave: () => void;
  onSelectRelated?: (article: ArticleSummary) => void;
  /** Shown for Read Later items: archive (or restore) without opening. */
  onArchive?: () => void;
  /** Swipe left on phones. */
  onToggleRead?: () => void;
  /** "cards": a big picture on top (News, YouTube); "list": a thumbnail on the side. */
  layout?: "list" | "cards";
}

const SWIPE_TRIGGER = 80;
const SWIPE_MAX = 120;

/** Where an article came from: its feed, or the site's domain for saved links. */
export function articleSource(article: ArticleSummary) {
  if (article.feed.type !== "manual") {
    return { name: article.feed.title, faviconUrl: article.feed.faviconUrl };
  }
  const host = new URL(article.link).hostname.replace(/^www\./, "");
  return {
    name: host,
    faviconUrl: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`,
  };
}

export function ArticleCard({
  article,
  active,
  searchQuery,
  onClick,
  onToggleSave,
  onSelectRelated,
  onArchive,
  onToggleRead,
  layout = "list",
}: ArticleCardProps) {
  const [showRelated, setShowRelated] = React.useState(false);
  const [imageFailed, setImageFailed] = React.useState(false);
  const summary = article.summary || stripHtml(article.content).slice(0, 200);
  const source = articleSource(article);
  const progress = article.readProgress ?? 0;
  const showImage = article.imageUrl && !imageFailed;
  // Without a picture, a card falls back to the list look.
  const big = layout === "cards" && Boolean(showImage);

  // Keep the open article visible in the list when the reader moves to the next one.
  const cardRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (active) cardRef.current?.scrollIntoView({ block: "nearest" });
  }, [active]);

  // Phones: swipe right for Later, left to toggle read. Vertical scrolling stays native
  // (touch-action: pan-y), so only sideways drags reach this.
  const [dx, setDx] = React.useState(0);
  const drag = React.useRef<{
    x: number;
    y: number;
    horizontal: boolean | null;
    dx: number;
  } | null>(null);
  const swiped = React.useRef(false);

  function onTouchStart(event: React.TouchEvent) {
    const t = event.touches[0];
    drag.current = { x: t.clientX, y: t.clientY, horizontal: null, dx: 0 };
  }
  function onTouchMove(event: React.TouchEvent) {
    const d = drag.current;
    if (!d) return;
    const t = event.touches[0];
    const mx = t.clientX - d.x;
    const my = t.clientY - d.y;
    if (d.horizontal === null && (Math.abs(mx) > 10 || Math.abs(my) > 10)) {
      d.horizontal = Math.abs(mx) > Math.abs(my) * 1.3;
    }
    if (!d.horizontal) return;
    const limited = onToggleRead ? mx : Math.max(0, mx);
    const next = Math.max(-SWIPE_MAX, Math.min(SWIPE_MAX, limited));
    // A tick when the swipe starts to count, like native list actions.
    if (Math.abs(next) >= SWIPE_TRIGGER !== Math.abs(d.dx) >= SWIPE_TRIGGER) haptic();
    d.dx = next;
    setDx(d.dx);
  }
  function onTouchEnd() {
    // Read from the ref: a quick flick can end before React re-renders with the new dx.
    const moved = drag.current?.dx ?? 0;
    drag.current = null;
    setDx(0);
    if (Math.abs(moved) < 12) return;
    swiped.current = true;
    // Only swallow the click that some browsers fire right after the swipe.
    window.setTimeout(() => (swiped.current = false), 400);
    if (moved >= SWIPE_TRIGGER) onToggleSave();
    else if (moved <= -SWIPE_TRIGGER) onToggleRead?.();
  }

  return (
    <div
      ref={cardRef}
      className="relative overflow-hidden"
      style={{ touchAction: "pan-y" }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {dx !== 0 && (
        <div
          className={cn(
            "absolute inset-0 flex items-center px-6 text-sm font-semibold text-white",
            dx > 0 ? "justify-start bg-primary" : "justify-end bg-emerald-600"
          )}
          aria-hidden
        >
          {dx > 0 ? (
            <span className="flex items-center gap-2">
              <Bookmark
                className={cn("h-5 w-5", Math.abs(dx) >= SWIPE_TRIGGER && "fill-current")}
              />
              {article.isSaved ? "Remove from Later" : "Read later"}
            </span>
          ) : (
            <span className="flex items-center gap-2">
              {article.isRead ? "Mark unread" : "Mark read"}
              <Check className="h-5 w-5" />
            </span>
          )}
        </div>
      )}
      <div
        role="button"
        tabIndex={0}
        onClick={() => {
          // A swipe ends with a click on some browsers; it shouldn't open the article.
          if (swiped.current) {
            swiped.current = false;
            return;
          }
          onClick();
        }}
        style={dx ? { transform: `translateX(${dx}px)` } : undefined}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick();
          }
        }}
        className={cn(
          "group relative flex w-full cursor-pointer border-b border-border/60 bg-background px-4 py-4 text-left md:px-5",
          big ? "flex-col gap-3" : "gap-4",
          !dx && "transition-transform duration-200",
          active ? "bg-accent" : "hover:bg-accent/60"
        )}
      >
        {active && <span className="absolute inset-y-0 left-0 w-[3px] bg-primary" aria-hidden />}

        <div
          className={cn(
            "relative shrink-0",
            big ? "aspect-video w-full" : "mt-0.5 h-14 w-14 md:h-16 md:w-16"
          )}
        >
          <div
            className={cn(
              "flex items-center justify-center overflow-hidden bg-muted ring-1 ring-border/60",
              // Pinned to the 16:9 box, or the picture's own height would stretch it.
              big ? "absolute inset-0 rounded-xl" : "h-full w-full rounded-lg"
            )}
          >
            {showImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={article.imageUrl!}
                alt=""
                loading="lazy"
                className={cn("h-full w-full object-cover", article.isRead && "opacity-60")}
                onError={() => setImageFailed(true)}
              />
            ) : (
              <FeedFavicon title={source.name} faviconUrl={source.faviconUrl} size={26} />
            )}
            {article.isVideo && (
              <span className="absolute inset-0 flex items-center justify-center">
                <span
                  className={cn(
                    "flex items-center justify-center rounded-full bg-black/65 text-white",
                    big ? "h-12 w-12" : "h-7 w-7"
                  )}
                >
                  <Play className={cn("ml-0.5 fill-current", big ? "h-5 w-5" : "h-3.5 w-3.5")} />
                </span>
              </span>
            )}
          </div>
          {!article.isRead && (
            <span
              className={cn(
                "absolute h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-background",
                big ? "left-2.5 top-2.5" : "-left-1 -top-1"
              )}
              aria-label="Unread"
            />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <h3
              className={cn(
                "line-clamp-2 flex-1 text-[15px] leading-snug tracking-tight",
                article.isRead
                  ? "font-medium text-muted-foreground"
                  : "font-semibold text-foreground"
              )}
            >
              <Highlight text={article.title} query={searchQuery} />
            </h3>
            <time
              dateTime={article.publishedAt}
              className="hidden shrink-0 pt-0.5 text-xs text-muted-foreground sm:block"
            >
              {formatRelativeTime(article.publishedAt)}
            </time>
          </div>

          {summary && (
            <p className="mt-1 line-clamp-1 text-[13px] text-muted-foreground">
              <Highlight text={summary} query={searchQuery} />
            </p>
          )}

          <div className="mt-1.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <FeedFavicon title={source.name} faviconUrl={source.faviconUrl} size={14} />
            {/* Keeps a few letters of a long name visible; a short one keeps its own width. */}
            <span className={cn("truncate", source.name.length > 6 && "min-w-[3.5rem]")}>
              {source.name}
            </span>
            {article.author && article.author !== source.name && (
              <>
                <span aria-hidden className="hidden sm:inline">
                  ·
                </span>
                <span className="hidden truncate sm:inline">{article.author}</span>
              </>
            )}
            <span aria-hidden>·</span>
            <span className="shrink-0">
              {article.isVideo
                ? "Video"
                : article.readingMinutes
                  ? `${article.readingMinutes} min`
                  : readingTime(article.content || article.summary)}
            </span>
            <span aria-hidden className="sm:hidden">
              ·
            </span>
            <span className="shrink-0 sm:hidden">{formatRelativeTime(article.publishedAt)}</span>
            {article.boosted && (
              <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-primary/15 px-1.5 py-px text-[10.5px] font-semibold text-primary">
                <TrendingUp className="h-3 w-3" /> Boosted
              </span>
            )}
            {isSnoozed(article) && (
              <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-amber-500/15 px-1.5 py-px text-[10.5px] font-semibold text-amber-600 dark:text-amber-400">
                <AlarmClock className="h-3 w-3" /> {formatSnooze(article.snoozedUntil!)}
              </span>
            )}
            {(article.highlightCount ?? 0) > 0 && (
              <span
                className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-medium"
                title={`${article.highlightCount} highlight${article.highlightCount === 1 ? "" : "s"}`}
              >
                <Highlighter className="h-3 w-3" /> {article.highlightCount}
              </span>
            )}
            {article.isPromo && (
              <span className="shrink-0 rounded bg-muted px-1.5 py-px text-[10.5px] font-semibold">
                Sponsored
              </span>
            )}
            {/* Touch screens: actions sit inline, since there's no hover. */}
            <CardActions
              article={article}
              onToggleSave={onToggleSave}
              onArchive={onArchive}
              className="-my-1.5 ml-auto [@media(hover:hover)]:hidden"
            />
          </div>

          {article.topic && article.topic.related.length > 0 && (
            <RelatedCoverage
              article={article}
              expanded={showRelated}
              onToggle={() => setShowRelated((v) => !v)}
              onSelect={onSelectRelated}
            />
          )}

          {progress > 0 && (
            <div
              className="mt-3 h-[3px] overflow-hidden rounded-full bg-border"
              role="progressbar"
              aria-label="Reading progress"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>

        {/* Mouse: actions appear over the date on hover, like Readwise. */}
        <CardActions
          article={article}
          onToggleSave={onToggleSave}
          onArchive={onArchive}
          className={cn(
            "absolute right-3 top-3 hidden rounded-lg border bg-popover p-0.5 shadow-sm md:right-4",
            "opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100",
            "[@media(hover:hover)]:flex"
          )}
        />
      </div>
    </div>
  );
}

function CardActions({
  article,
  onToggleSave,
  onArchive,
  className,
}: {
  article: ArticleSummary;
  onToggleSave: () => void;
  onArchive?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn("flex shrink-0 items-center gap-0.5", className)}
      onClick={(e) => e.stopPropagation()}
    >
      <SnoozeMenu article={article}>
        <button
          type="button"
          className={cn(
            "rounded-md p-1.5 hover:bg-accent",
            isSnoozed(article) ? "text-amber-500" : "text-muted-foreground hover:text-foreground"
          )}
          aria-label="Snooze"
          title="Snooze"
        >
          <AlarmClock className="h-4 w-4" />
        </button>
      </SnoozeMenu>
      {onArchive && (
        <button
          type="button"
          onClick={onArchive}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label={article.archivedAt ? "Move back to Later" : "Archive"}
          title={article.archivedAt ? "Move back to Later" : "Archive"}
        >
          {article.archivedAt ? (
            <ArchiveRestore className="h-4 w-4" />
          ) : (
            <Archive className="h-4 w-4" />
          )}
        </button>
      )}
      <button
        type="button"
        onClick={onToggleSave}
        className={cn(
          "rounded-md p-1.5 hover:bg-accent",
          article.isSaved ? "text-primary" : "text-muted-foreground hover:text-foreground"
        )}
        aria-label={article.isSaved ? "Remove from Later" : "Read later"}
        title={article.isSaved ? "Remove from Later" : "Read later"}
      >
        <Bookmark className={cn("h-4 w-4", article.isSaved && "fill-current")} />
      </button>
    </div>
  );
}

function RelatedCoverage({
  article,
  expanded,
  onToggle,
  onSelect,
}: {
  article: ArticleSummary;
  expanded: boolean;
  onToggle: () => void;
  onSelect?: (article: ArticleSummary) => void;
}) {
  const others = article.topic!.sources.filter((s) => s !== article.feed.title);
  const label =
    others.length <= 2
      ? others.join(" and ")
      : `${others.slice(0, 2).join(", ")} +${others.length - 2}`;

  return (
    <div className="mt-2.5 rounded-lg bg-muted/60" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-xs text-muted-foreground hover:text-foreground"
      >
        <Layers className="h-3.5 w-3.5 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate">
          Also covered by <span className="font-medium text-foreground/80">{label}</span>
        </span>
        <ChevronDown
          className={cn("h-3.5 w-3.5 shrink-0 transition-transform", expanded && "rotate-180")}
        />
      </button>
      {expanded && (
        <ul className="border-t border-border/60 py-1">
          {article.topic!.related.map((related) => (
            <li key={related.id}>
              <button
                type="button"
                onClick={() => onSelect?.(related)}
                className="flex w-full items-start gap-2 px-2.5 py-1.5 text-left hover:bg-accent/60"
              >
                <FeedFavicon
                  title={related.feed.title}
                  faviconUrl={related.feed.faviconUrl}
                  size={14}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] text-muted-foreground">
                    {related.feed.title}
                  </span>
                  <span className="line-clamp-2 text-[13px] font-medium leading-snug text-foreground">
                    {related.title}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
