"use client";

import * as React from "react";
import useSWR from "swr";
import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Headphones,
  Moon,
  Play,
  SlidersHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { FeedFavicon } from "@/components/shared/FeedFavicon";
import { StoryImage } from "@/components/news/StoryParts";
import { requestAppEvent } from "@/lib/app-events";
import { useHomeBlocks } from "@/lib/hooks/useHomeBlocks";
import { useUnusedSources } from "@/components/sources/SourcesManager";
import { clock } from "@/lib/hooks/useVideo";
import type { ArticleSummary } from "@/lib/types";

/** Today → Customise: show or hide each block, move it up or down. */
export function HomeCustomise({
  open,
  onOpenChange,
  layout,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  layout: ReturnType<typeof useHomeBlocks>;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={
        <span className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-primary" /> Customise Today
        </span>
      }
    >
      <ol className="divide-y px-1" data-scroll>
        {layout.blocks.map((block, i) => (
          <li key={block.id} className="flex items-center gap-1 py-1.5">
            <button
              type="button"
              onClick={() => layout.toggle(block.id)}
              role="switch"
              aria-checked={block.on}
              aria-label={`${block.on ? "Hide" : "Show"} ${block.label}`}
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                block.on ? "text-primary" : "text-muted-foreground"
              )}
            >
              {block.on ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </button>
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-sm",
                !block.on && "text-muted-foreground line-through"
              )}
            >
              {block.label}
            </span>
            <button
              type="button"
              onClick={() => layout.move(block.id, -1)}
              disabled={i === 0}
              aria-label={`Move ${block.label} up`}
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent disabled:opacity-30"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => layout.move(block.id, 1)}
              disabled={i === layout.blocks.length - 1}
              aria-label={`Move ${block.label} down`}
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent disabled:opacity-30"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ol>
      {layout.customised && (
        <div className="px-3 pt-4">
          <Button variant="outline" className="w-full" onClick={layout.reset}>
            Back to the default layout
          </Button>
        </div>
      )}
    </Sheet>
  );
}

/** What was started and not finished: part-read articles, part-played videos and episodes. */
export function ContinueBlock({
  title,
  onOpen,
}: {
  title: (children: React.ReactNode) => React.ReactNode;
  onOpen: (articleId: string) => void;
}) {
  const { data } = useSWR<{ continue: ArticleSummary[] }>("/api/home", {
    revalidateOnFocus: false,
  });
  const items = data?.continue ?? [];
  if (items.length === 0) return null;
  return (
    <section aria-label="Continue where you left off">
      {title("Continue where you left off")}
      <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {items.map((article) => {
          const media = article.isVideo || Boolean(article.audioUrl);
          const played = article.watchedSeconds ?? 0;
          const progress = media
            ? article.durationSeconds
              ? Math.min(100, Math.round((played / article.durationSeconds) * 100))
              : 0
            : (article.readProgress ?? 0);
          const left = media
            ? article.durationSeconds
              ? `${clock(Math.max(0, article.durationSeconds - played))} left`
              : `at ${clock(played)}`
            : article.readingMinutes
              ? `${Math.max(1, Math.round((article.readingMinutes * (100 - progress)) / 100))} min left`
              : `${progress}%`;
          return (
            <li key={article.id}>
              <button
                type="button"
                onClick={() => onOpen(article.id)}
                className="flex w-full items-center gap-3 rounded-2xl border bg-card/60 p-3 text-left transition-colors hover:bg-accent/60"
              >
                {article.imageUrl ? (
                  <span className="relative shrink-0">
                    <StoryImage src={article.imageUrl} className="h-16 w-20 rounded-lg" />
                    {media && (
                      <span className="absolute inset-0 flex items-center justify-center">
                        {article.isVideo ? (
                          <Play className="h-6 w-6 fill-white text-white drop-shadow" />
                        ) : (
                          <Headphones className="h-6 w-6 text-white drop-shadow" />
                        )}
                      </span>
                    )}
                  </span>
                ) : null}
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-sm font-semibold leading-snug">
                    {article.title}
                  </span>
                  <span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <FeedFavicon
                      title={article.feed.title}
                      faviconUrl={article.feed.faviconUrl}
                      size={13}
                    />
                    <span className="truncate">{article.feed.title}</span>
                    <span aria-hidden>·</span>
                    <span className="shrink-0">{left}</span>
                  </span>
                  <span className="mt-2 block h-1 overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full bg-primary"
                      style={{ width: `${Math.max(3, progress)}%` }}
                    />
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Sources with nothing read in two months, one tap from the sources manager. */
export function TidyBlock() {
  const ids = useUnusedSources();
  if (ids.length === 0) return null;
  return (
    <button
      type="button"
      onClick={() => requestAppEvent("sources-unused")}
      className="flex w-full items-center gap-3 rounded-2xl border bg-card/60 p-4 text-left transition-colors hover:bg-accent/60"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <Moon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">Tidy up your sources</span>
        <span className="block text-xs text-muted-foreground">
          {ids.length} source{ids.length === 1 ? "" : "s"} you haven&apos;t read from in two months
        </span>
      </span>
      <span className="rounded-full border px-3 py-1.5 text-xs font-semibold">Review</span>
    </button>
  );
}
