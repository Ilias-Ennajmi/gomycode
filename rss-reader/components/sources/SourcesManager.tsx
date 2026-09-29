"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  Eye,
  EyeOff,
  FolderInput,
  Layers,
  Library,
  Mail,
  MoreHorizontal,
  Newspaper,
  Pencil,
  Play,
  Plus,
  Rss,
  Search,
  Trash2,
  X,
} from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn, formatRelativeTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { keepOpenOnToast } from "@/components/ui/sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { FeedFavicon } from "@/components/shared/FeedFavicon";
import { deleteFeed, updateFeed, useCategories, useFeeds } from "@/lib/hooks/useFeeds";
import { useFilters } from "@/lib/hooks/useFilters";
import { useReaderState } from "@/lib/hooks/useReaderState";
import { isTopicFeedUrl } from "@/lib/discover/topics";
import type { DiscoverKind } from "@/lib/discover/catalog";
import type { CategorySummary, FeedSummary } from "@/lib/types";

interface SourcesManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddFeed: (kind?: DiscoverKind) => void;
}

type Channel = "all" | "rss" | "youtube" | "newsletter" | "attention";

const CHANNELS: { id: Channel; label: string; icon: React.ElementType }[] = [
  { id: "all", label: "All", icon: Layers },
  { id: "rss", label: "Sites", icon: Rss },
  { id: "youtube", label: "YouTube", icon: Play },
  { id: "newsletter", label: "Newsletters", icon: Mail },
  { id: "attention", label: "Needs attention", icon: AlertTriangle },
];

const QUIET_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

type Health = "failing" | "quiet" | "ok";

function healthOf(feed: FeedSummary): Health {
  if (feed.errorCount >= 3) return "failing";
  // A feed followed recently hasn't had time to go quiet.
  const since = feed.lastPublished ?? feed.createdAt;
  if (Date.now() - new Date(since).getTime() > QUIET_DAYS * DAY_MS) return "quiet";
  return "ok";
}

