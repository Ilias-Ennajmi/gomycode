"use client";

import * as React from "react";
import { AlarmClock, Archive, ArchiveRestore, Bookmark, ChevronDown, Layers } from "lucide-react";
import { cn, formatRelativeTime, readingTime, stripHtml } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { FeedFavicon } from "@/components/shared/FeedFavicon";
import type { ArticleSummary } from "@/lib/types";
import { SnoozeMenu, isSnoozed } from "@/components/articles/SnoozeMenu";
import { clock, durationLabel } from "@/lib/hooks/useVideo";

export function CardActions({
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
  const { t } = useT();
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
          aria-label={t("Snooze")}
          title={t("Snooze")}
        >
          <AlarmClock className="h-4 w-4" />
        </button>
      </SnoozeMenu>
      {onArchive && (
        <button
          type="button"
          onClick={onArchive}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label={article.archivedAt ? t("Move back to Later") : t("Archive")}
          title={article.archivedAt ? t("Move back to Later") : t("Archive")}
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
        aria-label={article.isSaved ? t("Remove from Later") : t("Read later")}
        title={article.isSaved ? t("Remove from Later (S)") : t("Read later (S)")}
      >
        <Bookmark
          // A new key on each change replays the little pop when it becomes saved.
          key={String(article.isSaved)}
          className={cn("h-4 w-4", article.isSaved && "animate-pop fill-current")}
        />
      </button>
    </div>
  );
}

export function RelatedCoverage({
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
  const { t } = useT();
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
          {t("Also covered by")} <span className="font-medium text-foreground/80">{t(label)}</span>
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

/** On a video's picture: its length, or Short / Live / Upcoming. */
export function VideoBadge({ article, big }: { article: ArticleSummary; big: boolean }) {
  const { t } = useT();
  const label =
    article.liveStatus === "live"
      ? "Live"
      : article.liveStatus === "upcoming"
        ? "Upcoming"
        : article.isShort
          ? "Short"
          : article.durationSeconds
            ? clock(article.durationSeconds)
            : null;
  if (!label) return null;
  return (
    <span
      className={cn(
        "absolute rounded font-semibold tabular-nums text-white",
        big
          ? "bottom-2 right-2 px-1.5 py-0.5 text-xs"
          : "bottom-1 right-1 px-1 text-[9.5px] leading-[14px]",
        article.liveStatus === "live" ? "bg-red-600" : "bg-black/80"
      )}
    >
      {t(label)}
    </span>
  );
}

/** The top of the long-press sheet: enough of the piece to decide without opening it. */
export function QuickLook({
  article,
  sourceName,
}: {
  article: ArticleSummary;
  sourceName: string;
}) {
  const [broken, setBroken] = React.useState(false);
  const text = (article.aiSummary || stripHtml(article.summary || article.content || "")).slice(
    0,
    480
  );
  const length = article.durationSeconds
    ? durationLabel(article.durationSeconds)
    : article.audioUrl || article.isVideo
      ? null
      : article.readingMinutes
        ? `${article.readingMinutes} min`
        : readingTime(article.content || article.summary);
  return (
    <div className="mb-2 border-b px-3 pb-3">
      {article.imageUrl && !broken && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={article.imageUrl}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
          className="dim-dark mb-3 aspect-[16/9] w-full rounded-xl bg-muted object-cover"
        />
      )}
      <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
        <span className="font-medium text-foreground/80">{sourceName}</span>
        <span aria-hidden>·</span>
        <span>{formatRelativeTime(article.publishedAt)}</span>
        {length && (
          <>
            <span aria-hidden>·</span>
            <span>{length}</span>
          </>
        )}
      </p>
      {text && (
        <p className="mt-1.5 line-clamp-5 text-[14px] leading-relaxed text-foreground/85">{text}</p>
      )}
    </div>
  );
}
