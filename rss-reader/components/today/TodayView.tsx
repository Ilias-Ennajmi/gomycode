"use client";

import * as React from "react";
import { PullIndicator, usePullToRefresh } from "@/lib/hooks/usePullToRefresh";
import { toast } from "sonner";
import {
  BookOpen,
  CalendarRange,
  ChevronRight,
  CheckCircle2,
  Loader2,
  Mail,
  Play,
  RefreshCw,
  Shuffle,
  SlidersHorizontal,
  Sparkles,
  Sunrise,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FeedFavicon } from "@/components/shared/FeedFavicon";
import { StoryImage } from "@/components/news/StoryParts";
import { WeatherWidget } from "@/components/news/WeatherWidget";
import { GoalRing } from "@/components/shared/GoalRing";
import { usePersonal } from "@/lib/hooks/usePersonal";
import { useBriefing, type BriefPick, type BriefStory } from "@/lib/hooks/useAi";
import { useReaderState } from "@/lib/hooks/useReaderState";
import { useHomeBlocks, type HomeBlockId } from "@/lib/hooks/useHomeBlocks";
import { ResurfacedHighlights } from "@/components/highlights/ResurfacedHighlights";
import { ReviewPrompt } from "@/components/review/ReviewView";
import { ContinueBlock, HomeCustomise, TidyBlock } from "@/components/today/HomeBlocks";
import { ListenBar, ListenButton, useSpeech } from "@/components/articles/ListenButton";
import type { Briefing } from "@/lib/digest";

/** The briefing as something to read aloud: the big picture, then each top story. */
function briefingSpeech(briefing: Briefing) {
  const parts = [briefing.bigPicture ? `<p>${briefing.bigPicture}</p>` : ""];
  briefing.top.forEach((story, i) => {
    parts.push(`<p>Story ${i + 1}. ${story.headline}.</p>`);
    story.bullets.forEach((b) => parts.push(`<p>${b}</p>`));
    if (story.why) parts.push(`<p>Why it matters: ${story.why}</p>`);
  });
  return parts.join("");
}

function greeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 5) return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function time(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/**
 * Today, the home page: the briefing's blocks (big picture, top stories, numbers,
 * interests, videos, newsletters), plus what you left unfinished, the review, highlights
 * and housekeeping. Each block can be hidden or moved (Customise); it all works without
 * the briefing too.
 */
export function TodayView() {
  const { bind: bindPull, pull, refreshing: pulling } = usePullToRefresh();
  const { briefing, isLoading, mutate } = useBriefing(true);
  const { setSelectedArticleId, setMobilePane, selectedArticleId, setView } = useReaderState();
  const layout = useHomeBlocks();
  const { personal } = usePersonal();
  const [customising, setCustomising] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [extra, setExtra] = React.useState<BriefStory[]>([]);
  const [loadingMore, setLoadingMore] = React.useState<"next" | "shuffle" | null>(null);
  const [exhausted, setExhausted] = React.useState(false);
  // "Listen to Today": the briefing read aloud by the phone's own voice.
  const speech = useSpeech(briefing?.date);

  const open = React.useCallback(
    (articleId: string) => {
      setSelectedArticleId(articleId);
      setMobilePane("reader");
    },
    [setSelectedArticleId, setMobilePane]
  );

  async function refresh() {
    setRefreshing(true);
    try {
      const res = await fetch("/api/digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refresh" }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Could not refresh");
      if (body.nextAt) {
        toast(`Your briefing is fresh. It can be rewritten after ${time(body.nextAt)}.`);
      } else {
        setExtra([]);
        setExhausted(false);
        await mutate({ enabled: true, briefing: body.briefing }, { revalidate: false });
        toast.success("Briefing updated");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not refresh");
    } finally {
      setRefreshing(false);
    }
  }

  async function more(mode: "next" | "shuffle") {
    if (!briefing) return;
    setLoadingMore(mode);
    try {
      const shown = [...briefing.top, ...(mode === "next" ? extra : [])].map((s) => s.articleId);
      const res = await fetch("/api/digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "more", mode, exclude: shown }),
      });
      const body = (await res.json()) as { stories?: BriefStory[]; error?: string };
      if (!res.ok) throw new Error(body.error || "Could not load more stories");
      const stories = body.stories ?? [];
      if (stories.length === 0) setExhausted(true);
      // "More" adds below; "Shuffle" swaps in a different handful.
      setExtra((prev) => (mode === "next" ? [...prev, ...stories] : stories));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load more stories");
    } finally {
      setLoadingMore(null);
    }
  }

  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const sectionTitle = (children: React.ReactNode) => <SectionTitle>{children}</SectionTitle>;

  // The block that would hold the top stories says what's up when there is no briefing.
  const renderBlock = (id: HomeBlockId): React.ReactNode => {
    switch (id) {
      case "bigPicture":
        return briefing?.bigPicture ? (
          <section className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card p-5 md:p-6">
            <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-primary">
              <Sparkles className="h-4 w-4" /> The big picture
            </h2>
            <p className="mt-2 font-serif text-xl leading-snug md:text-[22px]">
              {briefing.bigPicture}
            </p>
          </section>
        ) : null;
      case "continue":
        return <ContinueBlock title={sectionTitle} onOpen={open} />;
      case "top":
        if (isLoading && !briefing) return <BriefingSkeleton />;
        if (!briefing) {
          return (
            <section className="flex flex-col items-center gap-3 rounded-2xl border border-dashed px-5 py-10 text-center text-muted-foreground">
              <Sunrise className="h-8 w-8" />
              <p className="max-w-sm text-sm">
                No briefing yet. It&rsquo;s written each morning from your new articles when AI is
                on; follow a few more sources or come back after the next refresh.
              </p>
            </section>
          );
        }
        {
          // The lead story with a picture becomes the cover, the way a front page opens.
          const [cover, ...rest] = briefing.top;
          const hasCover = Boolean(cover?.imageUrl);
          return (
            <section>
              {hasCover && <CoverStory story={cover} onOpen={open} />}
              <SectionTitle>{hasCover ? "More top stories" : "Top stories"}</SectionTitle>
              <ol className="mt-2 divide-y">
                {(hasCover ? rest : briefing.top).map((story, i) => (
                  <StoryEntry
                    key={story.articleId}
                    story={story}
                    index={i + (hasCover ? 2 : 1)}
                    active={story.articleId === selectedArticleId}
                    onOpen={open}
                  />
                ))}
              </ol>
            </section>
          );
        }
      case "numbers":
        return briefing && briefing.numbers.length > 0 ? (
          <section>
            <SectionTitle>By the numbers</SectionTitle>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {briefing.numbers.map((n) => (
                <button
                  key={`${n.value}-${n.label}`}
                  type="button"
                  onClick={() => open(n.articleId)}
                  className="rounded-xl border bg-card/60 p-4 text-left transition-colors hover:bg-accent/50"
                >
                  <p className="font-serif text-3xl font-semibold tabular-nums text-primary">
                    {n.value}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">{n.label}</p>
                </button>
              ))}
            </div>
          </section>
        ) : null;
      case "interests":
        return briefing && briefing.interests.length > 0 ? (
          <section>
            <SectionTitle>In your interests</SectionTitle>
            <div className="mt-3 grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
              {briefing.interests.map((interest) => (
                <div key={interest.name}>
                  <h3 className="border-b pb-1.5 text-sm font-semibold">{interest.name}</h3>
                  <ul className="divide-y">
                    {interest.picks.map((p) => (
                      <PickLine key={p.articleId} pick={p} onOpen={open} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        ) : null;
      case "watch":
        return briefing && briefing.watch.length > 0 ? (
          <section>
            <SectionTitle icon={<Play className="h-4 w-4 text-red-600" />}>
              Worth watching
            </SectionTitle>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {briefing.watch.map((v) => (
                <button
                  key={v.articleId}
                  type="button"
                  onClick={() => open(v.articleId)}
                  className="group text-left"
                >
                  <div className="relative overflow-hidden rounded-lg">
                    <StoryImage src={v.imageUrl} className="aspect-video w-full" />
                    <span className="absolute inset-0 flex items-center justify-center bg-black/10 opacity-0 transition-opacity group-hover:opacity-100">
                      <Play className="h-8 w-8 fill-white text-white" />
                    </span>
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-[13px] font-medium leading-snug">
                    {v.title}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{v.source.title}</p>
                </button>
              ))}
            </div>
          </section>
        ) : null;
      case "reads":
        return briefing && (briefing.newsletters.length > 0 || briefing.longRead) ? (
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
            {briefing.newsletters.length > 0 && (
              <section className={cn(!briefing.longRead && "sm:col-span-2")}>
                <SectionTitle icon={<Mail className="h-4 w-4 text-muted-foreground" />}>
                  Newsletters to read
                </SectionTitle>
                <ul className="mt-1 divide-y">
                  {briefing.newsletters.map((p) => (
                    <PickLine key={p.articleId} pick={p} onOpen={open} />
                  ))}
                </ul>
              </section>
            )}
            {briefing.longRead && (
              <section>
                <SectionTitle icon={<BookOpen className="h-4 w-4 text-muted-foreground" />}>
                  One long read
                </SectionTitle>
                <button
                  type="button"
                  onClick={() => open(briefing.longRead!.articleId)}
                  className="group mt-3 block w-full text-left"
                >
                  {briefing.longRead.imageUrl && (
                    <StoryImage
                      src={briefing.longRead.imageUrl}
                      className="mb-2 aspect-[16/9] w-full rounded-lg"
                    />
                  )}
                  <p className="font-serif text-lg font-semibold leading-snug group-hover:underline">
                    {briefing.longRead.title}
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <FeedFavicon
                      title={briefing.longRead.source.title}
                      faviconUrl={briefing.longRead.source.faviconUrl}
                      size={14}
                    />
                    {briefing.longRead.source.title} · {briefing.longRead.minutes} min
                  </p>
                </button>
              </section>
            )}
          </div>
        ) : null;
      case "review":
        return <ReviewPrompt />;
      case "highlights":
        return <ResurfacedHighlights onOpen={open} title={sectionTitle} />;
      case "tidy":
        return <TidyBlock />;
      case "more":
        return briefing ? (
          <section>
            <SectionTitle>More stories</SectionTitle>
            {extra.length > 0 && (
              <ol className="mt-2 divide-y">
                {extra.map((story) => (
                  <StoryEntry
                    key={story.articleId}
                    story={story}
                    active={story.articleId === selectedArticleId}
                    onOpen={open}
                  />
                ))}
              </ol>
            )}
            {exhausted ? (
              <p className="mt-3 text-sm text-muted-foreground">
                That&rsquo;s every story from the last day.
              </p>
            ) : (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  className="gap-1.5 rounded-full"
                  onClick={() => more("next")}
                  disabled={loadingMore !== null}
                >
                  {loadingMore === "next" && <Loader2 className="h-4 w-4 animate-spin" />}
                  {extra.length > 0 ? "Even more" : "Show more stories"}
                </Button>
                <Button
                  variant="ghost"
                  className="gap-1.5 rounded-full"
                  onClick={() => more("shuffle")}
                  disabled={loadingMore !== null}
                >
                  {loadingMore === "shuffle" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Shuffle className="h-4 w-4" />
                  )}
                  Shuffle
                </Button>
              </div>
            )}
          </section>
        ) : null;
      case "week":
        return (
          <button
            type="button"
            onClick={() => setView({ type: "recap", label: "Weekly recap" })}
            className="flex w-full items-center gap-3 rounded-2xl border bg-card/60 p-4 text-left transition-colors hover:bg-accent/60"
          >
            <CalendarRange className="h-6 w-6 shrink-0 text-primary" />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">Your week</span>
              <span className="block text-sm text-muted-foreground">
                The stories of the last seven days and what you read
              </span>
            </span>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </button>
        );
    }
  };

  return (
    <div className="relative h-full">
      {briefing && <ListenBar speech={speech} html={briefingSpeech(briefing)} />}
      <div ref={bindPull} className="h-full overflow-y-auto overscroll-contain scrollbar-thin">
        <PullIndicator pull={pull} refreshing={pulling} />
        <div className="mx-auto max-w-3xl px-4 pb-24 pt-5 md:px-8 md:pt-8">
          <header className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                <Sunrise className="h-4 w-4" /> Today
              </p>
              <h1 className="mt-1 font-serif text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
                {greeting()}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {today}
                {briefing && (
                  <>
                    {" "}
                    · from {briefing.scanned} new articles · updated {time(briefing.generatedAt)}
                  </>
                )}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              {personal.ring && <GoalRing size={48} className="mr-1" />}
              <WeatherWidget />
              {briefing && (
                <ListenButton
                  speech={speech}
                  html={briefingSpeech(briefing)}
                  className="h-9 w-9 rounded-full"
                />
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-full"
                onClick={refresh}
                disabled={refreshing || !briefing}
                aria-label="Rewrite the briefing"
                title="Rewrite the briefing"
              >
                <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-full"
                onClick={() => setCustomising(true)}
                aria-label="Customise Today"
                title="Customise Today"
              >
                <SlidersHorizontal className="h-4 w-4" />
              </Button>
            </div>
          </header>

          <div className="mt-8 space-y-12">
            {layout.blocks
              .filter((block) => block.on)
              .map((block) => {
                const node = renderBlock(block.id);
                return node ? <React.Fragment key={block.id}>{node}</React.Fragment> : null;
              })}

            <footer className="flex flex-col items-center gap-2 border-t pt-8 text-center text-muted-foreground">
              <CheckCircle2 className="h-8 w-8 text-primary" />
              <p className="font-serif text-xl text-foreground">You&rsquo;re all caught up</p>
              <p className="text-sm">A new briefing is written each morning.</p>
            </footer>
          </div>
        </div>
      </div>
      <HomeCustomise open={customising} onOpenChange={setCustomising} layout={layout} />
    </div>
  );
}

/** The cover: the day's lead story full-bleed, headline over the picture. */
function CoverStory({ story, onOpen }: { story: BriefStory; onOpen: (articleId: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(story.articleId)}
      className="group relative mb-8 block w-full overflow-hidden rounded-3xl bg-muted text-left text-white shadow-lg"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={story.imageUrl!}
        alt=""
        referrerPolicy="no-referrer"
        className="aspect-[4/5] w-full object-cover transition-transform duration-700 group-hover:scale-[1.03] sm:aspect-[16/10]"
      />
      <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/5" />
      <span className="absolute inset-x-0 bottom-0 p-5 sm:p-7">
        {story.section && (
          <span className="inline-block rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] backdrop-blur">
            {story.section}
          </span>
        )}
        <span className="mt-3 block text-balance font-serif text-3xl font-semibold leading-[1.1] sm:text-4xl">
          {story.headline}
        </span>
        {story.bullets[0] && (
          <span className="mt-2 line-clamp-2 block text-sm text-white/85 sm:text-[15px]">
            {story.bullets[0]}
          </span>
        )}
        <span className="mt-3 flex items-center gap-2 text-xs text-white/80">
          <span className="flex -space-x-1.5">
            {story.sources.slice(0, 4).map((s) => (
              <FeedFavicon
                key={s.title}
                title={s.title}
                faviconUrl={s.faviconUrl}
                size={18}
                className="ring-2 ring-black/40"
              />
            ))}
          </span>
          {story.sources.length > 1 ? `${story.sources.length} sources` : story.sources[0]?.title}
        </span>
      </span>
    </button>
  );
}

function SectionTitle({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 border-b-2 border-foreground pb-2 font-serif text-2xl font-semibold tracking-tight">
      {icon}
      {children}
    </h2>
  );
}

function StoryEntry({
  story,
  index,
  active,
  onOpen,
}: {
  story: BriefStory;
  index?: number;
  active: boolean;
  onOpen: (articleId: string) => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(story.articleId)}
        className={cn(
          "group flex w-full gap-4 py-5 text-left",
          active && "rounded-lg bg-accent/40"
        )}
      >
        {index !== undefined && (
          <span className="w-6 shrink-0 font-serif text-2xl font-semibold leading-none text-primary">
            {index}
          </span>
        )}
        <div className="min-w-0 flex-1">
          {story.section && (
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              {story.section}
            </p>
          )}
          <h3 className="mt-0.5 text-balance font-serif text-xl font-semibold leading-snug group-hover:underline">
            {story.headline}
          </h3>
          {story.bullets.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {story.bullets.map((bullet) => (
                <li
                  key={bullet}
                  className="flex gap-2 text-[14.5px] leading-snug text-foreground/85"
                >
                  <span
                    className="mt-[8px] h-1 w-1 shrink-0 rounded-full bg-foreground/60"
                    aria-hidden
                  />
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          )}
          {story.why && (
            <p className="mt-2 text-[14.5px] leading-snug">
              <span className="font-semibold">Why it matters: </span>
              <span className="text-foreground/85">{story.why}</span>
            </p>
          )}
          <p className="mt-2.5 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="flex -space-x-1.5">
              {story.sources.slice(0, 4).map((s) => (
                <FeedFavicon
                  key={s.title}
                  title={s.title}
                  faviconUrl={s.faviconUrl}
                  size={16}
                  className="rounded-full bg-background ring-2 ring-background"
                />
              ))}
            </span>
            {story.sources.length > 1 ? `${story.sources.length} sources` : story.sources[0]?.title}
          </p>
        </div>
        {story.imageUrl && (
          <StoryImage
            src={story.imageUrl}
            className="hidden h-24 w-32 shrink-0 rounded-lg sm:block"
          />
        )}
      </button>
    </li>
  );
}

function PickLine({ pick, onOpen }: { pick: BriefPick; onOpen: (articleId: string) => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(pick.articleId)}
        className="group block w-full py-2.5 text-left"
      >
        <p className="text-[14px] font-medium leading-snug group-hover:underline">{pick.title}</p>
        {pick.note && (
          <p className="mt-0.5 line-clamp-2 text-[13px] text-muted-foreground">{pick.note}</p>
        )}
        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <FeedFavicon title={pick.source.title} faviconUrl={pick.source.faviconUrl} size={13} />
          {pick.source.title}
        </p>
      </button>
    </li>
  );
}

function BriefingSkeleton() {
  return (
    <div className="space-y-8" aria-label="Writing your briefing">
      <Skeleton className="h-28 w-full rounded-2xl" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-6 w-4/5" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ))}
    </div>
  );
}
