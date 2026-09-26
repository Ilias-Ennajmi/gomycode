"use client";

import * as React from "react";
import { toast } from "sonner";
import { Compass, Loader2, Search, Sparkles, X } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { sourceKey } from "@/lib/source-key";
import { useAiStatus } from "@/lib/hooks/useAi";
import { useFeeds } from "@/lib/hooks/useFeeds";
import {
  describeInterests,
  useCatalog,
  useDiscoverLangs,
  useDiscoverSearch,
  useFollow,
  useSuggestions,
  type DiscoverResult,
} from "@/lib/hooks/useDiscover";
import type { Language } from "@/lib/discover/catalog";
import { KIND_META, SourceRow } from "@/components/discover/SourceRow";

interface DiscoverDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const LANGUAGE_LABELS: Record<Language, string> = { en: "English", fr: "Français" };
const KIND_ORDER = ["rss", "youtube", "newsletter"] as const;
const KIND_HEADINGS = {
  rss: "Sites & blogs",
  youtube: "YouTube channels",
  newsletter: "Newsletters",
};

/** Find sources by interest, search, or AI description, and follow them in one tap. */
export function DiscoverDialog({ open, onOpenChange }: DiscoverDialogProps) {
  const { feeds } = useFeeds();
  const { langs, toggle } = useDiscoverLangs();
  const [query, setQuery] = React.useState("");
  // Follows made while the dialog is open, so rows update without refetching.
  const [followed, setFollowed] = React.useState<Set<string>>(new Set());
  const [pending, setPending] = React.useState<Set<string>>(new Set());
  const [lastFollowed, setLastFollowed] = React.useState<{ id: string; title: string } | null>(
    null
  );
  const follow = useFollow();
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    setQuery("");
    setLastFollowed(null);
    // Quietly re-check a few catalog links so broken ones drop out.
    fetch("/api/discover/health", { method: "POST" }).catch(() => undefined);
  }, [open]);

  const isFollowing = (r: DiscoverResult) => Boolean(r.following) || followed.has(sourceKey(r.url));

  async function handleFollow(items: DiscoverResult[]) {
    const todo = items.filter((r) => !isFollowing(r));
    if (todo.length === 0) return;
    const keys = todo.map((r) => sourceKey(r.url));
    setPending((prev) => new Set([...Array.from(prev), ...keys]));
    try {
      const results = await follow(todo);
      const ok = results.filter((r) => r.ok);
      const failed = results.filter((r) => !r.ok);
      setFollowed((prev) => new Set([...Array.from(prev), ...ok.map((r) => sourceKey(r.url))]));
      if (ok.length === 1 && ok[0].feedId) {
        // The button and the "Because you followed" section confirm it; no toast.
        setLastFollowed({ id: ok[0].feedId, title: ok[0].title ?? todo[0].name });
        if (!query.trim()) scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      } else if (ok.length > 1) {
        toast.success(`Following ${ok.length} sources`);
      }
      if (failed.length > 0) {
        toast.error(
          failed.length === 1
            ? `${todo.find((t) => t.url === failed[0].url)?.name ?? "Source"}: ${failed[0].error}`
            : `${failed.length} sources could not be followed right now`
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not follow");
    } finally {
      setPending((prev) => {
        const next = new Set(prev);
        keys.forEach((k) => next.delete(k));
        return next;
      });
    }
  }

  const rowProps = (result: DiscoverResult) => ({
    result,
    following: isFollowing(result),
    pending: pending.has(sourceKey(result.url)),
    onFollow: () => handleFollow([result]),
  });

  const firstRun = feeds.length === 0 && followed.size === 0;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content
          className={cn(
            "fixed inset-0 z-50 flex flex-col bg-background shadow-2xl data-[state=open]:animate-fade-in",
            "sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-[min(88vh,860px)] sm:w-[min(94vw,760px)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border"
          )}
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => {
            // On phones the keyboard would cover the suggestions.
            if (window.matchMedia("(max-width: 639px)").matches) e.preventDefault();
          }}
        >
          <header className="shrink-0 border-b px-4 pb-3 pt-safe sm:px-6 sm:pt-5">
            <div className="flex items-center gap-2 pt-3 sm:pt-0">
              <Compass className="h-5 w-5 text-primary" />
              <DialogPrimitive.Title className="text-lg font-semibold tracking-tight">
                {firstRun ? "Pick your first sources" : "Discover"}
              </DialogPrimitive.Title>
              <DialogPrimitive.Close
                className="-mr-2 ml-auto rounded-full p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
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
                placeholder="Search a topic, site, YouTube channel… or paste a link"
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

          <div
            ref={scrollRef}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-safe sm:px-6"
          >
            {query.trim() ? (
              <SearchResults query={query} langs={langs} rowProps={rowProps} />
            ) : (
              <>
                {lastFollowed && (
                  <BecauseYouFollowed
                    feed={lastFollowed}
                    langs={langs}
                    rowProps={rowProps}
                    isFollowing={isFollowing}
                  />
                )}
                <SuggestedForYou
                  enabled={feeds.length > 0 && !lastFollowed}
                  langs={langs}
                  rowProps={rowProps}
                  isFollowing={isFollowing}
                />
                <DescribeInterests langs={langs} rowProps={rowProps} />
                <CatalogBrowser
                  langs={langs}
                  rowProps={rowProps}
                  isFollowing={isFollowing}
                  onFollowAll={handleFollow}
                  pendingCount={pending.size}
                />
              </>
            )}
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
    <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> {label}
    </p>
  );
}

