function ArrowIcon({ direction }: { direction: 'prev' | 'next' }) {
  const d = direction === 'prev' ? 'M10 3L5 8l5 5' : 'M6 3l5 5-5 5';
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d={d} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface CarouselArrowsProps {
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  prevLabel: string;
  nextLabel: string;
  className?: string;
}

/** The prev/next square button pair shared by every arrow-driven carousel (paired with useArrowCarousel). */
export function CarouselArrows({ canPrev, canNext, onPrev, onNext, prevLabel, nextLabel, className = '' }: CarouselArrowsProps) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={onPrev}
        disabled={!canPrev}
        aria-label={prevLabel}
        className="flex h-11 w-11 cursor-pointer items-center justify-center border border-line text-ink transition-transform duration-150 active:scale-90 disabled:cursor-not-allowed disabled:opacity-30 md:h-9 md:w-9"
      >
        <ArrowIcon direction="prev" />
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={!canNext}
        aria-label={nextLabel}
        className="flex h-11 w-11 cursor-pointer items-center justify-center border border-line text-ink transition-transform duration-150 active:scale-90 disabled:cursor-not-allowed disabled:opacity-30 md:h-9 md:w-9"
      >
        <ArrowIcon direction="next" />
      </button>
    </div>
  );
}
