"use client";

import * as React from "react";
import { ArrowUp, Play, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  shouldAutoplay,
  loadYouTubeApi,
  PLAYER_STATE,
  savedPlaybackRate,
  savePlaybackRate,
  type YTPlayer,
} from "@/lib/youtube-player";

export interface VideoControls {
  seek: (seconds: number) => void;
}

interface VideoPlayerProps {
  videoId: string;
  isShort?: boolean;
  /** Where to start (resume). */
  startSeconds?: number;
  /** The reader's scroll area: scrolling the player out of it turns it into a mini player. */
  scrollRef: React.RefObject<HTMLElement>;
  onReady?: (controls: VideoControls) => void;
  /** Every second while playing: position and length, for chapters and progress. */
  onTime?: (seconds: number, duration: number) => void;
  /** Now and then while playing, on pause and when leaving: worth saving. */
  onProgress?: (seconds: number, duration: number) => void;
  onEnded?: () => void;
  /** Shown over the player when the video ends (up next). */
  endCard?: React.ReactNode;
}

const SAVE_EVERY_MS = 10_000;

/**
 * The YouTube player, through YouTube's IFrame API so the app knows where you are: resume,
 * remembered speed, progress, and chapters. Scrolled out of view while playing, it keeps
 * playing in a small corner player.
 */
export function VideoPlayer({
  videoId,
  isShort,
  startSeconds = 0,
  scrollRef,
  onReady,
  onTime,
  onProgress,
  onEnded,
  endCard,
}: VideoPlayerProps) {
  const slotRef = React.useRef<HTMLDivElement>(null);
  const frameRef = React.useRef<HTMLDivElement>(null);
  const playerRef = React.useRef<YTPlayer | null>(null);
  const [playing, setPlaying] = React.useState(false);
  const [ended, setEnded] = React.useState(false);
  const [offscreen, setOffscreen] = React.useState(false);
  const [dismissedMini, setDismissedMini] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  // The latest callbacks, without re-creating the player when they change.
  const callbacks = React.useRef({ onReady, onTime, onProgress, onEnded });
  callbacks.current = { onReady, onTime, onProgress, onEnded };

  React.useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    let lastSave = 0;
    setPlaying(false);
    setEnded(false);
    setFailed(false);
    setDismissedMini(false);

    const host = document.createElement("div");
    frame.appendChild(host);
    const autoplay = shouldAutoplay(videoId);

    function position(player: YTPlayer) {
      const seconds = player.getCurrentTime?.() ?? 0;
      const duration = player.getDuration?.() ?? 0;
      return { seconds, duration };
    }
    function save(player: YTPlayer) {
      const { seconds, duration } = position(player);
      if (duration > 0) callbacks.current.onProgress?.(seconds, duration);
      lastSave = Date.now();
    }

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled) return;
        const player = new YT.Player(host, {
          host: "https://www.youtube-nocookie.com",
          videoId,
          width: "100%",
          height: "100%",
          playerVars: {
            playsinline: 1,
            rel: 0,
            modestbranding: 1,
            ...(startSeconds > 0 ? { start: Math.floor(startSeconds) } : {}),
            ...(autoplay ? { autoplay: 1 } : {}),
          },
          events: {
            onReady: (event) => {
              const rate = savedPlaybackRate();
              if (rate !== 1) event.target.setPlaybackRate(rate);
              callbacks.current.onReady?.({
                seek: (seconds) => {
                  event.target.seekTo(seconds, true);
                  event.target.playVideo();
                },
              });
            },
            onPlaybackRateChange: (event) => savePlaybackRate(event.data),
            onStateChange: (event) => {
              const state = event.data;
              setPlaying(state === PLAYER_STATE.PLAYING || state === PLAYER_STATE.BUFFERING);
              if (state === PLAYER_STATE.PLAYING) {
                setEnded(false);
                clearInterval(timer);
                timer = setInterval(() => {
                  const { seconds, duration } = position(event.target);
                  callbacks.current.onTime?.(seconds, duration);
                  if (Date.now() - lastSave > SAVE_EVERY_MS) save(event.target);
                }, 1000);
              } else {
                clearInterval(timer);
                if (state === PLAYER_STATE.PAUSED) save(event.target);
                if (state === PLAYER_STATE.ENDED) {
                  save(event.target);
                  setEnded(true);
                  callbacks.current.onEnded?.();
                }
              }
            },
          },
        });
        playerRef.current = player;
      })
      .catch(() => setFailed(true));

    return () => {
      cancelled = true;
      clearInterval(timer);
      const player = playerRef.current;
      playerRef.current = null;
      if (player) {
        try {
          save(player);
          player.destroy();
        } catch {
          // Already gone.
        }
      }
      frame.innerHTML = "";
    };
    // A new player per video; the start position only matters when it loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  // Scrolled out of view: the mini player takes over (only while playing).
  React.useEffect(() => {
    const slot = slotRef.current;
    const root = scrollRef.current;
    if (!slot || !root || isShort) return;
    const observer = new IntersectionObserver(
      ([entry]) => setOffscreen(entry.intersectionRatio < 0.3),
      { root, threshold: [0, 0.3, 1] }
    );
    observer.observe(slot);
    return () => observer.disconnect();
  }, [scrollRef, isShort, videoId]);

  const mini = offscreen && playing && !dismissedMini && !isShort;
  React.useEffect(() => {
    if (!offscreen) setDismissedMini(false);
  }, [offscreen]);

  if (failed) {
    return (
      <a
        href={`https://www.youtube.com/watch?v=${videoId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex aspect-video w-full items-center justify-center gap-2 rounded-xl bg-muted text-sm font-medium"
      >
        <Play className="h-4 w-4" /> Watch on YouTube
      </a>
    );
  }

  return (
    <div
      ref={slotRef}
      className={cn(
        "relative w-full",
        isShort ? "mx-auto aspect-[9/16] max-h-[78vh] max-w-[min(100%,420px)]" : "aspect-video"
      )}
    >
      <div
        className={cn(
          "overflow-hidden bg-black shadow-sm",
          mini
            ? "fixed bottom-[calc(env(safe-area-inset-bottom)+16px)] right-4 z-40 aspect-video w-[min(60vw,320px)] animate-fade-in rounded-xl shadow-2xl ring-1 ring-white/10"
            : "absolute inset-0 rounded-xl"
        )}
      >
        <div ref={frameRef} className="h-full w-full [&>iframe]:h-full [&>iframe]:w-full" />
        {mini && (
          <div className="absolute right-1.5 top-1.5 flex gap-1">
            <button
              type="button"
              onClick={() =>
                slotRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
              }
              className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
              aria-label="Back to the video"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                playerRef.current?.pauseVideo();
                setDismissedMini(true);
              }}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
              aria-label="Close the mini player"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {ended && endCard && !mini && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
            {endCard}
          </div>
        )}
      </div>
    </div>
  );
}
