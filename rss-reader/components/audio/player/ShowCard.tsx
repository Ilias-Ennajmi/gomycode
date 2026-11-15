"use client";

import * as React from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useReaderState } from "@/lib/hooks/useReaderState";
import { type Episode } from "@/components/audio/AudioProvider";
import { useFeeds } from "@/lib/hooks/useFeeds";
import { Art, MediaCard } from "@/components/media/MediaCards";
import { useT, tr } from "@/lib/i18n";

/** About the show: its picture, name, description, and the way to its page. */
export function ShowCard({ episode, onOpenShow }: { episode: Episode; onOpenShow: () => void }) {
  const { t } = useT();
  const { feeds, mutate } = useFeeds();
  const { setView } = useReaderState();
  const feed = feeds.find((f) => f.id === episode.feedId);
  const [more, setMore] = React.useState(false);
  const [following, setFollowing] = React.useState(false);
  const external = episode.id.startsWith("ext:");
  const followedUrl = external && episode.feedUrl && feeds.some((f) => f.url === episode.feedUrl);
  async function follow() {
    if (!episode.feedUrl) return;
    setFollowing(true);
    try {
      const res = await fetch("/api/feeds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: episode.feedUrl, kind: "podcast" }),
      });
      if (!res.ok) throw new Error();
      await mutate();
      toast.success(`Following ${episode.feedTitle}`);
    } catch {
      toast.error(tr("Couldn't follow this show"));
    } finally {
      setFollowing(false);
    }
  }
  const description = feed?.description?.replace(/<[^>]+>/g, " ").trim();
  return (
    <MediaCard id="about-show" title={t("About the podcast")}>
      <div className="flex items-center gap-3">
        <Art
          src={feed?.coverUrl ?? episode.imageUrl ?? feed?.faviconUrl}
          name={episode.feedTitle}
          className="h-12 w-12 rounded-lg text-lg"
        />
        <p className="min-w-0 flex-1 truncate font-semibold">{episode.feedTitle}</p>
        {feed ? (
          <button
            type="button"
            onClick={() => {
              setView({ type: "feed", id: feed.id, label: feed.title });
              onOpenShow();
            }}
            className="h-8 shrink-0 rounded-full px-3 text-xs font-semibold ring-1 ring-border hover:bg-accent"
          >
            {t("Following")}
          </button>
        ) : external && episode.feedUrl ? (
          <button
            type="button"
            disabled={Boolean(followedUrl) || following}
            onClick={() => void follow()}
            className="h-8 shrink-0 rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-60"
          >
            {followedUrl ? t("Following") : following ? "…" : t("Follow")}
          </button>
        ) : null}
      </div>
      {description && (
        <p className={cn("mt-3 text-sm text-muted-foreground", !more && "line-clamp-3")}>
          {description}
        </p>
      )}
      {description && description.length > 160 && (
        <button
          type="button"
          onClick={() => setMore((v) => !v)}
          className="mt-1 text-sm font-semibold hover:underline"
        >
          {more ? t("see less") : t("… see more")}
        </button>
      )}
    </MediaCard>
  );
}
