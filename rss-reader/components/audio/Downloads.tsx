"use client";

import * as React from "react";
import { toast } from "sonner";
import { ArrowDownToLine, CheckCircle2, Play, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet } from "@/components/ui/sheet";
import { useT, tr } from "@/lib/i18n";
import { haptic } from "@/lib/native";
import { usePref } from "@/lib/prefs";
import { AUTO_DEFAULTS, LIMITS_MB, type AutoDownloadPrefs } from "@/lib/auto-downloads";
import { useAudio, type Episode } from "@/components/audio/AudioProvider";
import {
  DownloadError,
  downloadEpisode,
  formatBytes,
  removeDownload,
  useDownloads,
} from "@/lib/downloads";

// Episodes kept on the device: the player's download button, and the list of what's saved
// (Podcasts → ⋯ → Downloads). See lib/downloads.ts.

export function startDownload(episode: Episode) {
  haptic();
  downloadEpisode(episode)
    .then(() => toast.success(tr("Downloaded: it plays without a connection")))
    .catch((error) =>
      toast.error(error instanceof DownloadError ? error.message : tr("The download failed"))
    );
}

/** Download, its progress, or (when saved) remove it. */
export function DownloadButton({ episode, className }: { episode: Episode; className?: string }) {
  const { t } = useT();
  const { byId, progress } = useDownloads();
  const saved = byId[episode.id];
  const going = progress.get(episode.id);
  const percent = going === undefined ? null : Math.round(going * 100);
  const label = saved
    ? `${t("Downloaded")} · ${t("tap to remove")}`
    : percent !== null
      ? `${t("Downloading")} ${percent}%`
      : t("Download for offline");
  return (
    <button
      type="button"
      aria-label={t(label)}
      title={t(label)}
      disabled={percent !== null}
      onClick={() => {
        if (saved) {
          void removeDownload(episode.id);
          toast(t("Download removed"));
        } else startDownload(episode);
      }}
      className={cn(
        "relative flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-accent hover:text-foreground",
        saved && "text-primary",
        className
      )}
    >
      {saved ? (
        <CheckCircle2 className="h-5 w-5" />
      ) : percent !== null ? (
        <>
          <svg viewBox="0 0 36 36" className="absolute inset-1 -rotate-90" aria-hidden>
            <circle
              cx="18"
              cy="18"
              r="15"
              fill="none"
              stroke="currentColor"
              opacity={0.2}
              strokeWidth="3"
            />
            <circle
              cx="18"
              cy="18"
              r="15"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeDasharray={`${(percent / 100) * 94.2} 94.2`}
              className="text-primary"
            />
          </svg>
          <span className="text-[9px] font-bold tabular-nums">{percent}</span>
        </>
      ) : (
        <ArrowDownToLine className="h-5 w-5" />
      )}
    </button>
  );
}

/** Everything downloaded: play it, or free the space. */
export function DownloadsSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useT();
  const { list } = useDownloads();
  const audio = useAudio();
  const total = list.reduce((sum, d) => sum + d.bytes, 0);
  const [auto, setAuto] = usePref<AutoDownloadPrefs>("auto-download", AUTO_DEFAULTS);
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={t("Downloads")}>
      {auto.shows.length > 0 && (
        <label className="mx-4 mb-2 flex items-center gap-3 rounded-xl bg-muted/60 px-3 py-2.5 text-sm">
          <span className="min-w-0 flex-1">
            <span className="block font-medium">{t("Automatic downloads")}</span>
            <span className="block text-xs text-muted-foreground">
              {t("New episodes of {n} shows, on Wi-Fi, when Reader is open").replace(
                "{n}",
                String(auto.shows.length)
              )}
            </span>
          </span>
          <select
            value={auto.limitMB}
            onChange={(event) =>
              setAuto((prev) => ({ ...prev, limitMB: Number(event.target.value) }))
            }
            aria-label={t("Storage limit")}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            {LIMITS_MB.map((mb) => (
              <option key={mb} value={mb}>
                {mb >= 1000 ? `${mb / 1000} GB` : `${mb} MB`}
              </option>
            ))}
          </select>
        </label>
      )}
      {list.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-muted-foreground">
          {t("Nothing downloaded. Use the arrow in the player to keep an episode for offline.")}
        </p>
      ) : (
        <>
          <ul className="divide-y px-2">
            {list.map(({ episode, bytes }) => (
              <li key={episode.id} className="flex items-center gap-3 px-2 py-2.5">
                <button
                  type="button"
                  onClick={() => {
                    audio.play(episode, episode.watchedSeconds ?? 0);
                    onOpenChange(false);
                  }}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-muted">
                    {episode.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={episode.imageUrl} alt="" className="h-full w-full object-cover" />
                    )}
                    <span className="absolute inset-0 flex items-center justify-center bg-black/30 text-white">
                      <Play className="h-4 w-4 fill-current" />
                    </span>
                  </span>
                  <span className="min-w-0">
                    <span className="line-clamp-2 text-sm font-semibold leading-snug">
                      {episode.title}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {episode.feedTitle} · {formatBytes(bytes)}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => void removeDownload(episode.id)}
                  aria-label={`${t("Remove download")}: ${episode.title}`}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
          <p className="px-5 pb-2 pt-3 text-center text-xs text-muted-foreground">
            {formatBytes(total)} · {t("Removed on their own once you've listened to the end.")}
          </p>
        </>
      )}
    </Sheet>
  );
}
