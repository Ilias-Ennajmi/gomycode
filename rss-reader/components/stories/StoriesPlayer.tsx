"use client";

import * as React from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Bookmark, BookOpen, Loader2, Share, X } from "lucide-react";
import { cn, formatRelativeTime, getFaviconFallbackColor, stripHtml } from "@/lib/utils";
import { FeedFavicon } from "@/components/shared/FeedFavicon";
import { useReaderState } from "@/lib/hooks/useReaderState";
import { useBackToClose } from "@/lib/hooks/useHistorySync";
import { toggleArticleSaved } from "@/lib/hooks/useArticles";
import { shareLink } from "@/lib/share";
import { haptic } from "@/lib/native";
import { reducedMotion } from "@/lib/motion";
import { markSeen, storiesUrl, type StorySource } from "@/lib/stories";
import type { ArticleSummary } from "@/lib/types";

const STORY_MS = 7000;
const HOLD_MS = 180;

/**
 * Full-screen stories: one source's latest unread, a card each, auto-advancing with a
 * progress segment per story. Tap the right side for the next, the left for the previous,
 * hold to pause, swipe sideways for the next source, swipe down to close. "Read" opens the
 * article in the reader.
 */
export function StoriesPlayer({
  sources,
  start,
  onClose,
}: {
  sources: StorySource[];
  start: number;
  onClose: () => void;
}) {
  const [sourceIndex, setSourceIndex] = React.useState(start);
  const [index, setIndex] = React.useState(0);
  const [progress, setProgress] = React.useState(0);
  const [paused, setPaused] = React.useState(false);
  const [saved, setSaved] = React.useState<Record<string, boolean>>({});
  const { setSelectedArticleId, setMobilePane } = useReaderState();
  useBackToClose(true, onClose);

  const source = sources[sourceIndex];
  const { data, isLoading } = useSWR<{ articles: ArticleSummary[] }>(storiesUrl(source), {
    revalidateOnFocus: false,
  });
  const stories = React.useMemo(() => data?.articles ?? [], [data]);
  const story = stories[index];

  const goSource = React.useCallback(
    (direction: 1 | -1) => {
      const next = sourceIndex + direction;
      if (next < 0) return;
      if (next >= sources.length) return onClose();
      haptic();
      setSourceIndex(next);
      setIndex(0);
      setProgress(0);
    },
    [sourceIndex, sources.length, onClose]
  );
  const go = React.useCallback(
    (direction: 1 | -1) => {
      if (stories.length === 0) return goSource(direction);
      const next = index + direction;
      if (next < 0) return goSource(-1);
      if (next >= stories.length) return goSource(1);
      setIndex(next);
      setProgress(0);
    },
    [index, stories.length, goSource]
  );

  // The clock: a fraction of the story's time, driven by frames so a hold pauses exactly.
  React.useEffect(() => {
    if (!story || paused) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const elapsed = now - last;
      last = now;
      setProgress((p) => {
        const next = p + elapsed / STORY_MS;
        return next >= 1 ? 1 : next;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [story, paused]);
  React.useEffect(() => {
    if (progress >= 1) go(1);
  }, [progress, go]);
  React.useEffect(() => {
    if (story) markSeen(story.id);
  }, [story]);
  // Nothing unread here any more (e.g. everything got read elsewhere): move along.
  React.useEffect(() => {
    if (!isLoading && data && stories.length === 0) goSource(1);
  }, [isLoading, data, stories.length, goSource]);

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") go(1);
      if (event.key === "ArrowLeft") go(-1);
      if (event.key === "ArrowDown") goSource(1);
      if (event.key === "ArrowUp") goSource(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, goSource, onClose]);

  // Touch: hold pauses, a tap steps, a sideways swipe changes source, down closes.
  const touch = React.useRef<{ x: number; y: number; at: number; hold: number | null } | null>(
    null
  );
  const onPointerDown = (event: React.PointerEvent) => {
    if ((event.target as HTMLElement).closest("button, a")) return;
    touch.current = {
      x: event.clientX,
      y: event.clientY,
      at: Date.now(),
      hold: window.setTimeout(() => setPaused(true), HOLD_MS),
    };
  };
  const onPointerUp = (event: React.PointerEvent) => {
    const t = touch.current;
    touch.current = null;
    if (!t) return;
    if (t.hold) clearTimeout(t.hold);
    const wasPaused = paused;
    setPaused(false);
    const dx = event.clientX - t.x;
    const dy = event.clientY - t.y;
    if (dy > 90 && Math.abs(dy) > Math.abs(dx)) return onClose();
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) return goSource(dx < 0 ? 1 : -1);
    if (wasPaused || Math.abs(dx) > 12 || Math.abs(dy) > 12) return;
    const width = (event.currentTarget as HTMLElement).clientWidth;
    go(event.clientX < width * 0.32 ? -1 : 1);
  };

  function openStory() {
    if (!story) return;
    setSelectedArticleId(story.id);
    setMobilePane("reader");
    onClose();
  }
  async function save() {
    if (!story) return;
    const next = !(saved[story.id] ?? story.isSaved);
    setSaved((s) => ({ ...s, [story.id]: next }));
    haptic(next ? "success" : "light");
    try {
      await toggleArticleSaved(story.id, next);
      toast.success(next ? "Saved for later" : "Removed from Later");
    } catch {
      setSaved((s) => ({ ...s, [story.id]: !next }));
      toast.error("Could not save");
    }
  }

  const isSaved = story ? (saved[story.id] ?? story.isSaved) : false;
  const text = story ? stripHtml(story.summary || story.content).slice(0, 260) : "";
  const image = story?.imageUrl;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Stories from ${source.title}`}
      className={cn(
        "fixed inset-0 z-[70] flex select-none items-center justify-center bg-black text-white touch-none",
        !reducedMotion() && "animate-fade-in"
      )}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        if (touch.current?.hold) clearTimeout(touch.current.hold);
        touch.current = null;
        setPaused(false);
      }}
    >
      {/* The picture, blurred, fills the back; the story sits on top. */}
      {image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt=""
          referrerPolicy="no-referrer"
          className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-50 blur-2xl"
        />
      )}
      {/* No picture: the source's colour, so the screen is never plain black. */}
      {!image && (
        <div
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{
            background: `radial-gradient(110% 70% at 50% 0%, ${getFaviconFallbackColor(source.title)}, #000 92%)`,
          }}
        />
      )}
      <div
        className={cn(
          "absolute inset-0 bg-gradient-to-b",
          image
            ? "from-black/60 via-black/20 to-black/80"
            : "from-black/20 via-transparent to-black/70"
        )}
      />

      <div className="relative flex h-full w-full max-w-md flex-col pb-safe pt-safe sm:my-6 sm:h-auto sm:min-h-[min(820px,calc(100dvh-48px))] sm:overflow-hidden sm:rounded-3xl sm:border sm:border-white/10 sm:bg-black/40 sm:shadow-2xl">
        {/* Progress segments, one per story. */}
        <div className="flex gap-1 px-3 pt-3" aria-hidden>
          {(stories.length ? stories : [null]).map((s, i) => (
            <span
              key={s?.id ?? i}
              className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/30"
            >
              <span
                className="block h-full bg-white"
                style={{ width: `${i < index ? 100 : i === index ? progress * 100 : 0}%` }}
              />
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2.5 px-4 pt-3">
          <FeedFavicon
            title={source.title}
            faviconUrl={source.faviconUrl}
            size={32}
            className="ring-2 ring-white/40"
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{source.title}</span>
            {story && (
              <span className="block text-xs text-white/70">
                {formatRelativeTime(story.publishedAt)}
                {stories.length > 1 ? ` · ${index + 1}/${stories.length}` : ""}
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close stories"
            className="flex h-10 w-10 items-center justify-center rounded-full text-white/90 hover:bg-white/10"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col justify-end px-5 pb-5">
          {isLoading && !story ? (
            <div className="flex flex-1 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-white/70" />
            </div>
          ) : story ? (
            <div key={story.id} className={cn(!reducedMotion() && "animate-rise-in")}>
              {image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={image}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="mb-5 max-h-[42vh] w-full rounded-2xl object-cover shadow-2xl"
                />
              )}
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70">
                {story.feed.title}
              </p>
              <h2 className="mt-1.5 text-balance font-serif text-[28px] font-semibold leading-[1.15]">
                {story.title}
              </h2>
              {text && (
                <p className="mt-3 line-clamp-4 text-[15px] leading-snug text-white/80">{text}</p>
              )}
            </div>
          ) : (
            <p className="text-center text-sm text-white/70">Nothing new here.</p>
          )}

          <div className="mt-5 flex items-center gap-2">
            <button
              type="button"
              onClick={openStory}
              disabled={!story}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-white text-sm font-semibold text-black disabled:opacity-40"
            >
              <BookOpen className="h-4 w-4" /> Read
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={!story}
              aria-label={isSaved ? "Remove from Later" : "Read later"}
              aria-pressed={isSaved}
              className={cn(
                "flex h-12 w-12 items-center justify-center rounded-full border border-white/30 text-white",
                isSaved && "bg-white/20"
              )}
            >
              <Bookmark className={cn("h-5 w-5", isSaved && "fill-current")} />
            </button>
            <button
              type="button"
              onClick={() => story && void shareLink(story.title, story.link)}
              disabled={!story}
              aria-label="Share"
              className="flex h-12 w-12 items-center justify-center rounded-full border border-white/30 text-white"
            >
              <Share className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
