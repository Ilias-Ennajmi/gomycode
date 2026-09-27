'use client';

import { artistRoster } from '@/core/content/roster';
import { useArrowCarousel } from '@/hooks/useArrowCarousel';
import { CarouselArrows } from '../ui/CarouselArrows';

interface ArtistHeroCarouselProps {
  prevLabel: string;
  nextLabel: string;
}

/**
 * Three-at-a-time (one on mobile) scroll-snap carousel of real roster
 * photos, replacing the placeholder hero panel. Uses the existing artist
 * portraits already shipped in /public/artists — swap in dedicated
 * press-kit photography later if the client supplies different shots.
 */
export function ArtistHeroCarousel({ prevLabel, nextLabel }: ArtistHeroCarouselProps) {
  const { trackRef, canPrev, canNext, scrollByCard } = useArrowCarousel();

  return (
    <div className="mx-[clamp(18px,4vw,52px)]">
      <div ref={trackRef} className="no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-2">
        {artistRoster.map((artist) => (
          <div key={artist.slug} className="group w-[clamp(200px,31vw,340px)] flex-none snap-start">
            <div className="aspect-[3/4] overflow-hidden bg-chip">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={artist.image}
                alt={artist.name}
                loading="lazy"
                className="h-full w-full scale-100 object-cover transition-transform duration-500 ease-out group-hover:scale-[1.06]"
              />
            </div>
            <div className="mt-3 font-inter text-[16px] font-bold leading-[1.2] text-ink">{artist.name}</div>
          </div>
        ))}
      </div>
      <CarouselArrows
        canPrev={canPrev}
        canNext={canNext}
        onPrev={() => scrollByCard(-1)}
        onNext={() => scrollByCard(1)}
        prevLabel={prevLabel}
        nextLabel={nextLabel}
        className="mt-4"
      />
    </div>
  );
}
