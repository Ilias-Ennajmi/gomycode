"use client";

import * as React from "react";
import { Bookmark, ChevronDown, ChevronUp, ExternalLink, Share2, Text, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { shareLink } from "@/lib/share";
import { haptic } from "@/lib/native";
import { youTubeVideoId } from "@/lib/youtube";
import { loadYouTubeApi, PLAYER_STATE, type YTPlayer } from "@/lib/youtube-player";
import { toggleArticleRead, toggleArticleSaved } from "@/lib/hooks/useArticles";
import { useReaderState } from "@/lib/hooks/useReaderState";
import { useBackToClose } from "@/lib/hooks/useHistorySync";
import type { ArticleSummary } from "@/lib/types";

interface VerticalPlayer extends YTPlayer {
  loadVideoById(videoId: string): void;
  cueVideoById(videoId: string): void;
}

/**
 * Shorts the way they're meant to be watched: full screen, portrait, one at a time, swipe
 * up for the next (or arrow keys and the wheel on a desktop). One YouTube player is reused
 * from short to short. Each one watched a few seconds is marked seen when you move on.
 */
export function ShortsPlayer({
  articles,
  startIndex,
  onClose,
}: {
  articles: ArticleSummary[];
  startIndex: number;
  onClose: () => void;
}) {
  const shorts = React.useMemo(
    () => articles.filter((a) => a.isVideo && youTubeVideoId(a.link)),
    [articles]
  );
  const [index, setIndex] = React.useState(() =>
    Math.max(
      0,
      shorts.findIndex((a) => a.id === articles[startIndex]?.id)
    )
  );
  const [progress, setProgress] = React.useState(0);
  const [paused, setPaused] = React.useState(false);
  const [saved, setSaved] = React.useState<Record<string, boolean>>({});
  const [dy, setDy] = React.useState(0);
  const { setSelectedArticleId, setMobilePane } = useReaderState();
  const slotRef = React.useRef<HTMLDivElement>(null);
  const playerRef = React.useRef<VerticalPlayer | null>(null);
  const watched = React.useRef(0);
  const current = shorts[index];
  useBackToClose(true, onClose);

  const go = React.useCallback(
    (delta: number) => {
      setIndex((i) => {
        const nextIndex = i + delta;
        if (nextIndex < 0 || nextIndex >= shorts.length) return i;
        haptic();
        return nextIndex;
      });
    },
    [shorts.length]
  );

  // The one player, created once; later shorts load into it.
  React.useEffect(() => {
    let disposed = false;
    const first = current ? youTubeVideoId(current.link) : null;
    if (!slotRef.current || !first) return;
    loadYouTubeApi()
      .then((YT) => {
        if (disposed || !slotRef.current) return;
        playerRef.current = new YT.Player(slotRef.current, {
          host: "https://www.youtube-nocookie.com",
          videoId: first,
          width: "100%",
          height: "100%",
          playerVars: {
            autoplay: 1,
            playsinline: 1,
            rel: 0,
            modestbranding: 1,
            controls: 0,
            fs: 0,
            iv_load_policy: 3,
          },
          events: {
            onStateChange: (event) => {
              setPaused(event.data === PLAYER_STATE.PAUSED);
              if (event.data === PLAYER_STATE.ENDED) go(1);
            },
          },
        }) as VerticalPlayer;
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
    // Once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Moving on: mark the one left behind as seen if it played a while, load the next.
  const previous = React.useRef<ArticleSummary | null>(null);
  React.useEffect(() => {
    const left = previous.current;
    if (left && left.id !== current?.id && watched.current >= 3 && !left.isRead) {
      toggleArticleRead(left.id, true).catch(() => undefined);
    }
    previous.current = current ?? null;
    watched.current = 0;
    setProgress(0);
    const id = current ? youTubeVideoId(current.link) : null;
    const player = playerRef.current;
    if (player && id && left && left.id !== current?.id) {
      try {
        player.loadVideoById(id);
      } catch {
        // Player not ready yet: the first video is already set.
      }
    }
  }, [current]);

  // Progress line and seconds watched.
  React.useEffect(() => {
    const timer = window.setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      try {
        const t = player.getCurrentTime();
        const d = player.getDuration();
        watched.current = t;
        setProgress(d ? Math.min(100, (t / d) * 100) : 0);
      } catch {
        // Not ready.
      }
    }, 500);
    return () => window.clearInterval(timer);
  }, []);

  // Keys and wheel on desktop.
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowDown" || event.key === "j") go(1);
      else if (event.key === "ArrowUp" || event.key === "k") go(-1);
      else if (event.key === "Escape") onClose();
      else if (event.key === " ") {
        event.preventDefault();
        togglePlay();
      }
    };
    let wheelLock = 0;
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) < 30 || Date.now() < wheelLock) return;
      wheelLock = Date.now() + 700;
      go(event.deltaY > 0 ? 1 : -1);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("wheel", onWheel, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("wheel", onWheel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [go, onClose]);

  function togglePlay() {
    const player = playerRef.current;
    if (!player) return;
    try {
      if (player.getPlayerState() === PLAYER_STATE.PLAYING) player.pauseVideo();
      else player.playVideo();
    } catch {
      // Not ready.
    }
  }

  // Touch: a flick up or down moves on; the frame follows the finger a little.
  const touch = React.useRef<{ y: number; at: number } | null>(null);

  if (!current) return null;
  const isSaved = saved[current.id] ?? current.isSaved;
  const nextShort = shorts[index + 1];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Shorts: ${current.title}`}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black text-white animate-fade-in"
      onTouchStart={(event) => (touch.current = { y: event.touches[0].clientY, at: Date.now() })}
      onTouchMove={(event) => {
        if (!touch.current) return;
        setDy(Math.max(-80, Math.min(80, (event.touches[0].clientY - touch.current.y) / 3)));
      }}
      onTouchEnd={(event) => {
        const start = touch.current;
        touch.current = null;
        setDy(0);
        if (!start) return;
        const delta = event.changedTouches[0].clientY - start.y;
        const fast = Date.now() - start.at < 400;
        if (delta < -60 || (fast && delta < -25)) go(1);
        else if (delta > 60 || (fast && delta > 25)) go(-1);
      }}
    >
      {/* Progress and the counter, along the top. */}
      <div className="absolute inset-x-0 top-0 z-20 pt-safe">
        <div className="mx-3 mt-2 h-[3px] overflow-hidden rounded-full bg-white/25">
          <div
            className="h-full bg-white transition-[width] duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex items-center justify-between px-3 pt-2 text-xs font-medium text-white/80">
          <span>
            {index + 1} / {shorts.length}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-black/40 backdrop-blur"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* The phone-shaped frame: full screen on phones, a card on wide screens. */}
      <div
        className="relative h-full w-full overflow-hidden bg-black transition-transform duration-150 md:h-[min(92vh,860px)] md:w-[min(52vh,484px)] md:rounded-3xl md:shadow-2xl md:ring-1 md:ring-white/10"
        style={{ transform: dy ? `translateY(${dy}px)` : undefined }}
      >
        {/* The next short's picture waits underneath, so the swipe never shows black. */}
        {nextShort?.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={nextShort.imageUrl}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full scale-110 object-cover opacity-0"
          />
        )}
        <div
          ref={slotRef}
          className="absolute inset-0 h-full w-full [&>iframe]:h-full [&>iframe]:w-full"
        />
        {/* Tap anywhere on the video to pause or play. */}
        <button
          type="button"
          onClick={togglePlay}
          aria-label={paused ? "Play" : "Pause"}
          className="absolute inset-0 z-10 cursor-default"
        />
        {paused && (
          <span className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur">
              <svg viewBox="0 0 24 24" className="ml-1 h-7 w-7 fill-current" aria-hidden>
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
          </span>
        )}

        {/* Title and channel, over a gradient at the bottom. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-4 pb-6 pt-16 pr-20 pb-safe">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-white/70">
            {current.feed.title}
          </p>
          <p className="mt-1 line-clamp-3 text-[15px] font-semibold leading-snug">
            {current.title}
          </p>
        </div>

        {/* Actions down the right, like the apps this borrows from. */}
        <div className="absolute bottom-24 right-2 z-20 flex flex-col items-center gap-4 pb-safe">
          <Action
            label={isSaved ? "Remove from Later" : "Read later"}
            active={isSaved}
            onClick={() => {
              haptic("success");
              setSaved((s) => ({ ...s, [current.id]: !isSaved }));
              toggleArticleSaved(current.id, !isSaved).catch(() => undefined);
            }}
          >
            <Bookmark className={cn("h-6 w-6", isSaved && "fill-current")} />
          </Action>
          <Action label="Share" onClick={() => void shareLink(current.title, current.link)}>
            <Share2 className="h-6 w-6" />
          </Action>
          <Action
            label="Details"
            onClick={() => {
              onClose();
              setSelectedArticleId(current.id);
              setMobilePane("reader");
            }}
          >
            <Text className="h-6 w-6" />
          </Action>
          <Action
            label="Open on YouTube"
            onClick={() => window.open(current.link, "_blank", "noopener")}
          >
            <ExternalLink className="h-6 w-6" />
          </Action>
        </div>
      </div>

      {/* Desktop: arrows beside the card. */}
      <div className="absolute right-6 top-1/2 z-20 hidden -translate-y-1/2 flex-col gap-2 md:flex">
        <button
          type="button"
          onClick={() => go(-1)}
          disabled={index === 0}
          aria-label="Previous short"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30"
        >
          <ChevronUp className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => go(1)}
          disabled={index + 1 >= shorts.length}
          aria-label="Next short"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30"
        >
          <ChevronDown className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

function Action({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-12 w-12 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur transition-transform active:scale-90",
        active && "text-primary"
      )}
    >
      {children}
    </button>
  );
}
