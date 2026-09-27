"use client";

import * as React from "react";
import {
  ArrowRight,
  Globe2,
  Newspaper,
  RefreshCw,
  Settings2,
  Sparkles,
  Sunrise,
  Zap,
} from "lucide-react";
import { useSWRConfig } from "swr";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { HeroSlider } from "@/components/news/HeroSlider";
import { WeatherWidget } from "@/components/news/WeatherWidget";
import { StoryImage, StoryMeta } from "@/components/news/StoryParts";
import { refreshFeeds, refreshToastMessage } from "@/lib/hooks/useFeeds";
import { useFrontPage, useInsights, type NewsSection, type NewsStory } from "@/lib/hooks/useNews";
import { useReaderState } from "@/lib/hooks/useReaderState";

interface NewsViewProps {
  onManageSources: (setup?: boolean) => void;
}

/** The News tab: a front page with top stories, insights, sections and the weather. */
export function NewsView({ onManageSources }: NewsViewProps) {
  const { page, isLoading, error, mutate } = useFrontPage();
  const { setSelectedArticleId, setMobilePane, setView, selectedArticleId } = useReaderState();
  const { mutate: globalMutate } = useSWRConfig();
  const [refreshing, setRefreshing] = React.useState(false);

  const open = React.useCallback(
    (story: { id: string }) => {
      setSelectedArticleId(story.id);
      setMobilePane("reader");
    },
    [setSelectedArticleId, setMobilePane]
  );

  async function refresh() {
    setRefreshing(true);
    try {
      const result = await refreshFeeds();
      await mutate();
      globalMutate((key) => typeof key === "string" && key.startsWith("/api/"));
      toast.success(refreshToastMessage(result));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not refresh");
    } finally {
      setRefreshing(false);
    }
  }

  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="h-full overflow-y-auto overscroll-contain scrollbar-thin">
      <div className="mx-auto max-w-6xl px-4 pb-20 pt-4 md:px-8 md:pt-6">
        <header className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-foreground pb-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {today}
            </p>
            <h1 className="font-serif text-4xl font-semibold leading-none tracking-tight md:text-5xl">
              The News
            </h1>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-9 gap-1.5 rounded-full text-primary"
              onClick={() => setView({ type: "briefing", label: "Today's briefing" })}
            >
              <Sunrise className="h-4 w-4" />
              <span className="max-sm:sr-only">Briefing</span>
            </Button>
            <WeatherWidget />
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full"
              onClick={refresh}
              disabled={refreshing}
              aria-label="Refresh news"
            >
              <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 rounded-full"
              onClick={() => onManageSources()}
            >
              <Settings2 className="h-4 w-4" />
              <span className="max-sm:sr-only">Sources</span>
            </Button>
          </div>
        </header>

        {isLoading && !page ? (
          <FrontPageSkeleton />
        ) : error && !page ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            The news didn&rsquo;t load. Check your connection and try again.
          </p>
        ) : page && !page.hasSources ? (
          <Welcome onSetup={() => onManageSources(true)} />
        ) : page && page.hero.length === 0 && page.sections.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center text-sm text-muted-foreground">
            <Newspaper className="h-10 w-10" />
            <p>No fresh stories yet. Refresh to fetch the latest news.</p>
            <Button size="sm" onClick={refresh} disabled={refreshing}>
              Refresh now
            </Button>
          </div>
        ) : page ? (
          <div className="space-y-10 pt-5">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
              <HeroSlider stories={page.hero} onOpen={open} />
              <Insights />
            </div>

            {page.developing.length > 0 && (
              <StoryRow
                title="Developing"
                icon={<Zap className="h-4 w-4 text-amber-500" />}
                stories={page.developing}
                onOpen={open}
                activeId={selectedArticleId}
              />
            )}

            <div className="grid gap-x-10 gap-y-12 md:grid-cols-2">
              {page.sections.map((section, i) => (
                <React.Fragment key={section.id}>
                  <SectionBlock
                    section={section}
                    wide={i === 0}
                    onOpen={open}
                    activeId={selectedArticleId}
                    onSeeAll={() =>
                      setView({ type: "news", id: section.id, label: `News · ${section.name}` })
                    }
                  />
                  {section.id === "morocco" && page.moroccoAbroad.length > 0 && (
                    <div className="md:col-span-2">
                      <StoryRow
                        title="Morocco in the world press"
                        icon={<Globe2 className="h-4 w-4 text-primary" />}
                        stories={page.moroccoAbroad}
                        onOpen={open}
                        activeId={selectedArticleId}
                      />
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Insights() {
  const { insights, isLoading } = useInsights(true);
  if (insights?.disabled) return null;
  const bullets = insights?.bullets ?? [];
  if (!isLoading && bullets.length === 0) return null;

  return (
    <aside className="rounded-2xl border bg-card/60 p-5">
      <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        <Sparkles className="h-4 w-4 text-primary" /> What&rsquo;s happening
      </h2>
      {isLoading && bullets.length === 0 ? (
        <div className="mt-4 space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : (
        <ul className="mt-3 space-y-3">
          {bullets.map((bullet) => (
            <li key={bullet} className="flex gap-2.5 text-[14px] leading-snug">
              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

function SectionBlock({
  section,
  wide,
  onOpen,
  onSeeAll,
  activeId,
}: {
  section: NewsSection;
  wide: boolean;
  onOpen: (story: NewsStory) => void;
  onSeeAll: () => void;
  activeId: string | null;
}) {
  const [lead, ...rest] = section.stories;
  return (
    <section className={cn(wide && "md:col-span-2")}>
      <header className="flex items-baseline justify-between border-t pt-3">
        <h2 className="font-serif text-2xl font-semibold tracking-tight">{section.name}</h2>
        <button
          type="button"
          onClick={onSeeAll}
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          See all <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </header>
      <div
        className={cn("mt-4 grid gap-6", wide && "lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]")}
      >
        {lead && (
          <button
            type="button"
            onClick={() => onOpen(lead)}
            className={cn(
              "group text-left",
              wide ? "" : "grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]"
            )}
          >
            {lead.imageUrl && (
              <div className="overflow-hidden rounded-xl">
                <StoryImage
                  src={lead.imageUrl}
                  className="aspect-[16/10] w-full transition-transform duration-500 group-hover:scale-[1.03]"
                />
              </div>
            )}
            <div className={cn(wide && lead.imageUrl && "mt-3", !lead.imageUrl && "sm:col-span-2")}>
              <h3
                className={cn(
                  "text-balance font-serif font-semibold leading-snug group-hover:underline",
                  wide ? "text-2xl" : "text-xl",
                  lead.isRead && lead.id !== activeId && "text-muted-foreground"
                )}
              >
                {lead.title}
              </h3>
              {lead.summary && (
                <p className="mt-1.5 line-clamp-3 text-sm text-muted-foreground">{lead.summary}</p>
              )}
              <StoryMeta story={lead} className="mt-2" />
            </div>
          </button>
        )}
        {rest.length > 0 && (
          <ul className="divide-y">
            {rest.map((story) => (
              <li key={story.id}>
                <button
                  type="button"
                  onClick={() => onOpen(story)}
                  className={cn(
                    "group flex w-full gap-3 py-3 text-left first:pt-0",
                    story.id === activeId && "text-primary"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <h3
                      className={cn(
                        "text-[15px] font-medium leading-snug group-hover:underline",
                        story.isRead && story.id !== activeId && "text-muted-foreground"
                      )}
                    >
                      {story.title}
                    </h3>
                    <StoryMeta story={story} className="mt-1" />
                  </div>
                  {story.imageUrl && (
                    <StoryImage
                      src={story.imageUrl}
                      className="h-16 w-20 shrink-0 rounded-lg sm:h-[72px] sm:w-24"
                    />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/** A horizontal strip of compact story cards. */
function StoryRow({
  title,
  icon,
  stories,
  onOpen,
  activeId,
}: {
  title: string;
  icon: React.ReactNode;
  stories: NewsStory[];
  onOpen: (story: NewsStory) => void;
  activeId: string | null;
}) {
  return (
    <section>
      <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {icon} {title}
      </h2>
      <div className="-mx-4 mt-3 flex snap-x gap-3 overflow-x-auto px-4 pb-1 scrollbar-none md:-mx-8 md:px-8">
        {stories.map((story) => (
          <button
            key={story.id}
            type="button"
            onClick={() => onOpen(story)}
            className={cn(
              "group flex w-[270px] shrink-0 snap-start gap-3 rounded-xl border bg-card/60 p-3 text-left transition-colors hover:bg-accent/50",
              story.id === activeId && "border-primary"
            )}
          >
            <StoryImage src={story.imageUrl} className="h-16 w-16 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1">
              <h3 className="line-clamp-3 text-[13.5px] font-medium leading-snug">{story.title}</h3>
              <StoryMeta story={story} className="mt-1" compact />
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

function Welcome({ onSetup }: { onSetup: () => void }) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-4 py-16 text-center">
      <Newspaper className="h-12 w-12 text-primary" />
      <h2 className="font-serif text-3xl font-semibold">Your front page</h2>
      <p className="text-muted-foreground">
        Morocco, Europe and the world, the economy, sport and tech, from outlets you choose. Pick
        your sources once and the front page builds itself: top stories, sections, what&rsquo;s
        developing and the weather.
      </p>
      <Button size="lg" className="rounded-full" onClick={onSetup}>
        Choose my sources
      </Button>
    </div>
  );
}

function FrontPageSkeleton() {
  return (
    <div className="space-y-10 pt-5">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Skeleton className="aspect-[5/6] w-full rounded-2xl sm:aspect-[16/9] lg:aspect-[21/9]" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
      <div className="grid gap-10 md:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="h-7 w-32" />
            <Skeleton className="aspect-[16/10] w-full rounded-xl" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-4/5" />
          </div>
        ))}
      </div>
    </div>
  );
}
