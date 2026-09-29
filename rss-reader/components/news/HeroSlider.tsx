"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/utils";
import { deskName } from "@/lib/news/desks";
import { SourceStack, StoryImage } from "@/components/news/StoryParts";
import type { NewsStory } from "@/lib/hooks/useNews";

const AUTO_ADVANCE_MS = 7000;

/** "À la une": the biggest stories as full-bleed covers, swipeable, auto-advancing. */
export function HeroSlider({
  stories,
  onOpen,
}: {
  stories: NewsStory[];
  onOpen: (story: NewsStory) => void;
}) {
  const trackRef = React.useRef<HTMLDivElement>(null);
  const [index, setIndex] = React.useState(0);
  const [paused, setPaused] = React.useState(false);

  const goTo = React.useCallback((i: number) => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollTo({ left: i * track.clientWidth, behavior: "smooth" });
  }, []);

  // Advance on a timer, unless the reader is hovering, touching or has tabbed away.
  React.useEffect(() => {
    if (paused || stories.length < 2) return;
    const timer = setInterval(() => {
      if (document.hidden) return;
      goTo((index + 1) % stories.length);
    }, AUTO_ADVANCE_MS);
    return () => clearInterval(timer);
  }, [paused, index, stories.length, goTo]);

  if (stories.length === 0) return null;

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Top stories"
      className="relative min-w-0"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
      onFocusCapture={() => setPaused(true)}
    >
      <div
        ref={trackRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          setIndex(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
        }}
        className="flex snap-x snap-mandatory overflow-x-auto rounded-2xl scrollbar-none"
      >
        {stories.map((story, i) => (
          <article
            key={story.id}
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${stories.length}`}
            className="relative w-full shrink-0 snap-center"
          >
            <button
              type="button"
              onClick={() => onOpen(story)}
              className="group relative block h-[min(64vh,440px)] w-full overflow-hidden text-left sm:h-auto sm:aspect-[16/9] lg:aspect-[21/9]"
            >
              <StoryImage
                src={story.imageUrl}
                className="absolute inset-0 h-full w-full transition-transform duration-700 group-hover:scale-[1.02]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/5" />
              <div className="absolute inset-x-0 bottom-0 p-5 pb-9 sm:p-8 sm:pb-10">
                <span className="inline-block rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-white backdrop-blur">
                  {deskName(story.desk)}
                </span>
                <h3 className="mt-3 max-w-4xl text-balance font-serif text-[26px] font-semibold leading-[1.12] text-white sm:text-4xl lg:text-[44px]">
                  {story.title}
                </h3>
                {story.summary && (
                  <p className="mt-3 line-clamp-2 max-w-3xl text-sm text-white/80 max-sm:hidden sm:text-base">
                    {story.summary}
                  </p>
                )}
                <div className="mt-4 flex items-center gap-2.5 text-xs text-white/80 sm:text-sm">
                  <SourceStack story={story} ringClass="ring-black/40" size={20} />
                  <span className="font-medium text-white">
                    {story.sources.length > 1
                      ? `${story.sources.length} outlets`
                      : story.source.title}
                  </span>
                  <span aria-hidden>·</span>
                  <time dateTime={story.publishedAt}>{formatRelativeTime(story.publishedAt)}</time>
                </div>
              </div>
            </button>
          </article>
        ))}
      </div>

      {stories.length > 1 && (
        <>
          <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
            {stories.map((story, i) => (
              <button
                key={story.id}
                type="button"
                onClick={() => goTo(i)}
                aria-label={`Show story ${i + 1}`}
                aria-current={i === index}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === index ? "w-6 bg-white" : "w-1.5 bg-white/50 hover:bg-white/80"
                )}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => goTo((index - 1 + stories.length) % stories.length)}
            aria-label="Previous story"
            className="absolute left-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur transition-colors hover:bg-black/55 md:flex"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => goTo((index + 1) % stories.length)}
            aria-label="Next story"
            className="absolute right-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur transition-colors hover:bg-black/55 md:flex"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </>
      )}
    </section>
  );
}
