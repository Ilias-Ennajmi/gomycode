"use client";

import * as React from "react";
import useSWR from "swr";
import {
  ArrowUpRight,
  ChevronDown,
  Maximize2,
  MessagesSquare,
  Play,
  Search,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/utils";
import { usePref } from "@/lib/prefs";
import { clock, durationLabel } from "@/lib/hooks/useVideo";
import { useBackToClose } from "@/lib/hooks/useHistorySync";
import { getPurifier } from "@/components/articles/ArticleContent";
import type { TimeStore } from "@/components/video/VideoGuide";
import type { ArticleSummary, TimedText } from "@/lib/types";
import type { DiscussionThread } from "@/app/api/articles/[id]/discussion/route";

// The cards under a player (podcast or video), the way music and podcast apps lay out an
// episode: each one a titled block that folds shut with its chevron, remembered (and synced)
// so the page looks the way you left it.

const CARDS_KEY = "player-cards";
const NONE: Record<string, boolean> = {};

/** A picture that turns into a tinted letter (or icon) when it's missing or fails. */
export function Art({
  src,
  name,
  className,
  icon: Icon,
}: {
  src: string | null | undefined;
  name: string;
  className?: string;
  icon?: LucideIcon;
}) {
  const [broken, setBroken] = React.useState(false);
  React.useEffect(() => setBroken(false), [src]);
  if (!src || broken) {
    return (
      <span
        aria-hidden
        className={cn(
          "flex shrink-0 items-center justify-center bg-primary/15 font-serif font-semibold text-primary",
          className
        )}
      >
        {Icon ? <Icon className="h-1/3 w-1/3" /> : name.trim().charAt(0).toUpperCase() || "?"}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      className={cn("shrink-0 object-cover", className)}
    />
  );
}

export function useTimeOf(store: TimeStore) {
  return React.useSyncExternalStore(store.subscribe, store.get, () => 0);
}

/** A position that never moves: an episode shown before it plays. */
export function staticTime(seconds: number): TimeStore {
  return { get: () => seconds, set: () => undefined, subscribe: () => () => undefined };
}

export function MediaCard({
  id,
  title,
  icon: Icon,
  action,
  tone = "plain",
  children,
  className,
}: {
  id: string;
  title: React.ReactNode;
  icon?: LucideIcon;
  /** Small buttons beside the title (Show all, expand…). */
  action?: React.ReactNode;
  /** "accent" for the read-along card, in the app's colour. */
  tone?: "plain" | "accent";
  children: React.ReactNode;
  className?: string;
}) {
  const [folded, setFolded] = usePref<Record<string, boolean>>(CARDS_KEY, NONE);
  const collapsed = Boolean(folded?.[id]);
  const bodyId = `card-${id}`;
  const accent = tone === "accent";
  return (
    <section
      data-card={id}
      aria-label={typeof title === "string" ? title : undefined}
      className={cn(
        "rounded-2xl p-4 shadow-sm",
        accent ? "bg-primary text-primary-foreground" : "bg-card/85 ring-1 ring-border/60",
        className
      )}
    >
      <div className="flex min-h-8 items-center gap-2">
        <h2 className="flex min-w-0 flex-1 items-center gap-2 text-[15px] font-bold tracking-tight">
          {Icon && <Icon className={cn("h-4 w-4 shrink-0", !accent && "text-primary")} />}
          <span className="truncate">{title}</span>
        </h2>
        {!collapsed && action}
        <button
          type="button"
          onClick={() => setFolded((prev) => ({ ...(prev ?? {}), [id]: !collapsed }))}
          aria-expanded={!collapsed}
          aria-controls={bodyId}
          aria-label={collapsed ? "Expand" : "Collapse"}
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors",
            accent ? "hover:bg-white/15" : "text-muted-foreground hover:bg-accent"
          )}
        >
          <ChevronDown
            className={cn("h-4 w-4 transition-transform duration-200", collapsed && "-rotate-90")}
          />
        </button>
      </div>
      {!collapsed && (
        <div id={bodyId} className="mt-3">
          {children}
        </div>
      )}
    </section>
  );
}