function SearchResults({
  query,
  langs,
  rowProps,
}: {
  query: string;
  langs: Language[];
  rowProps: RowProps;
}) {
  const { results, unavailable, isLoading, isPending } = useDiscoverSearch(query, langs);
  const busy = isLoading || isPending;

  if (query.trim().length < 2) return null;
  if (busy && results.length === 0)
    return <LoadingRows label="Searching sites, YouTube and newsletters…" />;
  if (results.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        No sources found for &ldquo;{query.trim()}&rdquo;. Try a broader topic or paste the
        site&rsquo;s address.
      </p>
    );
  }

  return (
    <div className={cn("pb-4 transition-opacity", busy && "opacity-60")}>
      {KIND_ORDER.map((kind) => {
        const group = results.filter((r) => r.kind === kind);
        if (group.length === 0) return null;
        const Icon = KIND_META[kind].icon;
        return (
          <Section
            key={kind}
            title={KIND_HEADINGS[kind]}
            icon={<Icon className="h-4 w-4 text-muted-foreground" />}
          >
            <ResultList results={group.slice(0, 12)} rowProps={rowProps} />
          </Section>
        );
      })}
      {unavailable.length > 0 && (
        <p className="pt-4 text-xs text-muted-foreground">
          {unavailable.join(" and ")} search is unavailable right now, so some results may be
          missing.
        </p>
      )}
    </div>
  );
}

function BecauseYouFollowed({
  feed,
  langs,
  rowProps,
  isFollowing,
}: {
  feed: { id: string; title: string };
  langs: Language[];
  rowProps: RowProps;
  isFollowing: (r: DiscoverResult) => boolean;
}) {
  const { results, isLoading } = useSuggestions(feed.id, langs);
  const visible = results.filter((r) => !isFollowing(r) || rowProps(r).pending);

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
  langs,
  rowProps,
  isFollowing,
}: {
  enabled: boolean;
  langs: Language[];
  rowProps: RowProps;
  isFollowing: (r: DiscoverResult) => boolean;
}) {
  const { results, isLoading } = useSuggestions(null, langs, enabled);
  if (!enabled) return null;
  const visible = results.filter((r) => !isFollowing(r) || rowProps(r).pending).slice(0, 6);
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

function DescribeInterests({ langs, rowProps }: { langs: Language[]; rowProps: RowProps }) {
  const ai = useAiStatus();
  const [text, setText] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [results, setResults] = React.useState<DiscoverResult[] | null>(null);

  if (!ai?.enabled) return null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!text.trim() || loading) return;
    setLoading(true);
    try {
      setResults(await describeInterests(text.trim(), langs));
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
          placeholder="e.g. branding and UX writing, startup growth, space science…"
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

function CatalogBrowser({
  langs,
  rowProps,
  isFollowing,
  onFollowAll,
  pendingCount,
}: {
  langs: Language[];
  rowProps: RowProps;
  isFollowing: (r: DiscoverResult) => boolean;
  onFollowAll: (items: DiscoverResult[]) => void;
  pendingCount: number;
}) {
  const { categories, entries, isLoading } = useCatalog(langs);
  const [categoryId, setCategoryId] = React.useState<string | null>(null);
  const active = categoryId ?? categories[0]?.id;
  const inCategory = entries.filter((e) => e.categoryId === active);
  const remaining = inCategory.filter((e) => !isFollowing(e));
  const activeName = categories.find((c) => c.id === active)?.name ?? "";

  return (
    <Section
      title="Browse by interest"
      action={
        remaining.length > 1 && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 rounded-full px-3 text-xs"
            disabled={pendingCount > 0}
            onClick={() => onFollowAll(remaining)}
          >
            Follow all {remaining.length}
          </Button>
        )
      }
    >
      <div className="-mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4 pb-1 scrollbar-none sm:-mx-6 sm:px-6">
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() => setCategoryId(category.id)}
            aria-pressed={category.id === active}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors",
              category.id === active
                ? "border-foreground bg-foreground text-background"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            {category.name}
          </button>
        ))}
      </div>

      {isLoading ? (
        <LoadingRows label="Loading picks…" />
      ) : inCategory.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">
          No picks in {activeName} for the chosen languages yet.
        </p>
      ) : (
        KIND_ORDER.map((kind) => {
          const group = inCategory.filter((e) => e.kind === kind);
          if (group.length === 0) return null;
          return (
            <div key={kind} className="pt-3">
              <p className="text-xs font-medium text-muted-foreground">{KIND_HEADINGS[kind]}</p>
              <ResultList results={group} rowProps={rowProps} />
            </div>
          );
        })
      )}
    </Section>
  );
}
