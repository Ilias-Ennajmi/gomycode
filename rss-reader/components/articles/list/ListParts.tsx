"use client";

import * as React from "react";
import {
  Archive,
  Bell,
  Bookmark,
  AlarmClock,
  AtSign,
  Headphones,
  Hourglass,
  Inbox,
  Mail,
  MonitorPlay,
  Rss,
  SearchX,
  Sparkles,
} from "lucide-react";
import { useAiStatus } from "@/lib/hooks/useAi";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Chip } from "@/components/ui/chip";
import { requestAppEvent } from "@/lib/app-events";
import { useT } from "@/lib/i18n";
import type { LaterTab, SearchScope, SearchSince } from "@/lib/types";
import type { DiscoverKind } from "@/lib/discover/catalog";

export const SCOPES: { id: SearchScope; label: string }[] = [
  { id: "all", label: "Everything" },
  { id: "news", label: "News" },
  { id: "rss", label: "RSS" },
  { id: "youtube", label: "YouTube" },
  { id: "newsletter", label: "Newsletters" },
  { id: "podcast", label: "Podcasts" },
  { id: "later", label: "Later" },
  { id: "highlights", label: "Highlighted" },
];

/** Where to search and how far back. */
export function SearchFilters({
  scope,
  onScope,
  since,
  onSince,
  meaning,
  onMeaning,
}: {
  scope: SearchScope;
  onScope: (scope: SearchScope) => void;
  since: SearchSince;
  onSince: (since: SearchSince) => void;
  meaning: boolean;
  onMeaning: (on: boolean) => void;
}) {
  const { t } = useT();
  const ai = useAiStatus();
  return (
    <div className="flex items-center gap-2 border-b px-3 py-2">
      <div
        role="toolbar"
        aria-label={t("Search in")}
        className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto scrollbar-none"
      >
        {ai?.enabled && (
          <Chip active={meaning} quiet onClick={() => onMeaning(!meaning)} className="gap-1">
            <Sparkles className="h-3.5 w-3.5" /> {t("By meaning")}
          </Chip>
        )}
        {SCOPES.map((option) => (
          <Chip
            key={option.id}
            active={scope === option.id}
            onClick={(event) => {
              event.currentTarget.scrollIntoView({ inline: "nearest", block: "nearest" });
              onScope(option.id);
            }}
          >
            {t(option.label)}
          </Chip>
        ))}
      </div>
      <Select value={since} onValueChange={(v) => onSince(v as SearchSince)}>
        <SelectTrigger className="h-7 w-[104px] shrink-0 text-xs" aria-label={t("When")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="any">{t("Any time")}</SelectItem>
          <SelectItem value="day">{t("Past day")}</SelectItem>
          <SelectItem value="week">{t("Past week")}</SelectItem>
          <SelectItem value="month">{t("Past month")}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

export const LATER_TITLES: Record<LaterTab, string> = {
  queue: "Later",
  snoozed: "Snoozed",
  archive: "Archive",
  highlights: "Highlights",
  collections: "Collections",
};

export function EmptyState({
  search,
  view,
  onAddFeed,
  onSaveLink,
  onGoLater,
  onShowLatest,
  onRefresh,
}: {
  search: string;
  view: string;
  onAddFeed: (kind?: DiscoverKind) => void;
  onSaveLink: () => void;
  onGoLater: () => void;
  onShowLatest: () => void;
  onRefresh: () => void;
}) {
  const { t } = useT();
  if (search) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
        <SearchX className="h-8 w-8" />
        <p className="text-sm">
          {t("No results for “")}
          {search}&rdquo;
        </p>
      </div>
    );
  }

  if (view === "later-queue") {
    return (
      <EmptyMessage
        icon={<Bookmark className="h-10 w-10" />}
        text="Nothing to read later yet. Save any link, or tap the bookmark on an article."
        action="Save a link"
        onAction={onSaveLink}
      />
    );
  }

  if (view === "later-snoozed") {
    return (
      <EmptyMessage
        icon={<AlarmClock className="h-10 w-10" />}
        text="Nothing snoozed. Snooze an article to have it come back to Later when you have time."
        action="Back to Later"
        onAction={onGoLater}
      />
    );
  }

  if (view === "later-archive") {
    return (
      <EmptyMessage
        icon={<Archive className="h-10 w-10" />}
        text="Your archive is empty. Items you finish in Later end up here."
        action="Back to Later"
        onAction={onGoLater}
      />
    );
  }

  if (view === "youtube") {
    return (
      <EmptyMessage
        icon={<MonitorPlay className="h-10 w-10" />}
        text="No videos yet. Follow a YouTube channel and its new uploads land here."
        action="Find YouTube channels"
        onAction={() => onAddFeed("youtube")}
      />
    );
  }

  if (view === "alerts") {
    return (
      <EmptyMessage
        icon={<Bell className="h-10 w-10" />}
        text="No alerts yet. Add words or sources to watch, and anything new that matches lands here with a notification."
        action="Add an alert"
        onAction={() => requestAppEvent("content-filters")}
      />
    );
  }

  if (view === "podcasts") {
    return (
      <EmptyMessage
        icon={<Headphones className="h-10 w-10" />}
        text="No episodes yet. Follow a podcast and new episodes land here, ready to play while you read."
        action="Find podcasts"
        onAction={() => onAddFeed("podcast")}
      />
    );
  }

  if (view === "podcasts-progress") {
    return (
      <EmptyMessage
        icon={<Hourglass className="h-10 w-10" />}
        text="Nothing in progress. Episodes you start and don't finish wait here."
        action="See the latest episodes"
        onAction={onShowLatest}
      />
    );
  }

  if (view === "newsletters-email") {
    return (
      <EmptyMessage
        icon={<AtSign className="h-10 w-10" />}
        text="No email newsletters yet. Get an address to sign up with, and every issue lands here."
        action="Get an address"
        onAction={() => requestAppEvent("email-newsletter")}
      />
    );
  }

  if (view === "newsletters" || view === "newsletters-web") {
    return (
      <EmptyMessage
        icon={<Mail className="h-10 w-10" />}
        text="No newsletters yet. Follow Substack and other newsletters and new issues land here."
        action="Find newsletters"
        onAction={() => onAddFeed("newsletter")}
      />
    );
  }

  if (view === "rss") {
    return (
      <EmptyMessage
        icon={<Rss className="h-10 w-10" />}
        text="No articles yet. Follow a few sites to get started."
        action="Discover sites"
        onAction={() => onAddFeed("rss")}
      />
    );
  }

  if (view === "feed") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
        <Inbox className="h-8 w-8" />
        <p className="text-sm">{t("No articles yet. Try refreshing.")}</p>
        <Button size="sm" variant="outline" onClick={onRefresh}>
          {t("Refresh now")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground">
      <Inbox className="h-10 w-10" />
      <p className="text-sm">{t("No articles here yet.")}</p>
      <Button size="sm" onClick={() => onAddFeed()}>
        {t("Discover sources")}
      </Button>
    </div>
  );
}

export function EmptyMessage({
  icon,
  text,
  action,
  onAction,
}: {
  icon: React.ReactNode;
  text: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground">
      {icon}
      <p className="max-w-xs text-sm">{text}</p>
      {action && onAction && (
        <Button size="sm" onClick={onAction}>
          {action}
        </Button>
      )}
    </div>
  );
}