/** A small text button for a card's corner. */
export function CardAction({
  children,
  onClick,
  accent,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  accent?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "flex h-8 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-semibold transition-colors",
        accent ? "hover:bg-white/15" : "text-primary hover:bg-primary/10"
      )}
    >
      {children}
    </button>
  );
}

function activeIndex(items: { t: number }[], current: number) {
  let active = -1;
  items.forEach((item, i) => {
    if (item.t <= current + 0.5) active = i;
  });
  return active;
}

/**
 * Read along: the transcript in big type, the line being said lit and the rest faded, a
 * few lines at a time in the card; the expand button opens all of it full screen, with a
 * search box. Tap any line to jump there.
 */
export function ReadAlongCard({
  transcript,
  store,
  onSeek,
}: {
  transcript: TimedText[];
  store: TimeStore;
  onSeek: (seconds: number) => void;
}) {
  const current = useTimeOf(store);
  const [full, setFull] = React.useState(false);
  if (transcript.length === 0) return null;
  const active = activeIndex(transcript, current);
  const from = Math.max(0, active - 1);
  const lines = transcript.slice(from, from + 5);
  return (
    <>
      <MediaCard
        id="read-along"
        title="Read along"
        tone="accent"
        action={
          <CardAction accent onClick={() => setFull(true)} label="Open the full transcript">
            <Maximize2 className="h-4 w-4" />
          </CardAction>
        }
      >
        <ol className="space-y-1.5">
          {lines.map((line, i) => {
            const index = from + i;
            return (
              <li key={`${line.t}-${index}`}>
                <button
                  type="button"
                  onClick={() => onSeek(line.t)}
                  className={cn(
                    "text-left text-[20px] font-bold leading-snug tracking-tight transition-opacity",
                    index === active ? "opacity-100" : index < active ? "opacity-45" : "opacity-70"
                  )}
                >
                  {line.text}
                </button>
              </li>
            );
          })}
        </ol>
      </MediaCard>
      {full && (
        <TranscriptOverlay
          transcript={transcript}
          store={store}
          onSeek={onSeek}
          onClose={() => setFull(false)}
        />
      )}
    </>
  );
}

