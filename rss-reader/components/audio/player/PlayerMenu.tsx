"use client";

import { Car, MoreHorizontal, Share, Text } from "lucide-react";
import { clock } from "@/lib/hooks/useVideo";
import { AUDIO_RATES, useAudio, type Episode } from "@/components/audio/AudioProvider";
import { SNIP_WINDOWS, useSnipWindow } from "@/lib/snips";
import { useSkipSponsors } from "@/lib/hooks/useSponsors";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useT } from "@/lib/i18n";
import { usePref } from "@/lib/prefs";
import { AUTO_DEFAULTS, type AutoDownloadPrefs } from "@/lib/auto-downloads";
import { requestAppEvent } from "@/lib/app-events";

/** Share this moment, open the episode, and the show's own settings (speed, skip intro). */
export function PlayerMenu({
  episode,
  current,
  onEpisodePage,
}: {
  episode: Episode;
  current: boolean;
  onEpisodePage: () => void;
}) {
  const { shareMoment, showPrefs, setShowPrefs, fx } = useAudio();
  const prefs = showPrefs(episode.feedId);
  const [snipWindow, setSnipWindow] = useSnipWindow();
  const [skipSponsors, setSkipSponsors] = useSkipSponsors();
  const catalogue = episode.id.startsWith("ext:");
  const { t } = useT();
  const [auto, setAuto] = usePref<AutoDownloadPrefs>("auto-download", AUTO_DEFAULTS);
  const autoOn = auto.shows.includes(episode.feedId);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t("More")}
          className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-accent/60"
        >
          <MoreHorizontal className="h-5 w-5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {current && (
          <DropdownMenuItem onSelect={() => void shareMoment()} className="gap-2">
            <Share className="h-4 w-4" /> {t("Share this moment")}
          </DropdownMenuItem>
        )}
        {current && (
          <DropdownMenuItem onSelect={() => requestAppEvent("car-mode")} className="gap-2">
            <Car className="h-4 w-4" /> {t("Car mode")}
          </DropdownMenuItem>
        )}
        {!catalogue && (
          <DropdownMenuItem onSelect={onEpisodePage} className="gap-2">
            <Text className="h-4 w-4" /> {t("Episode page")}
          </DropdownMenuItem>
        )}
        <DropdownMenuCheckboxItem checked={skipSponsors} onCheckedChange={setSkipSponsors}>
          {t("Skip sponsors")}
        </DropdownMenuCheckboxItem>
        {!catalogue && (
          <DropdownMenuCheckboxItem
            checked={autoOn}
            onCheckedChange={(on) =>
              setAuto((prev) => ({
                ...prev,
                shows: on
                  ? [...prev.shows.filter((id) => id !== episode.feedId), episode.feedId]
                  : prev.shows.filter((id) => id !== episode.feedId),
              }))
            }
          >
            {t("Download new episodes on Wi-Fi")}
          </DropdownMenuCheckboxItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs">
          {t("Sound")}
          <span className="block font-normal text-muted-foreground">
            {fx.active
              ? fx.trim && fx.saved() >= 1
                ? `${t("Silences trimmed")}: ${clock(fx.saved())}`
                : t("On for this episode")
              : t("From the next episode, if its show allows it, or on a download")}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuCheckboxItem checked={fx.boost} onCheckedChange={fx.setBoost}>
          {t("Voice boost")}
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem checked={fx.trim} onCheckedChange={fx.setTrim}>
          {t("Trim silences")}
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs">{t("A snip keeps the last")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={String(snipWindow)}
          onValueChange={(value) => setSnipWindow(Number(value) === 60 ? 60 : 30)}
        >
          {SNIP_WINDOWS.map((seconds) => (
            <DropdownMenuRadioItem key={seconds} value={String(seconds)}>
              {seconds} {t("seconds")}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs">
          {t("Speed for")} {episode.feedTitle}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={prefs.rate === undefined ? "default" : String(prefs.rate)}
          onValueChange={(value) =>
            setShowPrefs(episode.feedId, {
              ...prefs,
              rate: value === "default" ? undefined : Number(value),
            })
          }
        >
          <DropdownMenuRadioItem value="default">{t("Same as everywhere")}</DropdownMenuRadioItem>
          {AUDIO_RATES.map((rate) => (
            <DropdownMenuRadioItem key={rate} value={String(rate)}>
              {rate}×
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs">
          {t("Skip the start of each episode")}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={String(prefs.skipIntro ?? 0)}
          onValueChange={(value) =>
            setShowPrefs(episode.feedId, { ...prefs, skipIntro: Number(value) || undefined })
          }
        >
          {[0, 15, 30, 45, 60, 90].map((seconds) => (
            <DropdownMenuRadioItem key={seconds} value={String(seconds)}>
              {seconds === 0 ? t("Don't skip") : `${seconds} seconds`}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
