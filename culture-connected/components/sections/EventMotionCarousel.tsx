'use client';

import { useArrowCarousel } from '@/hooks/useArrowCarousel';
import { CarouselArrows } from '../ui/CarouselArrows';
import { PlaceholderPanel } from '../ui/PlaceholderPanel';

interface Slide {
  src?: string;
  alt?: string;
}

/** Real event photography where it exists, labelled placeholder slots for the rest — client to supply more. */
const slides: Slide[] = [
  { src: '/case-studies/umbra-marrakech.jpg', alt: 'Umbra Marrakech' },
  { src: '/case-studies/eden-nightclub.jpg', alt: 'Eden Nightclub' },
  {},
  {},
];

interface EventMotionCarouselProps {
  prevLabel: string;
  nextLabel: string;
  placeholderLabel: string;
}

/**
 * Big-image arrow carousel replacing the venue-logo marquee: large full
 * photos instead of small logos, manual scroll/arrow driven (no
 * auto-advance, matching the rest of this codebase's carousels).
 */
export function EventMotionCarousel({ prevLabel, nextLabel, placeholderLabel }: EventMotionCarouselProps) {
  const { trackRef, canPrev, canNext, scrollByCard } = useArrowCarousel();

  return (
    <div>
      <div ref={trackRef} className="no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-2">
        {slides.map((slide, i) => (
          <div
            key={i}
            className="group h-[clamp(220px,32vw,420px)] w-[clamp(260px,58vw,640px)] flex-none snap-start overflow-hidden"
          >
            {slide.src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={slide.src}
                alt={slide.alt}
                loading="lazy"
                className="h-full w-full scale-100 object-cover transition-transform duration-500 ease-out group-hover:scale-[1.05]"
              />
            ) : (
              <PlaceholderPanel label={placeholderLabel} className="h-full w-full p-4" labelClassName="px-3 py-2 text-[11px]" />
            )}
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
