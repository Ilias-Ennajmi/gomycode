"use client";

import {
  AlarmClock,
  Archive,
  ArchiveRestore,
  Bookmark,
  Check,
  ExternalLink,
  Share2,
} from "lucide-react";
import { shareLink } from "@/lib/share";
import { cn, readingTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FeedFavicon } from "@/components/shared/FeedFavicon";
import { articleSource } from "@/components/articles/ArticleCard";
import { useReaderState } from "@/lib/hooks/useReaderState";
import { SnoozeMenu, isSnoozed } from "@/components/articles/SnoozeMenu";
import { formatSnooze } from "@/lib/snooze";
import type { ArticleSummary } from "@/lib/types";

interface ArticleHeaderProps {
  article: ArticleSummary;
  onToggleSave: () => void;
  onToggleRead: () => void;
  onToggleArchive: () => void;
}

export function ArticleHeader({
  article,
  onToggleSave,
  onToggleRead,
  onToggleArchive,
}: ArticleHeaderProps) {
  const { setView } = useReaderState();
  const source = articleSource(article);
  const isSavedLink = article.feed.type === "manual";

  const publishedDate = new Date(article.publishedAt).toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <header className="space-y-4 border-b pb-6">
      <button
        type="button"
        disabled={isSavedLink}
        onClick={() => setView({ type: "feed", id: article.feedId, label: article.feed.title })}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <FeedFavicon title={source.name} faviconUrl={source.faviconUrl} size={18} />
        <span className="font-medium">{source.name}</span>
      </button>

      <h1 className="text-balance tracking-tight text-[28px] font-bold leading-tight text-foreground md:text-[34px]">
        {article.title}
      </h1>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
        {article.author && <span>{article.author}</span>}
        {article.author && <span aria-hidden>·</span>}
        <span>{publishedDate}</span>
        <span aria-hidden>·</span>
        <span>
          {article.isVideo
            ? "Video"
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
          {article.isSaved ? "In Later" : "Read later"}
        </Button>
        {article.isSaved && (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={onToggleArchive}>
            {article.archivedAt ? (
              <ArchiveRestore className="h-3.5 w-3.5" />
            ) : (
              <Archive className="h-3.5 w-3.5" />
            )}
            {article.archivedAt ? "Unarchive" : "Archive"}
          </Button>
        )}
        <SnoozeMenu article={article} align="start">
          <Button variant="outline" size="sm" className="gap-1.5">
            <AlarmClock className="h-3.5 w-3.5" />
            {isSnoozed(article) ? `Snoozed · ${formatSnooze(article.snoozedUntil!)}` : "Snooze"}
          </Button>
        </SnoozeMenu>
        <Button variant="outline" size="sm" className="gap-1.5" asChild>
          <a href={article.link} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-3.5 w-3.5" /> Open original
          </a>
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={onToggleRead}>
          <Check className="h-3.5 w-3.5" />
          {article.isRead ? "Mark unread" : "Mark read"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => shareLink(article.title, article.link)}
        >
          <Share2 className="h-3.5 w-3.5" /> Share
        </Button>
      </div>
    </header>
  );
}
