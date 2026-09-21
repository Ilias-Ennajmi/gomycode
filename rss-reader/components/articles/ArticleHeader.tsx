"use client";

import { Bookmark, Check, ExternalLink, Share2 } from "lucide-react";
import { toast } from "sonner";
import { cn, readingTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FeedFavicon } from "@/components/shared/FeedFavicon";
import { useReaderState } from "@/lib/hooks/useReaderState";
import type { ArticleSummary } from "@/lib/types";

interface ArticleHeaderProps {
  article: ArticleSummary;
  onToggleSave: () => void;
  onToggleRead: () => void;
}

export function ArticleHeader({ article, onToggleSave, onToggleRead }: ArticleHeaderProps) {
  const { setView } = useReaderState();

  async function handleShare() {
    if (navigator.share) {
      try {
        await navigator.share({ title: article.title, url: article.link });
        return;
      } catch {
        // user cancelled or share failed — fall back to clipboard
      }
    }
    await navigator.clipboard.writeText(article.link);
    toast.success("Link copied to clipboard");
  }

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
        onClick={() =>
          setView({ type: "feed", id: article.feedId, label: article.feed.title })
        }
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <FeedFavicon title={article.feed.title} faviconUrl={article.feed.faviconUrl} size={18} />
        <span className="font-medium">{article.feed.title}</span>
      </button>

      <h1 className="font-serif text-[28px] font-bold leading-tight text-foreground">
        {article.title}
      </h1>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
        {article.author && <span>{article.author}</span>}
        {article.author && <span aria-hidden>·</span>}
        <span>{publishedDate}</span>
        <span aria-hidden>·</span>
        <span>{readingTime(article.content || article.summary)}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={article.isSaved ? "default" : "outline"}
          size="sm"
          className="gap-1.5"
          onClick={onToggleSave}
        >
          <Bookmark className={cn("h-3.5 w-3.5", article.isSaved && "fill-current")} />
          {article.isSaved ? "Saved" : "Save"}
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" asChild>
          <a href={article.link} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-3.5 w-3.5" /> Open original
          </a>
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={onToggleRead}>
          <Check className="h-3.5 w-3.5" />
          {article.isRead ? "Mark unread" : "Mark read"}
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={handleShare}>
          <Share2 className="h-3.5 w-3.5" /> Share
        </Button>
      </div>
    </header>
  );
}
