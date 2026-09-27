"use client";

import * as React from "react";
import { toast } from "sonner";
import { Check, Eye, EyeOff, Loader2, Newspaper, Plus, X } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { keepOpenOnToast } from "@/components/ui/sonner";
import { FeedFavicon } from "@/components/shared/FeedFavicon";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { sourceKey } from "@/lib/source-key";
import { useFeeds } from "@/lib/hooks/useFeeds";
import { useFollow, useUnfollow, type DiscoverResult } from "@/lib/hooks/useDiscover";
import { useFrontPage, useSaveNewsPrefs } from "@/lib/hooks/useNews";
import { NEWS_SOURCES, type NewsSource } from "@/lib/news/catalog";
import { DESKS, type DeskId } from "@/lib/news/desks";
import { isTopicFeedUrl, siteTopic, topicQuery, topicResult } from "@/lib/discover/topics";
import type { FeedSummary } from "@/lib/types";

interface NewsSourcesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** First run: pre-checked picks and one "Build my front page" button. */
  setup?: boolean;
}

function iconFor(url: string) {
  try {
    const query = topicQuery(url);
    const host = query?.startsWith("site:")
      ? query.slice(5)
      : new URL(url).hostname.replace(/^(www|feeds?|rss|dwh|fr|en)\./, "");
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
  } catch {
    return null;
  }
}

function asResult(source: NewsSource): DiscoverResult {
  return {
    url: source.url,
    name: source.name,
    kind: "rss",
    lang: source.lang,
    // Named after the outlet rather than the search behind it.
    provider: isTopicFeedUrl(source.url) ? "topic" : "catalog",
    newsDesk: source.desk,
    region: source.region,
  };
}

