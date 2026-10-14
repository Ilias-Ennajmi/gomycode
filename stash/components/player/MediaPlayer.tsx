"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import type { SaveItem, Segment } from "@/lib/data";
import { embedUrl } from "@/lib/links";
import { videoUrl } from "@/lib/media";
import { cx } from "@/components/ui/cx";

export type PlayerHandle = {
  seek: (seconds: number) => void;
  video: () => HTMLVideoElement | null;
};

type Mode = "video" | "embed" | "card";

function initialMode(save: SaveItem): Mode {
  if (save.hasVideo) return "video";
  return embedUrl(save.sourceUrl) ? "embed" : "card";
}

const INK_LIGHT = { color: "var(--ink-light)" } as const;

/**
 * Plays a save, never a dead end: the stored MP4 → the platform's official
 * embed → a card with the key idea and a link to the original.
 */
export const MediaPlayer = forwardRef<
  PlayerHandle,
  {
    save: SaveItem;
    poster?: string;
    /** Play when true, pause when false (Play feed); undefined = user controlled. */
    active?: boolean;
    /** Load the video data ahead of time (next items in the feed). */
    preload?: boolean;
    rate?: number;
    muted?: boolean;
    captions?: Segment[] | null;
    startAt?: number;
    controls?: boolean;
    loop?: boolean;
    onTime?: (t: number, duration: number) => void;
    onEnded?: () => void;
    onAutoplayBlocked?: () => void;
    className?: string;
  }
>(function MediaPlayer(
  { save, poster, active, preload, rate = 1, muted = false, captions, startAt, controls, loop, onTime, onEnded, onAutoplayBlocked, className },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [mode, setMode] = useState<Mode>(() => initialMode(save));
  const [now, setNow] = useState(0);

  useImperativeHandle(ref, () => ({
    seek: (s) => {
      const v = videoRef.current;
      if (!v) return;
      v.currentTime = s;
      void v.play().catch(() => {});
    },
    video: () => videoRef.current,
  }));

  useEffect(() => {
    const v = videoRef.current;
    if (!v || active === undefined) return;
    if (active) {
      v.play().catch(() => {
        // Autoplay with sound was blocked: play muted and let the screen offer "Tap for sound".
        v.muted = true;
        void v.play().catch(() => {});
        onAutoplayBlocked?.();
      });
    } else {
      v.pause();
    }
  }, [active, mode, onAutoplayBlocked]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = rate;
  }, [rate, mode]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted, mode]);

  const caption = captions?.find((c) => now >= c.start && now < Math.max(c.end, c.start + 1))?.text;
  const embed = mode === "embed" ? embedUrl(save.sourceUrl) : null;

  return (
    <div className={cx("relative h-full w-full overflow-hidden bg-[var(--scrim-base)]", className)}>
      {mode === "video" && (
        <video
          ref={videoRef}
          key={save.id}
          src={videoUrl(save.id)}
          poster={poster}
          playsInline
          loop={loop}
          controls={controls}
          preload={active || preload ? "auto" : "metadata"}
          className="absolute inset-0 h-full w-full object-contain"
          onLoadedMetadata={(e) => {
            if (startAt && startAt > 0) e.currentTarget.currentTime = startAt;
            e.currentTarget.playbackRate = rate;
          }}
          onTimeUpdate={(e) => {
            const v = e.currentTarget;
            setNow(v.currentTime);
            onTime?.(v.currentTime, v.duration || 0);
          }}
          onEnded={onEnded}
          onError={() => setMode(embedUrl(save.sourceUrl) ? "embed" : "card")}
        />
      )}

      {mode === "embed" && embed && (active === undefined || active) && (
        <iframe
          key={embed}
          src={embed}
          title="Original post"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
          className="absolute inset-0 h-full w-full border-0 bg-surface"
          loading="lazy"
        />
      )}

      {mode === "card" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 py-8 pl-6 pr-20 text-center" style={INK_LIGHT}>
          {poster && (
            // eslint-disable-next-line @next/next/no-img-element -- signed Storage URL
            <img src={poster} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" />
          )}
          <p className="relative text-title">{save.keyIdea ?? save.title ?? "This post can't play here."}</p>
          <a
            href={save.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="relative flex h-12 items-center gap-2 rounded-card border px-4 text-label"
            style={{ borderColor: "var(--ink-light)" }}
          >
            <ExternalLink size={20} strokeWidth={2} aria-hidden /> Open original
          </a>
        </div>
      )}

      {caption && mode === "video" && (
        <p
          aria-hidden
          className="pointer-events-none absolute inset-x-4 bottom-[28%] mx-auto max-w-md rounded-sm px-2 py-1 text-center text-body"
          style={{ ...INK_LIGHT, background: "color-mix(in srgb, var(--scrim-base) 70%, transparent)" }}
        >
          {caption}
        </p>
      )}
    </div>
  );
});
