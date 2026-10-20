"use client";

import * as React from "react";
import useSWR from "swr";
import { Headphones, Loader2, Play, Plus, Search, Check } from "lucide-react";
import { toast } from "sonner";
import { cn, formatRelativeTime } from "@/lib/utils";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { FeedFavicon } from "@/components/shared/FeedFavicon";
import { durationLabel } from "@/lib/hooks/useVideo";
import { useReaderState } from "@/lib/hooks/useReaderState";
import { useFeeds } from "@/lib/hooks/useFeeds";
import { useT } from "@/lib/i18n";
import { useAudio } from "@/components/audio/AudioProvider";
import type { AppleEpisode } from "@/lib/podcast";

interface MineEpisode {
  id: string;
  title: string;
  imageUrl: string | null;
  publishedAt: string;
  durationSeconds: number | null;
  isRead: boolean;
  feed: { id: string; title: string; faviconUrl: string | null };
}

/**
 * Find episodes, not shows: a topic ("interviews about sleep") finds episodes in the shows
 * followed here and across Apple's catalogue. A catalogue episode plays right away, and its
 * show is one tap to follow.
 */
export function EpisodeSearch({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, locale } = useT();
  const [draft, setDraft] = React.useState("");
  const [query, setQuery] = React.useState("");
  React.useEffect(() => {
    const timer = setTimeout(() => setQuery(draft.trim()), 350);
    return () => clearTimeout(timer);
  }, [draft]);
  const { data, isLoading } = useSWR<{ mine: MineEpisode[]; apple: AppleEpisode[] }>(
    query.length >= 2
      ? `/api/discover/episodes?q=${encodeURIComponent(query)}&lang=${locale}`
      : null,
    { keepPreviousData: true, revalidateOnFocus: false }
  );
  const { setSelectedArticleId, setMobilePane } = useReaderState();
  const audio = useAudio();
  const { feeds, mutate: mutateFeeds } = useFeeds();
  const followed = React.useMemo(() => new Set(feeds.map((f) => f.url)), [feeds]);
  const [following, setFollowing] = React.useState<string | null>(null);

  async function follow(episode: AppleEpisode) {
    if (!episode.feedUrl) return;
    setFollowing(episode.feedUrl);
    try {
      const res = await fetch("/api/feeds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: episode.feedUrl, kind: "podcast" }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Couldn't follow this show");
      await mutateFeeds();
      toast.success(`Following ${episode.show}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't follow this show");
    } finally {
      setFollowing(null);
    }
  }

  function playCatalogue(episode: AppleEpisode) {
    audio.play({
      id: `ext:${episode.id}`,
      title: episode.title,
      feedId: "ext",
      feedTitle: episode.show,
      imageUrl: episode.imageUrl,
      audioUrl: episode.audioUrl,
      durationSeconds: episode.durationSeconds,
      feedUrl: episode.feedUrl,
    });
    audio.setExpanded(true);
    onOpenChange(false);
  }

  const mine = data?.mine ?? [];
  const apple = data?.apple ?? [];
  const nothing = query.length >= 2 && !isLoading && mine.length === 0 && apple.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(88vh,760px)] max-w-xl flex-col gap-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">{t("Find episodes")}</DialogTitle>
        <div className="border-b p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={t("Episodes about… (a topic, a guest, a question)")}
              aria-label={t("Find episodes")}
              enterKeyHint="search"
              className="h-11 w-full rounded-xl border bg-background pl-9 pr-9 text-[15px] outline-none focus:ring-2 focus:ring-primary/40"
            />
            {isLoading && (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {query.length < 2 && (
            <div className="flex flex-col items-center gap-3 px-8 py-14 text-center text-muted-foreground">
              <Headphones className="h-9 w-9" />
              <p className="max-w-xs text-sm">
                {t(
                  "Search episodes across your shows and the whole catalogue, by what they talk about."
                )}
              </p>
            </div>
          )}
          {nothing && (
            <p className="px-6 py-12 text-center text-sm text-muted-foreground">
              {t("No episodes found for that.")}
            </p>
          )}
          {mine.length > 0 && (
            <section>
              <h3 className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t("From your shows")}
              </h3>
              <ul>
                {mine.map((episode) => (
                  <li key={episode.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedArticleId(episode.id);
                        setMobilePane("reader");
                        onOpenChange(false);
                      }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-accent/60"
                    >
                      <Art src={episode.imageUrl} title={episode.feed.title} />
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            "line-clamp-2 text-sm font-semibold leading-snug",
                            episode.isRead && "font-medium text-muted-foreground"
                          )}
                        >
                          {episode.title}
                        </span>
                        <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <FeedFavicon
                            title={episode.feed.title}
                            faviconUrl={episode.feed.faviconUrl}
                            size={12}
                          />
                          <span className="truncate">{episode.feed.title}</span>
                          <span>·</span>
                          <span>{formatRelativeTime(episode.publishedAt)}</span>
                          {episode.durationSeconds ? (
                            <span>· {durationLabel(episode.durationSeconds)}</span>
                          ) : null}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {apple.length > 0 && (
            <section className="pb-safe">
              <h3 className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t("Everywhere")}
              </h3>
              <ul>
                {apple.map((episode) => {
                  const isFollowed = Boolean(episode.feedUrl && followed.has(episode.feedUrl));
                  return (
                    <li key={episode.id} className="flex items-center gap-3 px-4 py-2.5">
                      <Art src={episode.imageUrl} title={episode.show} />
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 text-sm font-semibold leading-snug">
                          {episode.title}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {episode.show}
                          {episode.publishedAt
                            ? ` · ${formatRelativeTime(episode.publishedAt)}`
                            : ""}
                          {episode.durationSeconds
                            ? ` · ${durationLabel(episode.durationSeconds)}`
                            : ""}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => playCatalogue(episode)}
                        aria-label={`Play ${episode.title}`}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary hover:bg-primary/20"
                      >
                        <Play className="ml-0.5 h-4 w-4 fill-current" />
                      </button>
                      {episode.feedUrl && (
                        <button
                          type="button"
                          disabled={isFollowed || following === episode.feedUrl}
                          onClick={() => void follow(episode)}
                          aria-label={
                            isFollowed ? `Following ${episode.show}` : `Follow ${episode.show}`
                          }
                          className={cn(
                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                            isFollowed
                              ? "text-green-600 dark:text-green-400"
                              : "text-muted-foreground hover:bg-accent hover:text-foreground"
                          )}
                        >
                          {following === episode.feedUrl ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : isFollowed ? (
                            <Check className="h-4 w-4" />
                          ) : (
                            <Plus className="h-4 w-4" />
                          )}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Art({ src, title }: { src: string | null; title: string }) {
  const [broken, setBroken] = React.useState(false);
  if (!src || broken) {
    return (
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 font-serif text-lg font-semibold text-primary">
        {title.trim().charAt(0).toUpperCase() || "?"}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      className="h-12 w-12 shrink-0 rounded-lg object-cover shadow-sm"
    />
  );
}
