"use client";

import * as React from "react";
import { Pause, Play, RotateCcw, RotateCw, SkipForward, X } from "lucide-react";
import { useAudio } from "@/components/audio/AudioProvider";
import { useTimeOf } from "@/components/media/MediaCards";
import { useBackToClose } from "@/lib/hooks/useHistorySync";
import { clock } from "@/lib/hooks/useVideo";
import { useT } from "@/lib/i18n";
import { haptic } from "@/lib/native";

// Car mode: the episode with nothing but huge targets you can hit without looking twice,
// high contrast, and the screen kept on while it's open (Wake Lock) so it doesn't lock
// mid-drive. Back 15, play/pause, ahead 30, next episode.

function useWakeLock() {
  React.useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    let gone = false;
    const take = async () => {
      try {
        const nav = navigator as Navigator & {
          wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> };
        };
        lock = (await nav.wakeLock?.request("screen")) ?? null;
        if (gone) void lock?.release();
      } catch {
        // Not allowed (battery saver, old browser): the screen just times out as usual.
      }
    };
    // A wake lock ends when the page is hidden; take it again on return.
    const onVisible = () => document.visibilityState === "visible" && void take();
    void take();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      gone = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => undefined);
    };
  }, []);
}

export function CarMode({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const audio = useAudio();
  const now = useTimeOf(audio.time);
  useBackToClose(true, onClose);
  useWakeLock();
  const episode = audio.episode;
  React.useEffect(() => {
    if (!episode) onClose();
  }, [episode, onClose]);
  if (!episode) return null;
  const tap = (fn: () => void) => () => {
    haptic();
    fn();
  };
  const big =
    "flex items-center justify-center rounded-3xl bg-white/10 text-white transition-transform active:scale-95 active:bg-white/20";
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("Car mode")}
      className="fixed inset-0 z-[80] flex flex-col bg-black px-5 pb-safe pt-safe text-white animate-fade-in"
    >
      <div className="flex items-center justify-between pt-3">
        <p className="text-sm font-semibold uppercase tracking-widest text-white/60">
          {t("Car mode")}
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("Leave car mode")}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 active:bg-white/20"
        >
          <X className="h-7 w-7" />
        </button>
      </div>

      <div className="mt-6 min-h-0 flex-1">
        <p className="line-clamp-3 text-[28px] font-bold leading-tight">{episode.title}</p>
        <p className="mt-2 truncate text-lg text-white/70">{episode.feedTitle}</p>
        <p className="mt-4 text-2xl font-semibold tabular-nums text-white/80">
          {clock(now)}
          {audio.duration ? ` / ${clock(audio.duration)}` : ""}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <button
          type="button"
          onClick={tap(() => audio.skip(-15))}
          aria-label={t("Back 15 seconds")}
          className={`${big} aspect-square flex-col gap-1`}
        >
          <RotateCcw className="h-10 w-10" />
          <span className="text-lg font-bold">15</span>
        </button>
        <button
          type="button"
          onClick={tap(audio.toggle)}
          aria-label={audio.playing ? t("Pause") : t("Play")}
          className={`${big} aspect-square bg-white text-black active:bg-white/80`}
        >
          {audio.playing ? (
            <Pause className="h-16 w-16 fill-current" />
          ) : (
            <Play className="ml-2 h-16 w-16 fill-current" />
          )}
        </button>
        <button
          type="button"
          onClick={tap(() => audio.skip(30))}
          aria-label={t("Ahead 30 seconds")}
          className={`${big} aspect-square flex-col gap-1`}
        >
          <RotateCw className="h-10 w-10" />
          <span className="text-lg font-bold">30</span>
        </button>
      </div>
      <button
        type="button"
        onClick={tap(audio.next)}
        className={`${big} mb-4 mt-3 h-20 gap-3 text-xl font-semibold`}
      >
        <SkipForward className="h-8 w-8 fill-current" /> {t("Next episode")}
      </button>
    </div>
  );
}
