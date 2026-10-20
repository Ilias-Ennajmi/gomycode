"use client";

import * as React from "react";
import useSWR from "swr";
import { useInView } from "react-intersection-observer";
import {
  Copy,
  Download,
  Highlighter,
  Image as ImageIcon,
  Loader2,
  Play,
  Scissors,
  Search,
  Share2,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn, formatRelativeTime } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FeedFavicon } from "@/components/shared/FeedFavicon";
import { HIGHLIGHT_SWATCH, shareQuote } from "@/components/highlights/ReaderHighlights";
import { deleteHighlight, useHighlightList } from "@/lib/hooks/useHighlights";
import { requestHighlightJump } from "@/lib/highlight-dom";
import { shareQuoteImage } from "@/lib/quote-card";
import { requestStartAt } from "@/lib/start-at";
import { clockLabel } from "@/lib/snips";
import { TagEditor } from "@/components/highlights/TagEditor";
import { useReaderState } from "@/lib/hooks/useReaderState";
import type { HighlightColor, HighlightSummary } from "@/lib/types";

const COLORS = Object.keys(HIGHLIGHT_SWATCH) as HighlightColor[];

/** Later → Highlights: every passage and note, newest first, searchable and exportable. */
export function HighlightsList() {
  const [draft, setDraft] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [color, setColor] = React.useState<HighlightColor | null>(null);
  const [tag, setTag] = React.useState<string | null>(null);
  const { data: tagData } = useSWR<{ tags: { tag: string; count: number }[] }>(
    "/api/highlights/tags"
  );
  const tags = tagData?.tags ?? [];
  React.useEffect(() => {
    const timeout = setTimeout(() => setSearch(draft), 250);
    return () => clearTimeout(timeout);
  }, [draft]);

  const { highlights, total, hasMore, isLoading, loadMore } = useHighlightList(search, color, tag);
  const { ref: sentinel, inView } = useInView({ rootMargin: "200px" });
  React.useEffect(() => {
    if (inView && hasMore) loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, hasMore]);

  const filtered = Boolean(search || color || tag);

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
            <a
              href={
                tag
                  ? `/api/highlights/export?tag=${encodeURIComponent(tag)}`
                  : "/api/highlights/export"
              }
              download
            >
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
        {tags.length > 0 && (
          <div
            className="-mx-3 flex gap-1.5 overflow-x-auto px-3 scrollbar-none"
            role="toolbar"
            aria-label="Filter by tag"
          >
            {tags.map(({ tag: name, count }) => (
              <button
                key={name}
                type="button"
                onClick={() => setTag(tag === name ? null : name)}
                aria-pressed={tag === name}
                className={cn(
                  "inline-flex h-6 shrink-0 items-center gap-1 rounded-full border px-2.5 text-xs font-medium transition-colors",
                  tag === name
                    ? "border-primary bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent"
                )}
              >
                #{name}
                <span className="opacity-70">{count}</span>
              </button>
            ))}
          </div>
        )}
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

  const snip = highlight.kind === "snip";
  const start = highlight.startSeconds ?? 0;

  function open() {
    if (!article) return;
    if (snip) requestStartAt(article.id, start);
    else requestHighlightJump(highlight.id);
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
            {snip && (
              <span className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
                <Scissors className="h-3 w-3" /> Snip · {clockLabel(start)}
                {highlight.endSeconds ? `–${clockLabel(highlight.endSeconds)}` : ""}
              </span>
            )}
            {snip && highlight.title && (
              <span className="block text-[15px] font-semibold leading-snug">
                {highlight.title}
              </span>
            )}
            <span
              className={cn(
                snip
                  ? "mt-1 line-clamp-4 text-sm leading-relaxed text-muted-foreground"
                  : "line-clamp-6 font-serif text-[16px] leading-relaxed"
              )}
            >
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
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {snip && article && (
              <button
                type="button"
                onClick={open}
                className="flex h-7 items-center gap-1.5 rounded-full bg-primary/10 px-2.5 text-xs font-semibold text-primary hover:bg-primary/20"
              >
                <Play className="h-3 w-3 fill-current" /> Play from {clockLabel(start)}
              </button>
            )}
            <TagEditor highlight={highlight} />
          </div>
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
          <IconButton
            label="Share as a picture"
            onClick={() =>
              shareQuoteImage({
                text: highlight.text,
                color: highlight.color,
                title: snip ? undefined : article?.title,
                source: snip
                  ? [article?.title, article?.feed.title].filter(Boolean).join(" · ")
                  : article?.feed.title,
                moment: snip
                  ? `${clockLabel(start)}${highlight.endSeconds ? ` – ${clockLabel(highlight.endSeconds)}` : ""}`
                  : undefined,
              }).catch((error) =>
                toast.error(error instanceof Error ? error.message : "Could not make the picture")
              )
            }
          >
            <ImageIcon className="h-3.5 w-3.5" />
          </IconButton>
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
