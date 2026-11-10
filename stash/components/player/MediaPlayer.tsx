"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import Link from "next/link";
import { BookOpenText, ExternalLink } from "lucide-react";
import type { SaveItem, Segment } from "@/lib/data";
import { forgetSignedUrl, videoUrl, VIDEO_BUCKET } from "@/lib/media";
import { embedAspect, embedSrc, fallbackMode, openInLabel, playbackMode, videoNote, type PlaybackMode } from "@/lib/playback";
import { publicUrl } from "@/lib/links";
import { cx } from "@/components/ui/cx";

export type PlayerHandle = {
  seek: (seconds: number) => void;
  video: () => HTMLVideoElement | null;
};

const INK_LIGHT = { color: "var(--ink-light)" } as const;
const CHIP_BG = { background: "color-mix(in srgb, var(--scrim-base) 70%, transparent)" } as const;

// The embed runs the platform's own player in its own origin. It may run scripts and open the
// platform in a new tab, and nothing else: it can't navigate Stash or read anything of ours.
const SANDBOX = "allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox";

/**
 * Plays a save, never a dead end (contract 0007 §7): the stored MP4 through a signed
 * link made by this phone → the platform's official player in a sandboxed frame → a
 * card with the key idea and "Open in …". Articles and screenshots show as what they are.
 */
export const MediaPlayer = forwardRef<
  PlayerHandle,
  {
    save: SaveItem;
    poster?: string;
    /** Signed link to the stored video when the caller already has it (Play signs ahead). */
    src?: string;
    /** Play when true, pause when false (Play feed); undefined = user controlled. */
    active?: boolean;
    /** Load the video data ahead of time (next items in the feed). Embeds are never preloaded. */
    preload?: boolean;
    rate?: number;
    muted?: boolean;
    captions?: Segment[] | null;
    startAt?: number;
    controls?: boolean;
    loop?: boolean;
    /** "feed": full screen in Play, leaving room for its bars. "inline": the item page's frame. */
    layout?: "feed" | "inline";
    onTime?: (t: number, duration: number) => void;
    onEnded?: () => void;
    onAutoplayBlocked?: () => void;
    className?: string;
  }
