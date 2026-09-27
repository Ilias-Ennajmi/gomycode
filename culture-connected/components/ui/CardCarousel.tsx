'use client';

import type { ReactNode } from 'react';
import { useArrowCarousel } from '@/hooks/useArrowCarousel';
import { CarouselArrows } from './CarouselArrows';

interface CardCarouselProps {
  items: ReactNode[];
  prevLabel: string;
  nextLabel: string;
  cardClassName?: string;
  trackClassName?: string;
}

/** Generic arrow-driven horizontal scroll-snap carousel for a row of pre-rendered cards. */
export function CardCarousel({
  items,
  prevLabel,
  nextLabel,
  cardClassName = 'w-[clamp(260px,34vw,380px)]',
  trackClassName = '',
}: CardCarouselProps) {
  const { trackRef, canPrev, canNext, scrollByCard } = useArrowCarousel();

  return (
    <div>
      <div
        ref={trackRef}
        className={`no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-2 ${trackClassName}`}
      >
        {items.map((item, i) => (
          <div key={i} className={`flex-none snap-start ${cardClassName}`}>
            {item}
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
