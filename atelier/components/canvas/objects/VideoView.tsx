"use client";

import { Play } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { AssetResolver } from "@/lib/assets/resolver-types";
import { getPlaybackStore, type PlaybackStore } from "@/lib/engine/media/playback-store";
import { pickPosterVariant } from "@/lib/engine/media/poster";
import type { VideoObj } from "@/lib/engine/model/types";
import { useLod } from "../lod";

/** Variants a Phase 1 style asset is assumed to have when nothing is known about it. */
const UNKNOWN: readonly ("w1024")[] = ["w1024"];

const fill = { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block", userSelect: "none" } as const;

/**
 * A video or GIF card. It shows the poster (a still) and nothing else until it is activated (Enter on the selected
 * object, or the Play button of the selection bar): then it mounts the <video> (or swaps a GIF to its animated file).
 * At most 3 are live at once (PlaybackStore); the least recently used goes back to its poster. It never autoplays, pauses
 * while scrolled out of view, and a live video that is both off-screen and not selected returns to its poster. Controls
 * live in the selection bar (they have names and keyboard access there), so the canvas keeps every pointer gesture.
 */
export function VideoView({ obj, assets, store }: { obj: VideoObj; assets: AssetResolver; store?: PlaybackStore }) {
  const s = store ?? getPlaybackStore();
  const { zoom, dpr } = useLod();
  const state = useSyncExternalStore(
    (cb) => s.subscribe(cb),
    () => s.state(obj.id),
    () => "off" as const,
  );
  const [visible, setVisible] = useState(true);
  const [broken, setBroken] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const isGif = obj.kind === "gif";
  const active = state !== "off";
  // A new attempt (going live again) clears the message of the last one.
  const [wasActive, setWasActive] = useState(active);
  if (wasActive !== active) {
    setWasActive(active);
    if (active) setBroken(false);
  }

  // ---- poster ----
  const posterId = obj.posterAssetId ?? obj.assetId;
  const known = assets.available(posterId);
  const variant = pickPosterVariant(known?.variants ?? UNKNOWN, obj.w * zoom * dpr);
  const poster = variant ? assets.url(posterId, variant) : null;
  const original = assets.url(obj.assetId, "original");

  // ---- keep the element in step with the store ----
  const attach = useCallback(
    (el: HTMLVideoElement | null) => {
      video.current = el;
      s.attach(obj.id, el);
    },
    [s, obj.id],
  );
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    if (state === "playing" && visible) {
      const r = el.play() as Promise<void> | undefined;
      r?.catch(() => s.setPlaying(obj.id, false)); // the browser refused (no gesture, no decoder): stay on the first frame
    } else {
      el.pause();
    }
  }, [state, visible, s, obj.id, isGif, active]);
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    el.muted = obj.muted;
    el.loop = obj.loop;
  }, [obj.muted, obj.loop, active]);

  // ---- off-screen: pause; and go back to the poster when it is not selected either ----
  useEffect(() => {
    const el = wrap.current;
    if (!active || !el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      const last = entries[entries.length - 1];
      if (!last) return;
      setVisible(last.isIntersecting);
      if (!last.isIntersecting && !s.isSelected(obj.id)) s.deactivate(obj.id);
    });
    io.observe(el);
    return () => {
      io.disconnect();
      setVisible(true);
    };
  }, [active, s, obj.id]);

  // Culled (scrolled far away) or removed: the slot goes back to the budget.
  useEffect(() => {
    const id = obj.id;
    return () => {
      if (s.state(id) !== "off") s.deactivate(id);
    };
  }, [s, obj.id]);


  const label = isGif ? "GIF" : "Video";
  const live = active && (!isGif || state === "playing");
  const hint = state === "playing" ? "playing" : state === "paused" ? "paused" : "play";

  return (
    <div
      ref={wrap}
      role="group"
      aria-label={`${label} — ${hint}`}
      data-media-state={state}
      style={{ position: "absolute", inset: 0, overflow: "hidden", background: "var(--color-border)", borderRadius: "var(--radius-sm)" }}
    >
      {poster ? (
        // eslint-disable-next-line @next/next/no-img-element -- canvas bitmaps come from the asset resolver, already sized
        <img src={poster} alt="" decoding="async" draggable={false} style={fill} />
      ) : (
        <div aria-hidden="true" data-poster-missing="" style={{ position: "absolute", inset: 0, background: "var(--color-border)" }} />
      )}

      {live && !isGif && original ? (
        <video
          ref={attach}
          src={original}
          poster={poster ?? undefined}
          preload="metadata"
          playsInline
          muted={obj.muted}
          loop={obj.loop}
          aria-label={`${label} — ${hint}`}
          crossOrigin={original.startsWith("https:") ? "anonymous" : undefined}
          draggable={false}
          onEnded={() => s.setPlaying(obj.id, false)}
          onError={() => {
            setBroken(true);
            s.deactivate(obj.id);
          }}
          style={fill}
        />
      ) : null}
      {live && isGif && original ? (
        // eslint-disable-next-line @next/next/no-img-element -- the animated original, only while it holds a playback slot
        <img src={original} alt="" decoding="async" draggable={false} style={fill} />
      ) : null}

      {!live || state === "paused" ? (
        <span
          aria-hidden="true"
          data-play-badge=""
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            display: "grid",
            placeItems: "center",
            width: 44,
            height: 44,
            borderRadius: "50%",
            background: "var(--color-surface)",
            color: "var(--color-ink)",
            boxShadow: "var(--elev-2)",
          }}
        >
          <Play size={20} strokeWidth={2} fill="currentColor" />
        </span>
      ) : null}

      {isGif && !live ? (
        <span
          style={{
            position: "absolute",
            left: "var(--space-2)",
            bottom: "var(--space-2)",
            padding: "0 var(--space-2)",
            borderRadius: "var(--radius-sm)",
            background: "var(--color-surface)",
            color: "var(--color-ink)",
            fontSize: "var(--text-xs)",
            fontWeight: 600,
            lineHeight: "20px",
            boxShadow: "var(--elev-1)",
          }}
        >
          GIF
        </span>
      ) : null}

      {broken ? (
        <p
          role="status"
          style={{
            position: "absolute",
            left: "var(--space-2)",
            right: "var(--space-2)",
            bottom: "var(--space-2)",
            margin: 0,
            padding: "var(--space-1) var(--space-2)",
            borderRadius: "var(--radius-sm)",
            background: "var(--color-surface)",
            color: "var(--color-ink)",
            fontSize: "var(--text-xs)",
            boxShadow: "var(--elev-1)",
          }}
        >
          This browser can&apos;t play this video.
        </p>
      ) : null}
    </div>
  );
}