>(function MediaPlayer(
  { save, poster, src, active, preload, rate = 1, muted = false, captions, startAt, controls, loop, layout = "inline", onTime, onEnded, onAutoplayBlocked, className },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const decided = playbackMode(save);
  // A file that won't play falls back for good (until the save itself changes).
  const [failed, setFailed] = useState<string | null>(null);
  const mode: PlaybackMode = decided.mode === "file" && failed === save.id ? fallbackMode(save) : decided.mode;
  const [signed, setSigned] = useState<{ path: string; url: string } | null>(null);
  const retried = useRef(false);
  // After a link fails once, this player signs its own instead of reusing the caller's.
  const [ownLink, setOwnLink] = useState(false);
  const [now, setNow] = useState(0);

  const path = save.videoPath ?? null;
  const given = ownLink ? undefined : src;
  const fileSrc = mode === "file" ? (given ?? (signed && signed.path === path ? signed.url : undefined)) : undefined;
  const wanted = mode === "file" && !given && Boolean(path) && (active === undefined || active || preload);

  // Sign the video link with this phone's session when the caller didn't pass one.
  useEffect(() => {
    if (!wanted || !path || (signed && signed.path === path)) return;
    let alive = true;
    void videoUrl({ videoPath: path }).then((url) => {
      if (!alive) return;
      if (url) setSigned({ path, url });
      else if (navigator.onLine) setFailed(save.id); // refused (evicted meanwhile): use the fallback
    });
    return () => {
      alive = false;
    };
  }, [wanted, path, signed, save.id]);

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
    if (!v || active === undefined || !fileSrc) return;
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
  }, [active, fileSrc, onAutoplayBlocked]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = rate;
  }, [rate, fileSrc]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted, fileSrc]);

  const onVideoError = () => {
    // The link may have ended early: sign once more, then fall back to the embed or the link.
    if (path && !retried.current && navigator.onLine) {
      retried.current = true;
      forgetSignedUrl(VIDEO_BUCKET, path);
      setSigned(null);
      setOwnLink(true);
      return;
    }
    setFailed(save.id);
  };

  const caption = captions?.find((c) => now >= c.start && now < Math.max(c.end, c.start + 1))?.text;
  const embed = mode === "embed" ? decided.embedUrl : null;
  const showEmbed = Boolean(embed) && (active === undefined || active);
  const aspect = embed ? embedAspect(embed, save.sourceUrl) : "portrait";
  const note = mode === "embed" || mode === "link" ? videoNote(save.videoState, save.platform) : null;
  const original = publicUrl(save.sourceUrl);
  const feed = layout === "feed";
  const headline = save.keyIdea ?? save.aiTitle ?? save.title ?? null;

  const openLink = original && (
    <a
      href={original}
      target="_blank"
      rel="noreferrer"
      className={cx("press relative flex h-12 shrink-0 items-center gap-2 rounded-full px-4 text-label", feed ? "" : "self-center")}
      style={{ ...INK_LIGHT, ...CHIP_BG }}
    >
      <ExternalLink size={20} strokeWidth={2} aria-hidden /> {openInLabel(save.platform)}
    </a>
  );

  return (
    <div className={cx("relative h-full w-full overflow-hidden bg-[var(--scrim-base)]", className)}>
      {mode === "file" &&
        (fileSrc ? (
          <video
            ref={videoRef}
            key={`${save.id}:${fileSrc}`}
            src={fileSrc}
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
            onError={onVideoError}
          />
        ) : (
          poster && (
            // eslint-disable-next-line @next/next/no-img-element -- signed Storage URL
            <img src={poster} alt="" className="absolute inset-0 h-full w-full object-contain" />
          )
        ))}

      {mode === "embed" && embed && (
        <div
          className={cx("absolute inset-x-0 flex flex-col items-center justify-center gap-2", feed ? "pl-3 pr-[4.5rem]" : "inset-y-0")}
          // In Play the frame leaves the top bar and the caption band free, so swipes there still move the feed.
          style={feed ? { top: "var(--embed-top)", bottom: "var(--embed-bottom)" } : undefined}
        >
          {poster && !showEmbed && (
            // eslint-disable-next-line @next/next/no-img-element -- signed Storage URL
            <img src={poster} alt="" className="absolute inset-0 h-full w-full object-contain" />
          )}
          {showEmbed && (
            <iframe
              key={embed}
              src={embedSrc(embed, { autoplay: active === true })}
              title={`${openInLabel(save.platform).replace("Open in ", "")} player`}
              sandbox={SANDBOX}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              loading={feed ? "eager" : "lazy"}
              className={cx(
                "relative min-h-0 w-full border-0",
                feed ? "max-h-full rounded-lg" : "h-full",
                aspect === "landscape" ? "aspect-video" : feed ? "flex-1" : "",
                aspect === "card" ? "bg-[var(--ink-light)]" : "bg-[var(--scrim-base)]",
                feed && aspect !== "landscape" && "max-w-md",
              )}
            />
          )}
          {feed && (
            <div className="relative flex w-full max-w-md shrink-0 items-center gap-2">
              {openLink}
              {note && (
                <p className="min-w-0 flex-1 text-caption opacity-80" style={INK_LIGHT}>
                  {note}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {mode === "image" &&
        (poster ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed Storage URL
          <img src={poster} alt={save.keyIdea ?? "Shared screenshot"} className="absolute inset-0 h-full w-full object-contain" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center" style={INK_LIGHT}>
            <p className="text-title">{save.keyIdea ?? save.title ?? "Screenshot"}</p>
          </div>
        ))}

      {(mode === "link" || mode === "article") && (
        <div className={cx("absolute inset-0 flex flex-col items-center justify-center gap-4 py-8 pl-6 text-center", feed ? "pr-20" : "pr-6")} style={INK_LIGHT}>
          {poster && (
            // eslint-disable-next-line @next/next/no-img-element -- signed Storage URL
            <img src={poster} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" />
          )}
          {mode === "article" && (
            <span className="relative flex h-14 w-14 items-center justify-center rounded-full" style={CHIP_BG}>
              <BookOpenText size={26} strokeWidth={2} aria-hidden />
            </span>
          )}
          {/* In Play the bottom band already shows the key idea. */}
          {!feed && <p className="relative line-clamp-6 text-title">{headline ?? (mode === "article" ? "Article" : "This one plays in its own app.")}</p>}
          {feed && <p className="relative text-heading opacity-90">{mode === "article" ? "An article to read" : "This one plays in its own app"}</p>}
          <div className="relative flex flex-wrap items-center justify-center gap-2">
            {mode === "article" && feed && (
              <Link href={`/item/${save.id}`} className="press flex h-12 items-center gap-2 rounded-full bg-[var(--ink-light)] px-4 text-label" style={{ color: "var(--scrim-base)" }}>
                <BookOpenText size={20} strokeWidth={2} aria-hidden /> Read it here
              </Link>
            )}
            {openLink}
          </div>
          {note && <p className="relative max-w-xs text-caption opacity-80">{note}</p>}
        </div>
      )}

      {caption && mode === "file" && (
        <p
          aria-hidden
          className="pointer-events-none absolute inset-x-4 bottom-[var(--captions-bottom)] mx-auto max-w-md rounded-sm px-2 py-1 text-center text-body"
          style={{ ...INK_LIGHT, ...CHIP_BG }}
        >
          {caption}
        </p>
      )}
    </div>
  );
});
