"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  AtSign,
  Compass,
  Layers,
  Loader2,
  Mail,
  Newspaper,
  Play,
  Rss,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { keepOpenOnToast } from "@/components/ui/sonner";
import { sourceKey } from "@/lib/source-key";
import { useAiStatus } from "@/lib/hooks/useAi";
import { useCategories, useFeeds } from "@/lib/hooks/useFeeds";
import {
  describeInterests,
  useCatalog,
  useDiscoverLangs,
  useDiscoverSearch,
  useExplore,
  useFollow,
  useMoveFeed,
  useSuggestions,
  useUnfollow,
  type DiscoverResult,
  type FollowResult,
} from "@/lib/hooks/useDiscover";
import type { DiscoverKind, Language, SourceKind } from "@/lib/discover/catalog";
import { requestAppEvent } from "@/lib/app-events";
import { siteTopic, topicResult } from "@/lib/discover/topics";
import { KIND_META, SourceRow } from "@/components/discover/SourceRow";

interface DiscoverDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The channel Discover opens on, e.g. "youtube" from the YouTube tab. */
  initialKind?: DiscoverKind;
}

const LANGUAGE_LABELS: Record<Language, string> = { en: "English", fr: "Français" };
const KIND_ORDER: SourceKind[] = ["rss", "youtube", "newsletter"];
const KIND_HEADINGS: Record<SourceKind, string> = {
  rss: "Sites & blogs",
  youtube: "YouTube channels",
  newsletter: "Newsletters",
};

/** Mid-sentence names: "Explore more YouTube channels in Gaming". */
const KIND_NOUNS: Record<SourceKind, string> = {
  rss: "sites & blogs",
  youtube: "YouTube channels",
  newsletter: "newsletters",
};

const CHANNELS: { id: DiscoverKind; label: string; icon: React.ElementType }[] = [
  { id: "all", label: "All", icon: Layers },
  { id: "rss", label: "Sites", icon: Rss },
  { id: "youtube", label: "YouTube", icon: Play },
  { id: "newsletter", label: "Newsletters", icon: Mail },
];

const TITLES: Record<DiscoverKind, string> = {
  all: "Discover",
  rss: "Find sites & blogs",
  youtube: "Find YouTube channels",
  newsletter: "Find newsletters",
};

const PLACEHOLDERS: Record<DiscoverKind, string> = {
  all: "Search or paste a link",
  rss: "Search sites or paste a link",
  youtube: "Search channels or paste a link",
  newsletter: "Search newsletters or paste a link",
};

const FOR_YOU = "for-you";

type Added = { feedId: string; categoryId: string | null };