/** Pick the outlets behind the News tab, section by section, and hide sections. */
export function NewsSourcesDialog({ open, onOpenChange, setup = false }: NewsSourcesDialogProps) {
  const { feeds } = useFeeds();
  const { page } = useFrontPage();
  const follow = useFollow();
  const unfollow = useUnfollow();
  const savePrefs = useSaveNewsPrefs();
  const [checked, setChecked] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState<Set<string>>(new Set());
  const [building, setBuilding] = React.useState(false);
  const hidden = page?.hidden ?? [];

  React.useEffect(() => {
    if (open && setup) setChecked(new Set(NEWS_SOURCES.filter((s) => s.pick).map((s) => s.id)));
  }, [open, setup]);

  // Followed feeds by URL, to show which catalog outlets are already in.
  const followedByKey = React.useMemo(() => {
    const map = new Map<string, FeedSummary>();
    feeds.forEach((f) => map.set(sourceKey(f.url), f));
    return map;
  }, [feeds]);
  const followedNews = (source: NewsSource) => {
    const feed = followedByKey.get(sourceKey(source.url));
    return feed?.newsDesk ? feed : null;
  };
  const catalogKeys = new Set(NEWS_SOURCES.map((s) => sourceKey(s.url)));
  const ownNewsFeeds = feeds.filter((f) => f.newsDesk && !catalogKeys.has(sourceKey(f.url)));

  const setBusyFor = (key: string, on: boolean) =>
    setBusy((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  async function add(result: DiscoverResult, key: string) {
    setBusyFor(key, true);
    try {
      let [outcome] = await follow([result]);
      // A pasted site without a readable feed still works through news search.
      const site = result.provider === "link" ? siteTopic(result.url) : null;
      if (!outcome?.ok && outcome?.code === "no-feed" && site) {
        [outcome] = await follow([
          { ...topicResult(site, "fr"), newsDesk: result.newsDesk, region: result.region },
        ]);
      }
      if (!outcome?.ok) throw new Error(outcome?.error ?? "Couldn't add this source");
      toast.success(`${outcome.title ?? result.name} added to News`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't add this source");
    } finally {
      setBusyFor(key, false);
    }
  }

  async function remove(feed: FeedSummary, result?: DiscoverResult) {
    setBusyFor(feed.id, true);
    try {
      await unfollow([feed.id]);
      toast(`Removed ${feed.title}`, {
        action: result ? { label: "Undo", onClick: () => add(result, feed.id) } : undefined,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't remove this source");
    } finally {
      setBusyFor(feed.id, false);
    }
  }

  async function toggleSection(desk: DeskId) {
    const next = hidden.includes(desk) ? hidden.filter((d) => d !== desk) : [...hidden, desk];
    try {
      await savePrefs({ hidden: next });
    } catch {
      toast.error("Could not save");
    }
  }

  async function buildFrontPage() {
    const picks = NEWS_SOURCES.filter((s) => checked.has(s.id));
    if (picks.length === 0) return;
    setBuilding(true);
    try {
      const results = await follow(picks.map(asResult));
      const failed = results.filter((r) => !r.ok);
      if (failed.length > 0) {
        toast.error(`${failed.length} source${failed.length === 1 ? "" : "s"} couldn't be added`);
      }
      toast.success(`Your front page has ${results.length - failed.length} sources`);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setBuilding(false);
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content
          className={cn(
            "fixed inset-0 z-50 flex flex-col bg-background shadow-2xl data-[state=open]:animate-fade-in",
            "sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-[min(90vh,880px)] sm:w-[min(94vw,760px)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:overflow-hidden sm:rounded-2xl sm:border"
          )}
          aria-describedby={undefined}
          onInteractOutside={keepOpenOnToast}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <header className="shrink-0 border-b px-4 pb-3 pt-safe sm:px-6 sm:pt-5">
            <div className="flex items-center gap-2 pt-3 sm:pt-0">
              <Newspaper className="h-5 w-5 text-primary" />
              <DialogPrimitive.Title className="font-serif text-xl font-semibold tracking-tight">
                {setup ? "Build your front page" : "News sources"}
              </DialogPrimitive.Title>
              <DialogPrimitive.Close
                className="-mr-2 ml-auto rounded-full p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </DialogPrimitive.Close>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {setup
                ? "We picked a few outlets per section. Check or uncheck any, you can change them later."
                : "Add or remove outlets, and choose which sections appear."}
            </p>
            {!setup && (
              <div className="-mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 scrollbar-none sm:-mx-6 sm:px-6">
                {DESKS.map((desk) => {
                  const shown = !hidden.includes(desk.id);
                  return (
                    <button
                      key={desk.id}
                      type="button"
                      onClick={() => toggleSection(desk.id)}
                      aria-pressed={shown}
                      className={cn(
                        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors",
                        shown
                          ? "border-foreground bg-foreground text-background"
                          : "text-muted-foreground line-through decoration-1"
                      )}
                      title={shown ? `Hide ${desk.name}` : `Show ${desk.name}`}
                    >
                      {shown ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                      {desk.name}
                    </button>
                  );
                })}
              </div>
            )}
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-safe sm:px-6">
            {DESKS.map((desk) => {
              const sources = NEWS_SOURCES.filter((s) => s.desk === desk.id);
              const own = ownNewsFeeds.filter((f) => f.newsDesk === desk.id);
              return (
                <section key={desk.id} className="pt-5">
                  <h3 className="font-serif text-lg font-semibold">{desk.name}</h3>
                  <p className="text-xs text-muted-foreground">{desk.description}</p>
                  <ul className="mt-1 divide-y divide-border/60">
                    {sources.map((source) => {
                      const feed = followedNews(source);
                      const key = feed?.id ?? source.id;
                      return (
                        <SourceLine
                          key={source.id}
                          name={source.name}
                          description={source.description}
                          lang={source.lang}
                          icon={feed?.faviconUrl ?? iconFor(source.url)}
                          control={
                            setup ? (
                              <Checkbox
                                checked={checked.has(source.id) || Boolean(feed)}
                                disabled={Boolean(feed)}
                                onChange={(on) =>
                                  setChecked((prev) => {
                                    const next = new Set(prev);
                                    if (on) next.add(source.id);
                                    else next.delete(source.id);
                                    return next;
                                  })
                                }
                                label={source.name}
                              />
                            ) : (
                              <ToggleButton
                                on={Boolean(feed)}
                                busy={busy.has(key)}
                                onAdd={() => add(asResult(source), key)}
                                onRemove={() => feed && remove(feed, asResult(source))}
                                name={source.name}
                              />
                            )
                          }
                        />
                      );
                    })}
                    {own.map((feed) => (
                      <SourceLine
                        key={feed.id}
                        name={feed.title}
                        description="Added by you"
                        lang={feed.language}
                        icon={feed.faviconUrl}
                        control={
                          <ToggleButton
                            on
                            busy={busy.has(feed.id)}
                            onAdd={() => undefined}
                            onRemove={() => remove(feed)}
                            name={feed.title}
                          />
                        }
                      />
                    ))}
                  </ul>
                </section>
              );
            })}
            {!setup && <AddOwn onAdd={add} />}
            <div className="h-6" />
          </div>

          {setup && (
            <footer className="flex shrink-0 items-center justify-between gap-3 border-t px-4 py-3 pb-safe sm:px-6">
              <p className="text-xs text-muted-foreground">{checked.size} sources selected</p>
              <Button
                className="gap-1.5 rounded-full"
                onClick={buildFrontPage}
                disabled={building || checked.size === 0}
              >
                {building && <Loader2 className="h-4 w-4 animate-spin" />}
                {building ? "Fetching the news…" : "Build my front page"}
              </Button>
            </footer>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function SourceLine({
  name,
  description,
  lang,
  icon,
  control,
}: {
  name: string;
  description: string;
  lang: string | null;
  icon: string | null;
  control: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <FeedFavicon
        title={name}
        faviconUrl={icon}
        size={32}
        className="rounded-lg ring-1 ring-border/60"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium">
          {name}
          {lang && (
            <span className="ml-1.5 text-[10.5px] font-semibold uppercase text-muted-foreground">
              {lang}
            </span>
          )}
        </p>
        <p className="truncate text-xs text-muted-foreground">{description}</p>
      </div>
      {control}
    </li>
  );
}

function ToggleButton({
  on,
  busy,
  onAdd,
  onRemove,
  name,
}: {
  on: boolean;
  busy: boolean;
  onAdd: () => void;
  onRemove: () => void;
  name: string;
}) {
  return (
    <button
      type="button"
      onClick={on ? onRemove : onAdd}
      disabled={busy}
      aria-label={on ? `Remove ${name}` : `Add ${name}`}
      className={cn(
        "group inline-flex h-8 w-[92px] shrink-0 items-center justify-center gap-1 rounded-full text-xs font-semibold transition-colors",
        on
          ? "bg-muted text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          : "bg-primary text-primary-foreground hover:bg-primary/90"
      )}
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : on ? (
        <>
          <Check className="h-3.5 w-3.5 group-hover:hidden" />
          <X className="hidden h-3.5 w-3.5 group-hover:block" />
          <span className="group-hover:hidden">Added</span>
          <span className="hidden group-hover:inline">Remove</span>
        </>
      ) : (
        <>
          <Plus className="h-3.5 w-3.5" /> Add
        </>
      )}
    </button>
  );
}

function Checkbox({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors",
        checked
          ? "border-primary bg-primary text-primary-foreground"
          : "border-muted-foreground/40",
        disabled && "opacity-60"
      )}
    >
      {checked && <Check className="h-4 w-4" />}
    </button>
  );
}

/** Any site, feed or topic, filed under a section. */
function AddOwn({ onAdd }: { onAdd: (result: DiscoverResult, key: string) => Promise<void> }) {
  const [text, setText] = React.useState("");
  const [desk, setDesk] = React.useState<DeskId>("morocco");
  const [adding, setAdding] = React.useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const value = text.trim();
    if (value.length < 2) return;
    const looksLikeUrl = /^https?:\/\//i.test(value) || /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(value);
    const lang = /[éèàçùâêîôû]|\b(le|la|les|du|des|maroc)\b/i.test(value) ? "fr" : "en";
    const result: DiscoverResult = looksLikeUrl
      ? { url: value, name: value, kind: "rss", provider: "link" }
      : topicResult(value, lang);
    setAdding(true);
    await onAdd(
      { ...result, newsDesk: desk, region: desk === "morocco" ? "ma" : undefined },
      value
    );
    setAdding(false);
    setText("");
  }

  return (
    <section className="mt-6 rounded-xl border bg-muted/30 p-4">
      <h3 className="text-sm font-semibold">Add your own</h3>
      <p className="text-xs text-muted-foreground">
        Paste a news site or feed, or type a topic (e.g. &ldquo;Raja Casablanca&rdquo;,
        &ldquo;OCP&rdquo;, &ldquo;énergie Maroc&rdquo;).
      </p>
      <form onSubmit={submit} className="mt-3 flex flex-wrap gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Site, feed or topic"
          aria-label="Site, feed or topic"
          className="h-10 min-w-0 flex-[2_1_200px] rounded-lg border bg-background px-3 text-sm outline-none focus-visible:border-primary"
        />
        <Select value={desk} onValueChange={(v) => setDesk(v as DeskId)}>
          <SelectTrigger className="h-10 flex-[1_1_120px]" aria-label="Section">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DESKS.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="submit" className="h-10" disabled={adding || text.trim().length < 2}>
          {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
        </Button>
      </form>
    </section>
  );
}
