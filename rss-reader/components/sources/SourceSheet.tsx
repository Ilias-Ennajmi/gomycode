"use client";

import * as React from "react";
import { Bell, BellOff, List, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useFeeds, deleteFeed } from "@/lib/hooks/useFeeds";
import { useFilters } from "@/lib/hooks/useFilters";
import { useReaderState } from "@/lib/hooks/useReaderState";
import { SourcePreview } from "@/components/discover/SourcePreview";
import type { DiscoverResult } from "@/lib/hooks/useDiscover";

const KIND = {
  rss: "rss",
  youtube: "youtube",
  newsletter: "newsletter",
  podcast: "podcast",
  manual: "rss",
} as const;

/**
 * The pop-up about a source you follow, from anywhere its name shows: the same look inside
 * as in Discover (cover, rhythm, latest items), plus what you can do with it here: open
 * its list, mute or unmute it, unfollow.
 */
export function SourceSheet({ feedId, onClose }: { feedId: string; onClose: () => void }) {
  const { feeds, mutate } = useFeeds();
  const { rules, addRule, removeRule } = useFilters();
  const { setView } = useReaderState();
  const feed = feeds.find((f) => f.id === feedId);
  const [busy, setBusy] = React.useState<"mute" | "unfollow" | null>(null);
  const [confirmUnfollow, setConfirmUnfollow] = React.useState(false);
  if (!feed) return null;

  const muteRule = rules.find(
    (r) => r.action === "hide" && r.match === "feed" && r.value === feed.id
  );
  const result: DiscoverResult = {
    url: feed.url,
    name: feed.title,
    kind: KIND[feed.type],
    lang: feed.language ?? undefined,
    description: feed.description ?? undefined,
    imageUrl: feed.coverUrl ?? feed.faviconUrl ?? undefined,
    siteUrl: feed.siteUrl ?? undefined,
    provider: "link",
    following: true,
  };

  async function toggleMute() {
    setBusy("mute");
    try {
      if (muteRule) {
        await removeRule(muteRule.id);
        toast.success(`${feed!.title} is back in your lists`);
      } else {
        await addRule({ action: "hide", match: "feed", value: feed!.id });
        toast.success(`Muted ${feed!.title}`, {
          description: "Still followed, just out of your lists.",
        });
      }
    } catch {
      toast.error("That didn't work");
    } finally {
      setBusy(null);
    }
  }

  async function unfollow() {
    if (!confirmUnfollow) {
      setConfirmUnfollow(true);
      return;
    }
    setBusy("unfollow");
    try {
      await deleteFeed(feed!.id);
      await mutate();
      toast.success(`Unfollowed ${feed!.title}`);
      onClose();
    } catch {
      toast.error("Couldn't unfollow");
      setBusy(null);
    }
  }

  const button =
    "flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full text-[13px] font-medium ring-1 ring-border transition-colors hover:bg-accent disabled:opacity-60";

  return (
    <SourcePreview
      result={result}
      following
      pending={false}
      onFollow={() => undefined}
      onClose={onClose}
      manage={
        <div className="flex w-full gap-2">
          <button
            type="button"
            className={button}
            onClick={() => {
              setView({ type: "feed", id: feed.id, label: feed.title });
              onClose();
            }}
          >
            <List className="h-4 w-4" /> Open
          </button>
          <button
            type="button"
            className={button}
            disabled={busy !== null}
            onClick={() => void toggleMute()}
          >
            {busy === "mute" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : muteRule ? (
              <Bell className="h-4 w-4" />
            ) : (
              <BellOff className="h-4 w-4" />
            )}
            {muteRule ? "Unmute" : "Mute"}
          </button>
          <button
            type="button"
            className={cn(
              button,
              confirmUnfollow &&
                "bg-destructive text-destructive-foreground ring-destructive hover:bg-destructive/90"
            )}
            disabled={busy !== null}
            onClick={() => void unfollow()}
          >
            {busy === "unfollow" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            {confirmUnfollow ? "Sure?" : "Unfollow"}
          </button>
        </div>
      }
    />
  );
}