/** Find sources by channel, interest, search or AI description, and follow them in one tap. */
export function DiscoverDialog({ open, onOpenChange, initialKind = "all" }: DiscoverDialogProps) {
  const { feeds } = useFeeds();
  const { categories: userCategories } = useCategories();
  const { langs, toggle } = useDiscoverLangs();
  const [kind, setKind] = React.useState<DiscoverKind>(initialKind);
  const [query, setQuery] = React.useState("");
  const [section, setSection] = React.useState<string | null>(null);
  // Follows made while the dialog is open, so rows update without refetching.
  const [followed, setFollowed] = React.useState<Set<string>>(new Set());
  const [unfollowed, setUnfollowed] = React.useState<Set<string>>(new Set());
  const [pending, setPending] = React.useState<Set<string>>(new Set());
  const [added, setAdded] = React.useState<Map<string, Added>>(new Map());
  const [lastFollowed, setLastFollowed] = React.useState<{ id: string; title: string } | null>(
    null
  );
  const follow = useFollow();
  const unfollow = useUnfollow();
  const moveFeed = useMoveFeed();
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const firstRun = feeds.length === 0 && followed.size === 0;

  React.useEffect(() => {
    if (!open) return;
    setKind(initialKind);
    setQuery("");
    setSection(null);
    setLastFollowed(null);
    // Quietly re-check a few catalog links so broken ones drop out.
    fetch("/api/discover/health", { method: "POST" }).catch(() => undefined);
  }, [open, initialKind]);

  const {
    categories: catalogCategories,
    entries,
    isLoading: catalogLoading,
  } = useCatalog(langs, kind);
  // New readers start on the first interest; everyone else on "For you".
  const activeSection = section ?? (firstRun ? (catalogCategories[0]?.id ?? FOR_YOU) : FOR_YOU);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [activeSection, kind]);

  const isFollowing = (r: DiscoverResult) => {
    const key = sourceKey(r.url);
    return followed.has(key) || (Boolean(r.following) && !unfollowed.has(key));
  };

  const updateSet = (
    setter: React.Dispatch<React.SetStateAction<Set<string>>>,
    keys: string[],
    add: boolean
  ) =>
    setter((prev) => {
      const next = new Set(prev);
      keys.forEach((k) => (add ? next.add(k) : next.delete(k)));
      return next;
    });

  async function undo(entriesToUndo: { key: string; feedId: string }[]) {
    try {
      await unfollow(entriesToUndo.map((e) => e.feedId));
      const keys = entriesToUndo.map((e) => e.key);
      updateSet(setFollowed, keys, false);
      updateSet(setUnfollowed, keys, true);
      setAdded((prev) => {
        const next = new Map(prev);
        keys.forEach((k) => next.delete(k));
        return next;
      });
      setLastFollowed((prev) =>
        prev && entriesToUndo.some((e) => e.feedId === prev.id) ? null : prev
      );
      toast(entriesToUndo.length === 1 ? "Unfollowed" : `Unfollowed ${entriesToUndo.length}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not undo");
    }
  }

  function reportFailures(failed: { item: DiscoverResult; result?: FollowResult }[]) {
    if (failed.length === 0) return;
    if (failed.length > 1) {
      toast.error(`${failed.length} sources couldn't be followed`, {
        description: failed.map((f) => f.item.name).join(", "),
      });
      return;
    }
    const { item, result } = failed[0];
    const site = siteTopic(item.siteUrl || item.url);
    const offerNews = result?.code === "no-feed" && item.provider !== "topic" && site;
    toast.error(`${item.name}: ${result?.error ?? "couldn't be followed"}`, {
      description: offerNews ? "You can still follow its stories through news search." : undefined,
      action: offerNews
        ? {
            label: "Follow via news",
            onClick: () => handleFollow([topicResult(site, item.lang === "fr" ? "fr" : "en")]),
          }
        : undefined,
    });
  }

  async function handleFollow(items: DiscoverResult[]) {
    const todo = items.filter((r) => !isFollowing(r) && !pending.has(sourceKey(r.url)));
    if (todo.length === 0) return;
    const keys = todo.map((r) => sourceKey(r.url));
    // Optimistic: the row shows "Following" right away and reverts if it fails.
    updateSet(setPending, keys, true);
    updateSet(setFollowed, keys, true);
    updateSet(setUnfollowed, keys, false);
    try {
      const results = await follow(todo);
      const byUrl = new Map(results.map((r) => [r.url, r]));
      const ok: { item: DiscoverResult; result: FollowResult }[] = [];
      const failed: { item: DiscoverResult; result?: FollowResult }[] = [];
      todo.forEach((item) => {
        const result = byUrl.get(item.url);
        if (result?.ok && result.feedId) ok.push({ item, result });
        else failed.push({ item, result });
      });

      updateSet(
        setFollowed,
        failed.map((f) => sourceKey(f.item.url)),
        false
      );
      setAdded((prev) => {
        const next = new Map(prev);
        ok.forEach(({ item, result }) =>
          next.set(sourceKey(item.url), {
            feedId: result.feedId!,
            categoryId: result.categoryId ?? null,
          })
        );
        return next;
      });

      const fresh = ok.filter((o) => !o.result.existed);
      const undoable = fresh.map((o) => ({ key: sourceKey(o.item.url), feedId: o.result.feedId! }));
      if (fresh.length === 1) {
        const { item, result } = fresh[0];
        setLastFollowed({ id: result.feedId!, title: result.title ?? item.name });
        toast.success(`Following ${result.title ?? item.name}`, {
          action: { label: "Undo", onClick: () => undo(undoable) },
        });
      } else if (fresh.length > 1) {
        toast.success(`Following ${fresh.length} sources`, {
          action: { label: "Undo", onClick: () => undo(undoable) },
        });
      }
      reportFailures(failed);
    } catch (error) {
      updateSet(setFollowed, keys, false);
      toast.error(error instanceof Error ? error.message : "Could not follow");
    } finally {
      updateSet(setPending, keys, false);
    }
  }

  async function handleMove(key: string, categoryId: string | null) {
    const entry = added.get(key);
    if (!entry) return;
    try {
      await moveFeed(entry.feedId, categoryId);
      setAdded((prev) => new Map(prev).set(key, { ...entry, categoryId }));
      const name = userCategories.find((c) => c.id === categoryId)?.name;
      toast.success(name ? `Moved to ${name}` : "Removed from its category");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not move this source");
    }
  }

  const categoryOptions = React.useMemo(
    () => userCategories.map((c) => ({ id: c.id, name: c.name, color: c.color })),
    [userCategories]
  );

  const rowProps = (result: DiscoverResult) => {
    const key = sourceKey(result.url);
    return {
      result,
      following: isFollowing(result),
      pending: pending.has(key),
      onFollow: () => handleFollow([result]),
      added: added.get(key),
      categories: categoryOptions,
      onMove: (categoryId: string | null) => handleMove(key, categoryId),
    };
  };

  const searching = query.trim().length > 0;
  const sections = [
    { id: FOR_YOU, name: "For you" },
    ...catalogCategories.map((c) => ({ id: c.id, name: c.name })),
  ];
  const picksPerCategory = React.useMemo(() => {
    const counts = new Map<string, number>();
    entries.forEach((e) => counts.set(e.categoryId, (counts.get(e.categoryId) ?? 0) + 1));
    return counts;
  }, [entries]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content
          className={cn(
            "fixed inset-0 z-50 flex flex-col bg-background shadow-2xl data-[state=open]:animate-fade-in",
            "sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-[min(90vh,880px)] sm:w-[min(96vw,980px)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:overflow-hidden sm:rounded-2xl sm:border"
          )}
          aria-describedby={undefined}
          onInteractOutside={keepOpenOnToast}
          onOpenAutoFocus={(e) => {
            // On phones the keyboard would cover the suggestions.
            if (window.matchMedia("(max-width: 639px)").matches) e.preventDefault();
          }}
        >
          <header className="shrink-0 border-b px-4 pb-3 pt-safe sm:px-6 sm:pt-5">
            <div className="flex items-center gap-2 pt-3 sm:pt-0">
              <Compass className="h-5 w-5 text-primary" />
              <DialogPrimitive.Title className="text-lg font-semibold tracking-tight">
                {firstRun ? "Pick your first sources" : TITLES[kind]}
              </DialogPrimitive.Title>
              <DialogPrimitive.Close
                className="-mr-2 ml-auto rounded-full p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </DialogPrimitive.Close>
            </div>

            <div
              role="tablist"
              aria-label="Channel"
              className="mt-3 grid grid-cols-4 gap-1 rounded-xl bg-muted/60 p-1"
            >
              {CHANNELS.map((channel) => {
                const Icon = channel.icon;
                const active = channel.id === kind;
                return (
                  <button
                    key={channel.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setKind(channel.id)}
                    className={cn(
                      "flex h-8 items-center justify-center gap-1.5 rounded-lg text-[13px] font-medium transition-colors",
                      active
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-3.5 w-3.5 max-sm:hidden",
                        active && channel.id === "youtube" && "text-red-600"
                      )}
                    />
                    <span className="truncate">{channel.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="relative mt-3">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={PLACEHOLDERS[kind]}
                className="h-11 w-full rounded-xl border bg-muted/40 pl-10 pr-10 text-[15px] outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
                aria-label="Search sources"
                autoComplete="off"
                enterKeyHint="search"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-muted-foreground hover:bg-accent"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="mt-3 flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Languages</span>
              {(Object.keys(LANGUAGE_LABELS) as Language[]).map((lang) => {
                const active = langs.includes(lang);
                return (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => toggle(lang)}
                    aria-pressed={active}
                    className={cn(
                      "rounded-full border px-3 py-1 font-medium transition-colors",
                      active
                        ? "border-primary bg-primary/15 text-primary"
                        : "text-muted-foreground hover:bg-accent"
                    )}
                  >
                    {LANGUAGE_LABELS[lang]}
                  </button>
                );
              })}
            </div>
          </header>

          <div className="flex min-h-0 flex-1">
            {!searching && (
              <nav
                aria-label="Interests"
                className="hidden w-52 shrink-0 overflow-y-auto border-r p-2 scrollbar-thin sm:block"
              >
                {sections.map((s) => {
                  const active = s.id === activeSection;
                  const count = picksPerCategory.get(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSection(s.id)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13.5px] transition-colors",
                        active
                          ? "bg-accent font-semibold text-foreground"
                          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                      )}
                    >
                      {s.id === FOR_YOU && <Sparkles className="h-3.5 w-3.5 text-primary" />}
                      <span className="min-w-0 flex-1 truncate">{s.name}</span>
                      {s.id === FOR_YOU && lastFollowed && !active && (
                        <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-label="New" />
                      )}
                      {count ? (
                        <span className="text-[11px] tabular-nums text-muted-foreground/70">
                          {count}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </nav>
            )}

            <div
              ref={scrollRef}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-safe sm:px-6"
            >
              {!searching && (
                <div className="sticky top-0 z-10 -mx-4 flex gap-1.5 overflow-x-auto border-b bg-background/95 px-4 py-2 backdrop-blur scrollbar-none sm:hidden">
                  {sections.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={(event) => {
                        event.currentTarget.scrollIntoView({ inline: "nearest", block: "nearest" });
                        setSection(s.id);
                      }}
                      aria-pressed={s.id === activeSection}
                      className={cn(
                        "inline-flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors",
                        s.id === activeSection
                          ? "border-foreground bg-foreground text-background"
                          : "text-muted-foreground"
                      )}
                    >
                      {s.id === FOR_YOU && <Sparkles className="h-3 w-3" />}
                      {s.name}
                    </button>
                  ))}
                </div>
              )}

              {kind === "newsletter" && (
                <button
                  type="button"
                  onClick={() => requestAppEvent("email-newsletter")}
                  className="mt-3 flex w-full items-center gap-3 rounded-xl border border-dashed p-3 text-left transition-colors hover:bg-accent/60"
                >
                  <AtSign className="h-5 w-5 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">Only sent by email?</span>
                    <span className="block text-xs text-muted-foreground">
                      Get an address to sign up with; issues land in Newsletters → Email.
                    </span>
                  </span>
                </button>
              )}
              {searching ? (
                <SearchResults query={query} langs={langs} kind={kind} rowProps={rowProps} />
              ) : activeSection === FOR_YOU ? (
                <ForYou
                  kind={kind}
                  langs={langs}
                  hasFeeds={feeds.length > 0}
                  lastFollowed={lastFollowed}
                  rowProps={rowProps}
                  isFollowing={isFollowing}
                  onFollow={handleFollow}
                />
              ) : (
                <CategoryView
                  key={`${activeSection}:${kind}`}
                  categoryId={activeSection}
                  name={sections.find((s) => s.id === activeSection)?.name ?? ""}
                  kind={kind}
                  langs={langs}
                  picks={entries.filter((e) => e.categoryId === activeSection)}
                  loading={catalogLoading}
                  rowProps={rowProps}
                  isFollowing={isFollowing}
                  onFollowAll={handleFollow}
                  busy={pending.size > 0}
                />
              )}
            </div>
          </div>

          {firstRun || followed.size > 0 ? (
            <footer className="flex shrink-0 items-center justify-between gap-3 border-t px-4 py-3 pb-safe sm:px-6">
              <p className="text-xs text-muted-foreground">
                {followed.size > 0
                  ? `${followed.size} new source${followed.size === 1 ? "" : "s"} followed`
                  : "Follow a few sources to fill your feed."}
              </p>
              <Button size="sm" className="rounded-full" onClick={() => onOpenChange(false)}>
                {followed.size > 0 ? "Done" : "Skip for now"}
              </Button>
            </footer>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

type RowProps = (result: DiscoverResult) => React.ComponentProps<typeof SourceRow>;

function Section({
  title,
  icon,
  action,
  children,
}: {
  title: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="pt-5">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="min-w-0 flex-1 truncate text-[13px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function ResultList({ results, rowProps }: { results: DiscoverResult[]; rowProps: RowProps }) {
  return (
    <ul className="divide-y divide-border/60">
      {results.map((result) => (
        <SourceRow key={`${result.provider}:${result.url}`} {...rowProps(result)} />
      ))}
    </ul>
  );
}

function LoadingRows({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite">
      <p className="pt-3 text-sm text-muted-foreground">{label}</p>
      <ul className="divide-y divide-border/60">
        {[0, 1, 2].map((row) => (
          <li key={row} className="flex items-center gap-3 py-3">
            <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className={cn("h-3.5", row === 1 ? "w-1/2" : "w-2/3")} />
              <Skeleton className="h-3 w-5/6" />
            </div>
            <Skeleton className="h-8 w-16 shrink-0 rounded-lg" />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Results of one kind, or grouped by kind when Discover shows everything. */
function GroupedResults({
  results,
  kind,
  rowProps,
  limit,
}: {
  results: DiscoverResult[];
  kind: DiscoverKind;
  rowProps: RowProps;
  limit?: number;
}) {
  if (kind !== "all") return <ResultList results={results.slice(0, limit)} rowProps={rowProps} />;
  return (
    <>
      {KIND_ORDER.map((k) => {
        const group = results.filter((r) => r.kind === k);
        if (group.length === 0) return null;
        const Icon = KIND_META[k].icon;
        return (
          <div key={k} className="pt-3">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Icon className="h-3.5 w-3.5" /> {KIND_HEADINGS[k]}
            </p>
            <ResultList results={group.slice(0, limit)} rowProps={rowProps} />
          </div>
        );
      })}
    </>
  );
}

const SEARCHING_LABELS: Record<DiscoverKind, string> = {
  all: "Searching sites, YouTube and newsletters…",
  rss: "Searching sites and blogs…",
  youtube: "Searching YouTube…",
  newsletter: "Searching newsletters…",
};

function SearchResults({
  query,
  langs,
  kind,
  rowProps,
}: {
  query: string;
  langs: Language[];
  kind: DiscoverKind;
  rowProps: RowProps;
}) {
  const { results, unavailable, topic, noFeed, isLoading, isPending } = useDiscoverSearch(
    query,
    langs,
    kind
  );
  const busy = isLoading || isPending;

  if (query.trim().length < 2) return null;
  if (busy && results.length === 0 && !topic) return <LoadingRows label={SEARCHING_LABELS[kind]} />;

  if (noFeed && topic) {
    return (
      <Section title="No feed on this site" icon={<Newspaper className="h-4 w-4 text-primary" />}>
        <p className="pt-2 text-sm text-muted-foreground">
          This site doesn&rsquo;t publish a feed we can read. You can still follow its latest
          stories through news search:
        </p>
        <ResultList results={[topic]} rowProps={rowProps} />
      </Section>
    );
  }

  return (
    <div className={cn("pb-6 transition-opacity", busy && "opacity-60")}>
      {results.length > 0 ? (
        <Section title={`Sources for “${query.trim()}”`}>
          <GroupedResults results={results} kind={kind} rowProps={rowProps} limit={12} />
        </Section>
      ) : (
        !busy && (
          <p className="pt-8 text-center text-sm text-muted-foreground">
            No {kind === "all" ? "sources" : KIND_NOUNS[kind]} found for &ldquo;
            {query.trim()}&rdquo;. Try a broader word, or paste the address.
          </p>
        )
      )}
      {topic && (
        <Section
          title="Or follow the topic"
          icon={<Newspaper className="h-4 w-4 text-muted-foreground" />}
        >
          <ResultList results={[topic]} rowProps={rowProps} />
        </Section>
      )}
      {unavailable.length > 0 && (
        <p className="pt-4 text-xs text-muted-foreground">
          {unavailable.join(" and ")} search is unavailable right now, so some results may be
          missing.
        </p>
      )}
    </div>
  );
}

function ForYou({
  kind,
  langs,
  hasFeeds,
  lastFollowed,
  rowProps,
  isFollowing,
  onFollow,
}: {
  kind: DiscoverKind;
  langs: Language[];
  hasFeeds: boolean;
  lastFollowed: { id: string; title: string } | null;
  rowProps: RowProps;
  isFollowing: (r: DiscoverResult) => boolean;
  onFollow: (items: DiscoverResult[]) => void;
}) {
  return (
    <div className="pb-6">
      {lastFollowed && (
        <BecauseYouFollowed
          feed={lastFollowed}
          kind={kind}
          langs={langs}
          rowProps={rowProps}
          isFollowing={isFollowing}
        />
      )}
      <SuggestedForYou
        enabled={hasFeeds && !lastFollowed}
        kind={kind}
        langs={langs}
        rowProps={rowProps}
        isFollowing={isFollowing}
      />
      <DescribeInterests kind={kind} langs={langs} rowProps={rowProps} />
      {(kind === "all" || kind === "rss") && <FollowTopic langs={langs} onFollow={onFollow} />}
    </div>
  );
}

function BecauseYouFollowed({
  feed,
  kind,
  langs,
  rowProps,
  isFollowing,
}: {
  feed: { id: string; title: string };
  kind: DiscoverKind;
  langs: Language[];
  rowProps: RowProps;
  isFollowing: (r: DiscoverResult) => boolean;
}) {
  const { results, isLoading } = useSuggestions(feed.id, langs, kind);
  const visible = results.filter((r) => !isFollowing(r) || rowProps(r).added);

  return (
    <Section
      title={<>Because you followed {feed.title}</>}
      icon={<Sparkles className="h-4 w-4 text-primary" />}
    >
      {isLoading ? (
        <LoadingRows label="Finding similar sources…" />
      ) : visible.length === 0 ? (
        <p className="py-3 text-sm text-muted-foreground">No similar sources found yet.</p>
      ) : (
        <ResultList results={visible} rowProps={rowProps} />
      )}
    </Section>
  );
}

function SuggestedForYou({
  enabled,
  kind,
  langs,
  rowProps,
  isFollowing,
}: {
  enabled: boolean;
  kind: DiscoverKind;
  langs: Language[];
  rowProps: RowProps;
  isFollowing: (r: DiscoverResult) => boolean;
}) {
  const { results, isLoading } = useSuggestions(null, langs, kind, enabled);
  if (!enabled) return null;
  const visible = results.filter((r) => !isFollowing(r) || rowProps(r).added).slice(0, 8);
  if (!isLoading && visible.length === 0) return null;

  return (
    <Section title="Suggested for you" icon={<Sparkles className="h-4 w-4 text-primary" />}>
      {isLoading ? (
        <LoadingRows label="Looking at what you follow…" />
      ) : (
        <ResultList results={visible} rowProps={rowProps} />
      )}
    </Section>
  );
}

const DESCRIBE_PLACEHOLDERS: Record<DiscoverKind, string> = {
  all: "e.g. branding and UX writing, startup growth, space science…",
  rss: "e.g. indie design blogs, Moroccan business news…",
  youtube: "e.g. calm cooking channels, deep-dive tech documentaries…",
  newsletter: "e.g. weekly AI roundup, personal finance for beginners…",
};

function DescribeInterests({
  kind,
  langs,
  rowProps,
}: {
  kind: DiscoverKind;
  langs: Language[];
  rowProps: RowProps;
}) {
  const ai = useAiStatus();
  const [text, setText] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [results, setResults] = React.useState<DiscoverResult[] | null>(null);

  // A new channel asks again rather than showing the other channel's picks.
  React.useEffect(() => setResults(null), [kind]);

  if (!ai?.enabled) return null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!text.trim() || loading) return;
    setLoading(true);
    try {
      setResults(await describeInterests(text.trim(), langs, kind));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not get suggestions");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Section title="Describe what you like" icon={<Sparkles className="h-4 w-4 text-primary" />}>
      <form onSubmit={submit} className="mt-2 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={DESCRIBE_PLACEHOLDERS[kind]}
          className="h-10 min-w-0 flex-1 rounded-xl border bg-muted/40 px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
          aria-label="Describe what you like"
        />
        <Button
          type="submit"
          className="h-10 gap-1.5 rounded-xl"
          disabled={!text.trim() || loading}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          Suggest
        </Button>
      </form>
      {loading && <LoadingRows label="Asking the AI and checking each source…" />}
      {!loading && results && results.length === 0 && (
        <p className="py-3 text-sm text-muted-foreground">
          No working sources found for that. Try describing it differently.
        </p>
      )}
      {!loading && results && results.length > 0 && (
        <ResultList results={results} rowProps={rowProps} />
      )}
    </Section>
  );
}

/** "Follow a topic": any subject becomes a news feed, newest first. */
function FollowTopic({
  langs,
  onFollow,
}: {
  langs: Language[];
  onFollow: (items: DiscoverResult[]) => void;
}) {
  const [text, setText] = React.useState("");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const topic = text.trim();
    if (topic.length < 2) return;
    onFollow([topicResult(topic, langs[0])]);
    setText("");
  }

  return (
    <Section title="Follow a topic" icon={<Newspaper className="h-4 w-4 text-muted-foreground" />}>
      <p className="pt-1 text-[13px] text-muted-foreground">
        Get the latest news on anything, from every outlet: a company, a team, a person, a place.
      </p>
      <form onSubmit={submit} className="mt-2 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. Moroccan startups, Real Madrid, OpenAI…"
          className="h-10 min-w-0 flex-1 rounded-xl border bg-muted/40 px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
          aria-label="Topic to follow"
        />
        <Button
          type="submit"
          variant="outline"
          className="h-10 rounded-xl"
          disabled={text.trim().length < 2}
        >
          Follow
        </Button>
      </form>
    </Section>
  );
}

function CategoryView({
  categoryId,
  name,
  kind,
  langs,
  picks,
  loading,
  rowProps,
  isFollowing,
  onFollowAll,
  busy,
}: {
  categoryId: string;
  name: string;
  kind: DiscoverKind;
  langs: Language[];
  picks: DiscoverResult[];
  loading: boolean;
  rowProps: RowProps;
  isFollowing: (r: DiscoverResult) => boolean;
  onFollowAll: (items: DiscoverResult[]) => void;
  busy: boolean;
}) {
  const remaining = picks.filter((e) => !isFollowing(e));
  const [showLive, setShowLive] = React.useState(false);
  const explore = useExplore(categoryId, kind, langs, showLive || (!loading && picks.length < 4));

  const pickKeys = new Set(picks.map((p) => sourceKey(p.url)));
  const seen = new Set<string>();
  const live = explore.pages
    .flatMap((page) => page.results)
    .filter((r) => {
      const key = sourceKey(r.url);
      if (pickKeys.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const liveStarted = showLive || (!loading && picks.length < 4);

  return (
    <div className="pb-6">
      <Section
        title={picks.length > 0 ? `Top picks · ${name}` : name}
        action={
          remaining.length > 1 && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 rounded-full px-3 text-xs"
              disabled={busy}
              onClick={() => onFollowAll(remaining)}
            >
              Follow all {remaining.length}
            </Button>
          )
        }
      >
        {loading && picks.length === 0 ? (
          <LoadingRows label="Loading picks…" />
        ) : picks.length === 0 ? (
          <p className="pt-2 text-sm text-muted-foreground">
            No hand-picked {kind === "all" ? "sources" : KIND_NOUNS[kind]} here yet. Here&rsquo;s
            what&rsquo;s popular instead.
          </p>
        ) : (
          <GroupedResults results={picks} kind={kind} rowProps={rowProps} />
        )}
      </Section>

      <Section title="More like this" icon={<Compass className="h-4 w-4 text-muted-foreground" />}>
        {!liveStarted ? (
          <Button
            variant="outline"
            className="mt-3 w-full rounded-xl"
            onClick={() => setShowLive(true)}
          >
            Explore more {kind === "all" ? "sources" : KIND_NOUNS[kind]} in {name}
          </Button>
        ) : (
          <>
            {live.length > 0 && <ResultList results={live} rowProps={rowProps} />}
            {explore.isLoading ? (
              <LoadingRows label="Finding more…" />
            ) : live.length === 0 && !explore.hasMore ? (
              <p className="py-3 text-sm text-muted-foreground">
                Nothing more right now. Try a search above.
              </p>
            ) : null}
            {explore.hasMore && !explore.isLoading && (
              <Button
                variant="outline"
                className="mt-2 w-full rounded-xl"
                onClick={() => explore.loadMore()}
              >
                Show more
              </Button>
            )}
          </>
        )}
      </Section>
    </div>
  );
}
