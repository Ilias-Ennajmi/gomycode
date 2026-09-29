"use client";

import * as React from "react";
import { useInView } from "react-intersection-observer";
import { Copy, Download, Highlighter, Loader2, Search, Share2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { cn, formatRelativeTime } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FeedFavicon } from "@/components/shared/FeedFavicon";
import { HIGHLIGHT_SWATCH, shareQuote } from "@/components/highlights/ReaderHighlights";
import { deleteHighlight, useHighlightList } from "@/lib/hooks/useHighlights";
import { requestHighlightJump } from "@/lib/highlight-dom";
import { useReaderState } from "@/lib/hooks/useReaderState";
import type { HighlightColor, HighlightSummary } from "@/lib/types";

const COLORS = Object.keys(HIGHLIGHT_SWATCH) as HighlightColor[];

/** Later → Highlights: every passage and note, newest first, searchable and exportable. */
export function HighlightsList() {
  const [draft, setDraft] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [color, setColor] = React.useState<HighlightColor | null>(null);
  React.useEffect(() => {
    const timeout = setTimeout(() => setSearch(draft), 250);
    return () => clearTimeout(timeout);
  }, [draft]);

  const { highlights, total, hasMore, isLoading, loadMore } = useHighlightList(search, color);
  const { ref: sentinel, inView } = useInView({ rootMargin: "200px" });
  React.useEffect(() => {
    if (inView && hasMore) loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, hasMore]);

  const filtered = Boolean(search || color);

  return (
    <div>
      <div className="space-y-2 border-b px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Search highlights and notes…"
              enterKeyHint="search"
              className="h-8 pl-8 pr-7"
              aria-label="Search highlights"
            />
            {draft && (
              <button
                type="button"
                onClick={() => setDraft("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" asChild>
            <a href="/api/highlights/export" download>
              <Download className="h-3.5 w-3.5" /> Export
            </a>
          </Button>
        </div>
        <div className="flex items-center gap-1.5" role="toolbar" aria-label="Filter by colour">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(color === c ? null : c)}
              aria-pressed={color === c}
              aria-label={`Only ${c}`}
              className={cn(
                "h-6 w-6 rounded-full ring-1 ring-black/10 transition-transform",
                HIGHLIGHT_SWATCH[c],
                color === c ? "scale-110 ring-2 ring-foreground" : "opacity-80 hover:opacity-100"
              )}
            />
          ))}
          <span className="ml-auto text-xs text-muted-foreground">
            {isLoading ? "" : `${total} highlight${total === 1 ? "" : "s"}`}
          </span>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4 p-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="w-1 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : highlights.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-8 py-16 text-center text-muted-foreground">
          <Highlighter className="h-10 w-10" />
          <p className="max-w-xs text-sm">
            {filtered
              ? "No highlights match."
              : "No highlights yet. Select text in any article to highlight it or add a note."}
          </p>
        </div>
      ) : (
        <ul>
          {highlights.map((h) => (
            <HighlightRow key={h.id} highlight={h} />
          ))}
          {hasMore && (
            <li ref={sentinel} className="flex justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function HighlightRow({ highlight }: { highlight: HighlightSummary }) {
  const { setSelectedArticleId, setMobilePane } = useReaderState();
  const article = highlight.article;

  function open() {
    if (!article) return;
    requestHighlightJump(highlight.id);
    setSelectedArticleId(article.id);
    setMobilePane("reader");
  }

  async function remove() {
    try {
      await deleteHighlight(highlight.id);
      toast.success("Highlight removed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove the highlight");
    }
  }

  return (
    <li className="group border-b">
      <div className="flex gap-3 px-4 py-3.5">
        <span
          className={cn("w-1 shrink-0 rounded-full", HIGHLIGHT_SWATCH[highlight.color])}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <button type="button" onClick={open} className="block w-full text-left">
            <span className="line-clamp-6 font-serif text-[16px] leading-relaxed">
              {highlight.text}
            </span>
            {highlight.note && (
              <span className="mt-1.5 block whitespace-pre-line rounded-lg bg-muted/60 px-2.5 py-1.5 text-sm">
                {highlight.note}
              </span>
            )}
            {article && (
              <span className="mt-2 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                <FeedFavicon
                  title={article.feed.title}
                  faviconUrl={article.feed.faviconUrl}
                  size={14}
                />
                <span className="truncate">
                  <span className="font-medium text-foreground/80">{article.title}</span>
                  {" · "}
                  {formatRelativeTime(highlight.createdAt)}
                </span>
              </span>
            )}
          </button>
        </div>
        <div className="flex shrink-0 flex-col gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100">
          <IconButton
            label="Copy"
            onClick={() =>
              navigator.clipboard.writeText(highlight.text).then(() => toast.success("Copied"))
            }
          >
            <Copy className="h-3.5 w-3.5" />
          </IconButton>
          {article && (
            <IconButton label="Share" onClick={() => shareQuote(highlight.text, article)}>
              <Share2 className="h-3.5 w-3.5" />
            </IconButton>
          )}
          <IconButton label="Remove highlight" onClick={remove}>
            <Trash2 className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      </div>
    </li>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
    >
      {children}
    </button>
  );
}