function fold(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Every followed source in one place: search, rename, move, mute, unfollow, and spot broken feeds. */
export function SourcesManager({ open, onOpenChange, onAddFeed }: SourcesManagerProps) {
  const { feeds, mutate: mutateFeeds } = useFeeds();
  const { categories, mutate: mutateCategories } = useCategories();
  const { setView } = useReaderState();
  const [channel, setChannel] = React.useState<Channel>("all");
  const [query, setQuery] = React.useState("");

  React.useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  function refetch() {
    mutateFeeds();
    mutateCategories();
  }

  const needsAttention = feeds.filter((f) => healthOf(f) !== "ok");
  const counts: Record<Channel, number> = {
    all: feeds.length,
    rss: feeds.filter((f) => f.type === "rss").length,
    youtube: feeds.filter((f) => f.type === "youtube").length,
    newsletter: feeds.filter((f) => f.type === "newsletter").length,
    attention: needsAttention.length,
  };

  const words = fold(query).split(/\s+/).filter(Boolean);
  const visible = feeds.filter((feed) => {
    if (
      channel === "attention" ? healthOf(feed) === "ok" : channel !== "all" && feed.type !== channel
    ) {
      return false;
    }
    const haystack = fold(`${feed.title} ${feed.siteUrl ?? ""} ${feed.url}`);
    return words.every((w) => haystack.includes(w));
  });

  const groups: { id: string; name: string; color?: string; feeds: FeedSummary[] }[] = [
    ...categories.map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      feeds: visible.filter((f) => f.categoryId === c.id),
    })),
    { id: "none", name: "No category", feeds: visible.filter((f) => !f.categoryId) },
  ].filter((g) => g.feeds.length > 0);

  function openFeed(feed: FeedSummary) {
    setView({ type: "feed", id: feed.id, label: feed.title });
    onOpenChange(false);
  }

  const addKind: DiscoverKind =
    channel === "rss" || channel === "youtube" || channel === "newsletter" ? channel : "all";

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content
          className={cn(
            "fixed inset-0 z-50 flex flex-col bg-background shadow-2xl data-[state=open]:animate-fade-in",
            "sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-[min(88vh,820px)] sm:w-[min(94vw,760px)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:overflow-hidden sm:rounded-2xl sm:border"
          )}
          aria-describedby={undefined}
          onInteractOutside={keepOpenOnToast}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <header className="shrink-0 border-b px-4 pb-3 pt-safe sm:px-6 sm:pt-5">
            <div className="flex items-center gap-2 pt-3 sm:pt-0">
              <Library className="h-5 w-5 text-primary" />
              <DialogPrimitive.Title className="text-lg font-semibold tracking-tight">
                Your sources
              </DialogPrimitive.Title>
              <span className="text-sm text-muted-foreground">{feeds.length}</span>
              <Button
                size="sm"
                className="ml-auto h-8 gap-1 rounded-full px-3 text-xs"
                onClick={() => {
                  onOpenChange(false);
                  onAddFeed(addKind);
                }}
              >
                <Plus className="h-3.5 w-3.5" /> Add
              </Button>
              <DialogPrimitive.Close
                className="-mr-2 rounded-full p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </DialogPrimitive.Close>
            </div>

            <div className="relative mt-3">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search your sources"
                className="h-10 w-full rounded-xl border bg-muted/40 pl-10 pr-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
                aria-label="Search your sources"
              />
            </div>

            <div className="-mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 scrollbar-none sm:-mx-6 sm:px-6">
              {CHANNELS.map(({ id, label, icon: Icon }) => {
                if (id === "attention" && counts.attention === 0) return null;
                const active = channel === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setChannel(id)}
                    aria-pressed={active}
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors",
                      active
                        ? "border-foreground bg-foreground text-background"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground",
                      id === "attention" &&
                        !active &&
                        "border-amber-500/40 text-amber-600 dark:text-amber-400"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                    <span className="tabular-nums opacity-70">{counts[id]}</span>
                  </button>
                );
              })}
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-safe sm:px-6">
            {groups.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-16 text-center text-sm text-muted-foreground">
                <p>
                  {feeds.length === 0
                    ? "You don't follow anything yet."
                    : channel === "attention"
                      ? "Every source is healthy."
                      : "No sources match."}
                </p>
                {feeds.length === 0 && (
                  <Button
                    size="sm"
                    onClick={() => {
                      onOpenChange(false);
                      onAddFeed(addKind);
                    }}
                  >
                    Discover sources
                  </Button>
                )}
              </div>
            ) : (
              groups.map((group) => (
                <section key={group.id} className="pt-5">
                  <h3 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    {group.color && (
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: group.color }}
                        aria-hidden
                      />
                    )}
                    {group.name}
                    <span className="font-normal tabular-nums">{group.feeds.length}</span>
                  </h3>
                  <ul className="divide-y divide-border/60">
                    {group.feeds.map((feed) => (
                      <SourceItem
                        key={feed.id}
                        feed={feed}
                        categories={categories}
                        onOpen={() => openFeed(feed)}
                        onChanged={refetch}
                      />
                    ))}
                  </ul>
                </section>
              ))
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

const TYPE_ICON = { rss: Rss, youtube: Play, newsletter: Mail, manual: Rss } as const;

