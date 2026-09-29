"use client";

import * as React from "react";
import { toast } from "sonner";
import { ExternalLink, UserMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FeedFavicon } from "@/components/shared/FeedFavicon";
import { deleteFeed } from "@/lib/hooks/useFeeds";
import { useReaderState } from "@/lib/hooks/useReaderState";
import { useSWRConfig } from "swr";
import type { FeedSummary } from "@/lib/types";

/** A YouTube channel's own page: who it is, how many videos, open it or unfollow. */
export function ChannelHeader({ feed, videoCount }: { feed: FeedSummary; videoCount: number }) {
  const { setView } = useReaderState();
  const { mutate } = useSWRConfig();
  const [confirming, setConfirming] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  async function unfollow() {
    setBusy(true);
    try {
      await deleteFeed(feed.id);
      mutate((key) => typeof key === "string" && key.startsWith("/api/"));
      toast.success(`Unfollowed ${feed.title}`);
      setView({ type: "youtube", label: "YouTube" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not unfollow");
      setBusy(false);
    }
  }

  return (
    <div className="flex gap-3 border-b px-4 py-3">
      <FeedFavicon title={feed.title} faviconUrl={feed.coverUrl || feed.faviconUrl} size={48} />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">
          {videoCount} video{videoCount === 1 ? "" : "s"}
          {feed.language ? ` · ${feed.language.toUpperCase()}` : ""}
        </p>
        {feed.description && (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{feed.description}</p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {feed.siteUrl && (
            <Button variant="outline" size="sm" className="h-7 gap-1.5 px-2.5 text-xs" asChild>
              <a href={feed.siteUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5" /> YouTube
              </a>
            </Button>
          )}
          {confirming ? (
            <>
              <Button
                variant="destructive"
                size="sm"
                className="h-7 px-2.5 text-xs"
                onClick={unfollow}
                disabled={busy}
              >
                Unfollow {feed.title}?
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2.5 text-xs"
                onClick={() => setConfirming(false)}
              >
                Keep
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2.5 text-xs text-muted-foreground"
              onClick={() => setConfirming(true)}
            >
              <UserMinus className="h-3.5 w-3.5" /> Unfollow
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
