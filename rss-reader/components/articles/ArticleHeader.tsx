"use client";

import {
  AlarmClock,
  Archive,
  ArchiveRestore,
  Bookmark,
  Check,
  ExternalLink,
  FolderPlus,
  Share2,
} from "lucide-react";
import { shareLink } from "@/lib/share";
import { cn, readingTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FeedFavicon } from "@/components/shared/FeedFavicon";
import { articleSource } from "@/components/articles/ArticleCard";
import { requestSourceSheet } from "@/lib/app-events";
import { SnoozeMenu, isSnoozed } from "@/components/articles/SnoozeMenu";
import { formatSnooze } from "@/lib/snooze";
import type { ArticleSummary } from "@/lib/types";
import { durationLabel } from "@/lib/hooks/useVideo";
import { useT } from "@/lib/i18n";

interface ArticleHeaderProps {
  article: ArticleSummary;
  onToggleSave: () => void;
  onToggleRead: () => void;
  onToggleArchive: () => void;
  onCollect?: () => void;
}

export function ArticleHeader({
  article,
  onToggleSave,
  onToggleRead,
  onToggleArchive,
  onCollect,
}: ArticleHeaderProps) {
  const { t } = useT();
  const source = articleSource(article);
  const isSavedLink = article.feed.type === "manual";

  const publishedDate = new Date(article.publishedAt).toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="space-y-4 border-b pb-6">
      <button
        type="button"
        disabled={isSavedLink}
        onClick={() => requestSourceSheet(article.feedId)}
        title={`About ${source.name}`}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <FeedFavicon title={source.name} faviconUrl={source.faviconUrl} size={18} />
        <span className="font-medium">{source.name}</span>
      </button>

      <h1 className="text-balance tracking-tight text-[28px] font-bold leading-tight text-foreground md:text-[34px]">
        {article.title}
      </h1>
      {article.originalTitle && article.originalTitle !== article.title && (
        <p className="-mt-1 text-sm text-muted-foreground">
          <span className="font-medium">{t("Creator's title")}:</span> {article.originalTitle}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
        {article.author && <span>{article.author}</span>}
        {article.author && <span aria-hidden>·</span>}
        <span>{publishedDate}</span>
        <span aria-hidden>·</span>
        <span>
          {article.isVideo
            ? article.liveStatus === "upcoming"
              ? t("Upcoming")
              : article.liveStatus === "live"
                ? t("Live now")
                : article.isShort
                  ? t("Short")
                  : article.durationSeconds
                    ? `${durationLabel(article.durationSeconds)} video`
                    : t("Video")
            : article.audioUrl
              ? article.durationSeconds
                ? `${durationLabel(article.durationSeconds)} episode`
                : t("Episode")
              : article.readingMinutes
                ? `${article.readingMinutes} min read`
                : readingTime(article.content || article.summary)}
        </span>
      </div>

      <div className="hidden flex-wrap items-center gap-2 md:flex">
        <Button
          variant={article.isSaved ? "default" : "outline"}
          size="sm"
          className="gap-1.5"
          onClick={onToggleSave}
        >
          <Bookmark className={cn("h-3.5 w-3.5", article.isSaved && "fill-current")} />
          {article.isSaved ? t("In Later") : t("Read later")}
        </Button>
        {article.isSaved && (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={onToggleArchive}>
            {article.archivedAt ? (
              <ArchiveRestore className="h-3.5 w-3.5" />
            ) : (
              <Archive className="h-3.5 w-3.5" />
            )}
            {article.archivedAt ? t("Unarchive") : t("Archive")}
          </Button>
        )}
        {onCollect && (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={onCollect}>
            <FolderPlus className="h-3.5 w-3.5" /> {t("Collect")}
          </Button>
        )}
        <SnoozeMenu article={article} align="start">
          <Button variant="outline" size="sm" className="gap-1.5">
            <AlarmClock className="h-3.5 w-3.5" />
            {isSnoozed(article) ? `Snoozed · ${formatSnooze(article.snoozedUntil!)}` : t("Snooze")}
          </Button>
        </SnoozeMenu>
        <Button variant="outline" size="sm" className="gap-1.5" asChild>
          <a href={article.link} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-3.5 w-3.5" /> {t("Open original")}
          </a>
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={onToggleRead}>
          <Check className="h-3.5 w-3.5" />
          {article.isRead ? t("Mark unread") : t("Mark read")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => shareLink(article.title, article.link)}
        >
          <Share2 className="h-3.5 w-3.5" /> {t("Share")}
        </Button>
      </div>
    </div>
  );
}