function TranscriptOverlay({
  transcript,
  store,
  onSeek,
  onClose,
}: {
  transcript: TimedText[];
  store: TimeStore;
  onSeek: (seconds: number) => void;
  onClose: () => void;
}) {
  useBackToClose(true, onClose);
  const current = useTimeOf(store);
  const active = activeIndex(transcript, current);
  const [query, setQuery] = React.useState("");
  const list = React.useRef<HTMLOListElement>(null);
  const userScrolled = React.useRef(0);
  const q = query.trim().toLowerCase();
  const shown = q.length >= 2 ? transcript.filter((l) => l.text.toLowerCase().includes(q)) : null;
  React.useEffect(() => {
    if (shown || active < 0 || Date.now() - userScrolled.current < 4000) return;
    list.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [active, shown]);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Transcript"
      className="fixed inset-0 z-[70] flex flex-col bg-primary text-primary-foreground animate-fade-in"
    >
      <div className="flex items-center gap-2 px-3 pb-2 pt-safe">
        <div className="relative mt-2 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-70" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search what's said…"
            aria-label="Search the transcript"
            className="h-10 w-full rounded-full bg-white/15 pl-9 pr-3 text-sm text-primary-foreground outline-none placeholder:text-primary-foreground/60 focus:bg-white/20"
          />
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the transcript"
          className="mt-2 flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/15"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <ol
        ref={list}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 pb-safe pt-2"
        onWheel={() => (userScrolled.current = Date.now())}
        onTouchMove={() => (userScrolled.current = Date.now())}
      >
        {shown && shown.length === 0 && (
          <li className="py-10 text-center text-sm opacity-80">Not said in this episode.</li>
        )}
        {(shown ?? transcript).map((line) => {
          const index = transcript.indexOf(line);
          return (
            <li key={`${line.t}-${index}`} data-index={index}>
              <button
                type="button"
                onClick={() => {
                  onSeek(line.t);
                  if (shown) setQuery("");
                }}
                className={cn(
                  "text-left text-[22px] font-bold leading-snug tracking-tight transition-opacity",
                  shown
                    ? "opacity-100"
                    : index === active
                      ? "opacity-100"
                      : index < active
                        ? "opacity-45"
                        : "opacity-70"
                )}
              >
                <span className="mr-2 align-middle font-mono text-[11px] font-medium opacity-70">
                  {clock(line.t)}
                </span>
                {line.text}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Chapters (or key moments): the current one lit, a few shown, all on "Show all". */
export function TimeListCard({
  id,
  title,
  icon,
  items,
  store,
  onSeek,
  artwork,
}: {
  id: string;
  title: string;
  icon?: LucideIcon;
  items: { t: number; label: string }[];
  store: TimeStore;
  onSeek: (seconds: number) => void;
  artwork?: string | null;
}) {
  const current = useTimeOf(store);
  const [all, setAll] = React.useState(false);
  if (items.length === 0) return null;
  const active = activeIndex(items, current);
  const start = all ? 0 : Math.max(0, Math.min(active, items.length - 3));
  const shown = all ? items : items.slice(start, start + 3);
  return (
    <MediaCard
      id={id}
      title={title}
      icon={icon}
      action={
        items.length > 3 ? (
          <CardAction onClick={() => setAll((v) => !v)}>
            {all ? "Show less" : `Show all (${items.length})`}
          </CardAction>
        ) : undefined
      }
    >
      <ol className="space-y-1">
        {shown.map((item) => {
          const index = items.indexOf(item);
          const next = items[index + 1]?.t;
          const length = next !== undefined ? next - item.t : null;
          const on = index === active;
          return (
            <li key={`${item.t}-${index}`}>
              <button
                type="button"
                onClick={() => onSeek(item.t)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl p-1.5 text-left transition-colors hover:bg-accent/60",
                  on && "bg-primary/10"
                )}
              >
                {artwork ? (
                  <Art src={artwork} name={item.label} className="h-11 w-11 rounded-lg text-sm" />
                ) : (
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-muted font-mono text-[11px] tabular-nums text-muted-foreground">
                    {clock(item.t)}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "line-clamp-2 text-sm font-semibold leading-snug",
                      on && "text-primary"
                    )}
                  >
                    {on && "▶ "}
                    {item.label}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {clock(item.t)}
                    {length && length > 30 ? ` · ${durationLabel(length)}` : ""}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </MediaCard>
  );
}

/** The description or show notes, cut to a few lines with "see more". Times in it jump. */
export function AboutCard({
  id,
  title,
  meta,
  html,
  onSeek,
  footer,
}: {
  id: string;
  title: string;
  meta?: React.ReactNode;
  html: string | null | undefined;
  onSeek?: (seconds: number) => void;
  footer?: React.ReactNode;
}) {
  const [clean, setClean] = React.useState<string | null>(null);
  const [more, setMore] = React.useState(false);
  const [overflows, setOverflows] = React.useState(false);
  const body = React.useRef<HTMLDivElement>(null);
  React.useLayoutEffect(() => {
    const node = body.current;
    if (node && !more) setOverflows(node.scrollHeight > node.clientHeight + 4);
  }, [clean, more]);
  React.useEffect(() => {
    let cancelled = false;
    setClean(null);
    if (!html) return;
    getPurifier().then((DOMPurify) => {
      if (!cancelled) setClean(DOMPurify.sanitize(html, { ADD_ATTR: ["target", "data-t"] }));
    });
    return () => {
      cancelled = true;
    };
  }, [html]);
  return (
    <MediaCard id={id} title={title}>
      {meta && <div className="mb-2 text-sm">{meta}</div>}
      {clean && (
        <div className="relative">
          <div
            ref={body}
            className={cn(
              "prose prose-sm max-w-none text-muted-foreground dark:prose-invert prose-p:my-1.5 prose-a:text-primary",
              !more && "max-h-28 overflow-hidden"
            )}
            onClick={(event) => {
              const time = (event.target as HTMLElement).closest<HTMLElement>("[data-t]");
              if (time && onSeek) {
                event.preventDefault();
                onSeek(Number(time.dataset.t));
              }
            }}
            dangerouslySetInnerHTML={{ __html: clean }}
          />
          {!more && overflows && (
            <div className="pointer-events-none absolute inset-x-0 bottom-6 h-10 bg-gradient-to-t from-card to-transparent" />
          )}
          {(overflows || more) && (
            <button
              type="button"
              onClick={() => setMore((v) => !v)}
              className="mt-1 text-sm font-semibold text-foreground hover:underline"
            >
              {more ? "see less" : "… see more"}
            </button>
          )}
        </div>
      )}
      {footer}
    </MediaCard>
  );
}

/** A sideways row of other episodes or videos (from the same show, or similar ones). */
export function MediaRow({
  id,
  title,
  url,
  excludeId,
  filter,
  onOpen,
  square = true,
}: {
  id: string;
  title: string;
  url: string | null;
  excludeId?: string;
  filter?: (article: ArticleSummary) => boolean;
  onOpen: (article: ArticleSummary) => void;
  /** Square artwork (podcasts) or 16:9 (videos). */
  square?: boolean;
}) {
  const { data } = useSWR<{ articles: ArticleSummary[] }>(url, {
    revalidateOnFocus: false,
    dedupingInterval: 5 * 60 * 1000,
  });
  const items = (data?.articles ?? [])
    .filter((a) => a.id !== excludeId)
    .filter((a) => (filter ? filter(a) : true))
    .slice(0, 12);
  if (items.length === 0) return null;
  return (
    <MediaCard id={id} title={title}>
      <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 scrollbar-none">
        {items.map((article) => (
          <li key={article.id} className={cn("shrink-0 snap-start", square ? "w-32" : "w-48")}>
            <button type="button" onClick={() => onOpen(article)} className="group block text-left">
              <span
                className={cn(
                  "relative block overflow-hidden rounded-xl bg-muted",
                  square ? "aspect-square" : "aspect-video"
                )}
              >
                {article.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={article.imageUrl}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                )}
                <span className="absolute bottom-1.5 right-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white">
                  <Play className="ml-0.5 h-3 w-3 fill-current" />
                </span>
                {article.durationSeconds ? (
                  <span className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1 text-[10px] font-semibold text-white">
                    {durationLabel(article.durationSeconds)}
                  </span>
                ) : null}
              </span>
              <span className="mt-1.5 line-clamp-2 text-[13px] font-semibold leading-snug">
                {article.title}
              </span>
              <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                {article.feed.title} · {formatRelativeTime(article.publishedAt)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </MediaCard>
  );
}

/** Hacker News and Reddit threads about it, when there are any. */
export function DiscussionCard({ articleId }: { articleId: string }) {
  const { data } = useSWR<{ threads: DiscussionThread[] }>(
    `/api/articles/${articleId}/discussion`,
    { revalidateOnFocus: false, dedupingInterval: 10 * 60 * 1000 }
  );
  const threads = data?.threads ?? [];
  if (threads.length === 0) return null;
  return (
    <MediaCard id="discussion" title="Discussion" icon={MessagesSquare}>
      <ul className="-mx-1.5 divide-y">
        {threads.map((thread) => (
          <li key={thread.id}>
            <a
              href={thread.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-xl px-1.5 py-2.5 hover:bg-accent/60"
            >
              <span
                aria-hidden
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white",
                  thread.site === "hn" ? "bg-[#ff6600]" : "bg-[#ff4500]"
                )}
              >
                {thread.site === "hn" ? "Y" : "r/"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 text-sm font-medium leading-snug">
                  {thread.title}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {thread.site === "hn" ? "Hacker News" : thread.where} · {thread.comments} comments
                </span>
              </span>
              <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </a>
          </li>
        ))}
      </ul>
    </MediaCard>
  );
}