function SourceItem({
  feed,
  categories,
  onOpen,
  onChanged,
}: {
  feed: FeedSummary;
  categories: CategorySummary[];
  onOpen: () => void;
  onChanged: () => void;
}) {
  const { rules, addRule, removeRule } = useFilters();
  const [renaming, setRenaming] = React.useState(false);
  const [draft, setDraft] = React.useState(feed.title);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const health = healthOf(feed);
  const topic = isTopicFeedUrl(feed.url);
  const TypeIcon = topic ? Newspaper : TYPE_ICON[feed.type];

  async function commitRename() {
    setRenaming(false);
    const title = draft.trim();
    if (!title || title === feed.title) {
      setDraft(feed.title);
      return;
    }
    try {
      await updateFeed(feed.id, { title });
      onChanged();
    } catch (error) {
      setDraft(feed.title);
      toast.error(error instanceof Error ? error.message : "Could not rename");
    }
  }

  async function move(categoryId: string | null) {
    try {
      await updateFeed(feed.id, { categoryId });
      onChanged();
      const name = categories.find((c) => c.id === categoryId)?.name;
      toast.success(name ? `Moved to ${name}` : "Removed from its category");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not move");
    }
  }

  async function toggleMute() {
    try {
      if (feed.muted) {
        const rule = rules.find(
          (r) => r.action === "hide" && r.match === "feed" && r.value === feed.id
        );
        if (rule) await removeRule(rule.id);
        toast.success(`Unmuted ${feed.title}`);
      } else {
        await addRule({ action: "hide", match: "feed", value: feed.id });
        toast.success(`Muted ${feed.title}. It stays followed but leaves your lists.`);
      }
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update");
    }
  }

  async function unfollow() {
    await deleteFeed(feed.id);
    toast.success(`Unfollowed ${feed.title}`);
    onChanged();
  }

  const lastPost = feed.lastPublished ? formatRelativeTime(new Date(feed.lastPublished)) : null;

  return (
    <li className={cn("flex items-center gap-3 py-2.5", feed.muted && "opacity-60")}>
      <div className="relative shrink-0">
        <FeedFavicon
          title={feed.title}
          faviconUrl={feed.faviconUrl}
          size={36}
          className="rounded-lg ring-1 ring-border/60"
        />
        <span
          className={cn(
            "absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full ring-2 ring-background",
            feed.type === "youtube" ? "bg-red-600 text-white" : "bg-muted text-muted-foreground"
          )}
          aria-hidden
        >
          <TypeIcon className="h-2.5 w-2.5" />
        </span>
      </div>

      <div className="min-w-0 flex-1">
        {renaming ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                setDraft(feed.title);
                setRenaming(false);
              }
            }}
            className="h-7 w-full rounded-md border bg-background px-2 text-sm outline-none focus-visible:border-primary"
            aria-label="Source name"
          />
        ) : (
          <button
            type="button"
            onClick={onOpen}
            className="block max-w-full truncate text-left text-[14px] font-medium hover:underline"
          >
            {feed.title}
          </button>
        )}
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11.5px] text-muted-foreground">
          {health === "failing" && (
            <span className="inline-flex items-center gap-1 rounded bg-destructive/10 px-1.5 py-px font-medium text-destructive">
              <AlertTriangle className="h-3 w-3" /> Not loading
            </span>
          )}
          {health === "quiet" && (
            <span className="rounded bg-amber-500/10 px-1.5 py-px font-medium text-amber-600 dark:text-amber-400">
              Quiet for {QUIET_DAYS}+ days
            </span>
          )}
          {feed.muted && <span className="rounded bg-muted px-1.5 py-px font-medium">Muted</span>}
          <span>{lastPost ? `Last post ${lastPost}` : "No posts yet"}</span>
          {feed.unreadCount > 0 && (
            <>
              <span aria-hidden>·</span>
              <span>{feed.unreadCount} unread</span>
            </>
          )}
          {feed.language && (
            <>
              <span aria-hidden>·</span>
              <span className="uppercase">{feed.language}</span>
            </>
          )}
        </p>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger
          className="shrink-0 rounded-full p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label={`Actions for ${feed.title}`}
        >
          <MoreHorizontal className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onSelect={() => setRenaming(true)} className="gap-2">
            <Pencil className="h-4 w-4" /> Rename
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="gap-2">
              <FolderInput className="h-4 w-4" /> Move to
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
              {categories.map((category) => (
                <DropdownMenuItem
                  key={category.id}
                  onSelect={() => move(category.id)}
                  disabled={category.id === feed.categoryId}
                  className="gap-2"
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: category.color }}
                    aria-hidden
                  />
                  {category.name}
                  {category.id === feed.categoryId && <Check className="ml-auto h-3.5 w-3.5" />}
                </DropdownMenuItem>
              ))}
              {categories.length > 0 && <DropdownMenuSeparator />}
              <DropdownMenuItem onSelect={() => move(null)} disabled={!feed.categoryId}>
                No category
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem onSelect={toggleMute} className="gap-2">
            {feed.muted ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            {feed.muted ? "Unmute" : "Mute"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => setConfirmDelete(true)}
            className="gap-2 text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4" /> Unfollow
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Unfollow ${feed.title}?`}
        description="This removes the source and all of its articles, including any saved to Later. It can't be undone."
        confirmLabel="Unfollow"
        onConfirm={unfollow}
      />
    </li>
  );
}
