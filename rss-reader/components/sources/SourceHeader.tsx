"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  Bell,
  BellOff,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Settings2,
  Sparkles,
  UserMinus,
} from "lucide-react";
import { useSWRConfig } from "swr";
import { cn, formatRelativeTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { FeedFavicon } from "@/components/shared/FeedFavicon";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { deleteFeed, updateFeed, useCategories } from "@/lib/hooks/useFeeds";
import { useFilters } from "@/lib/hooks/useFilters";
import { useReaderState, type ViewState } from "@/lib/hooks/useReaderState";
import type { FeedSummary } from "@/lib/types";

const TYPE_LABEL: Record<string, string> = {
  rss: "Site",
  youtube: "YouTube channel",
  newsletter: "Newsletter",
  podcast: "Podcast",
  manual: "Saved links",
};

const HOME_VIEW: Record<string, ViewState> = {
  rss: { type: "rss", label: "RSS" },
  youtube: { type: "youtube", label: "YouTube" },
  newsletter: { type: "newsletters", label: "Newsletters" },
  podcast: { type: "podcasts", label: "Podcasts" },
};

/**
 * A source's own page, on top of its list: who it is, how much there is, its settings
 * (For You, full page, mute, alerts), open the site, unfollow.
 */
export function SourceHeader({ feed, total }: { feed: FeedSummary; total: number }) {
  const { setView } = useReaderState();
  const { categories } = useCategories();
  const { mutate } = useSWRConfig();
  const [settings, setSettings] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const category = categories.find((c) => c.id === feed.categoryId);
  const noun = feed.type === "youtube" ? "video" : feed.type === "podcast" ? "episode" : "article";

  async function unfollow() {
    try {
      await deleteFeed(feed.id);
      mutate((key) => typeof key === "string" && key.startsWith("/api/"));
      toast.success(`Unfollowed ${feed.title}`);
      setView(HOME_VIEW[feed.type] ?? { type: "all", label: "All articles" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not unfollow");
    }
  }

  return (
    <div className="flex gap-3 border-b px-4 py-3">
      <FeedFavicon
        title={feed.title}
        faviconUrl={feed.coverUrl || feed.faviconUrl}
        size={48}
        className="rounded-xl"
      />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
          <span>{TYPE_LABEL[feed.type] ?? "Source"}</span>
          <span aria-hidden>·</span>
          <span>
            {total} {noun}
            {total === 1 ? "" : "s"}
          </span>
          {feed.unreadCount > 0 && (
            <>
              <span aria-hidden>·</span>
              <span>{feed.unreadCount} unread</span>
            </>
          )}
          {feed.lastPublished && (
            <>
              <span aria-hidden>·</span>
              <span>last {formatRelativeTime(new Date(feed.lastPublished))}</span>
            </>
          )}
          {category && (
            <button
              type="button"
              onClick={() => setView({ type: "category", id: category.id, label: category.name })}
              className="inline-flex items-center gap-1 rounded-full border px-1.5 py-px hover:bg-accent"
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: category.color }}
                aria-hidden
              />
              {category.name}
            </button>
          )}
        </p>
        {feed.description && (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{feed.description}</p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {feed.siteUrl && (
            <Button variant="outline" size="sm" className="h-7 gap-1.5 px-2.5 text-xs" asChild>
              <a href={feed.siteUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5" />
                {feed.type === "youtube" ? "YouTube" : "Site"}
              </a>
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2.5 text-xs text-muted-foreground"
            onClick={() => setSettings(true)}
          >
            <Settings2 className="h-3.5 w-3.5" /> Settings
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2.5 text-xs text-muted-foreground"
            onClick={() => setConfirming(true)}
          >
            <UserMinus className="h-3.5 w-3.5" /> Unfollow
          </Button>
        </div>
      </div>
      <SourceSettingsSheet feed={feed} open={settings} onOpenChange={setSettings} />
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Unfollow ${feed.title}?`}
        description="This removes the source and its articles, except the ones saved to Later or highlighted. It can't be undone."
        confirmLabel="Unfollow"
        onConfirm={unfollow}
      />
    </div>
  );
}

/** Per-source switches: in For You, always the full page, muted, alerts on new items. */
export function SourceSettingsSheet({
  feed,
  open,
  onOpenChange,
}: {
  feed: FeedSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { mutate } = useSWRConfig();
  const { rules, addRule, removeRule } = useFilters();
  const [busy, setBusy] = React.useState<string | null>(null);
  const alertRule = rules.find(
    (r) => r.action === "alert" && r.match === "feed" && r.value === feed.id
  );
  const muteRule = rules.find(
    (r) => r.action === "hide" && r.match === "feed" && r.value === feed.id
  );

  const refresh = () => mutate((key) => typeof key === "string" && key.startsWith("/api/"));

  async function set(field: "inForYou" | "fullPage", value: boolean) {
    setBusy(field);
    try {
      await updateFeed(feed.id, { [field]: value });
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save");
    } finally {
      setBusy(null);
    }
  }

  async function toggleRule(kind: "alert" | "hide") {
    setBusy(kind);
    try {
      const existing = kind === "alert" ? alertRule : muteRule;
      if (existing) await removeRule(existing.id);
      else await addRule({ action: kind, match: "feed", value: feed.id });
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save");
    } finally {
      setBusy(null);
    }
  }

  const rows: {
    id: string;
    icon: React.ReactNode;
    label: string;
    hint: string;
    on: boolean;
    toggle: () => void;
  }[] = [
    {
      id: "inForYou",
      icon: <Sparkles className="h-4 w-4" />,
      label: "Show in For You",
      hint: "Off: its articles stay in their own lists and out of the ranked feed.",
      on: feed.inForYou,
      toggle: () => void set("inForYou", !feed.inForYou),
    },
    {
      id: "fullPage",
      icon: <FileText className="h-4 w-4" />,
      label: "Always load the full page",
      hint: "For sources whose feed only sends a teaser.",
      on: feed.fullPage,
      toggle: () => void set("fullPage", !feed.fullPage),
    },
    {
      id: "alert",
      icon: alertRule ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />,
      label: "Notify me of new items",
      hint: "A notification for each new item, and a line in Alerts.",
      on: Boolean(alertRule),
      toggle: () => void toggleRule("alert"),
    },
    {
      id: "hide",
      icon: muteRule ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />,
      label: "Muted",
      hint: "Stays followed, but leaves every list except its own.",
      on: Boolean(muteRule),
      toggle: () => void toggleRule("hide"),
    },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={feed.title}>
      <ul className="divide-y px-1">
        {rows.map((row) => (
          <li key={row.id}>
            <button
              type="button"
              onClick={row.toggle}
              disabled={busy !== null}
              role="switch"
              aria-checked={row.on}
              className="flex w-full items-center gap-3 px-2 py-3 text-left"
            >
              <span className={cn("shrink-0", row.on ? "text-primary" : "text-muted-foreground")}>
                {row.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{row.label}</span>
                <span className="block text-xs text-muted-foreground">{row.hint}</span>
              </span>
              <span
                aria-hidden
                className={cn(
                  "relative h-6 w-10 shrink-0 rounded-full transition-colors",
                  row.on ? "bg-primary" : "bg-muted"
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 h-5 w-5 rounded-full bg-background shadow transition-transform",
                    row.on ? "translate-x-[18px]" : "translate-x-0.5"
                  )}
                />
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="px-3 pt-3 text-xs text-muted-foreground">
        Rename and move it from Settings → Your sources.
      </p>
    </Sheet>
  );
}
