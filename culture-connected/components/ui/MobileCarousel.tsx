'use client';

import { useRef, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * Horizontal snap-scroll carousel with dot indicators, mobile-only
 * (md:hidden — pair with a `hidden md:grid` version of the same items for
 * desktop). Cards passed as `children` should each carry
 * `flex-none snap-start` sizing so the next card visibly peeks at the edge.
 */
export function MobileCarousel({ children, count }: { children: ReactNode; count: number }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  function onScroll() {
    const el = trackRef.current;
    if (!el) return;
    const card = el.firstElementChild as HTMLElement | null;
    const step = card ? card.getBoundingClientRect().width + 16 : el.clientWidth;
    setActive(Math.min(count - 1, Math.max(0, Math.round(el.scrollLeft / step))));
  }

  return (
    <div className="md:hidden">
      <div
        ref={trackRef}
        onScroll={onScroll}
        className="no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-1"
      >
        {children}
      </div>
      {count > 1 ? (
        <div className="mt-4 flex justify-center gap-[6px]">
          {Array.from({ length: count }).map((_, i) => (
            <span
              key={i}
              className={`h-[6px] rounded-full transition-all duration-300 ${
                i === active ? 'w-5 bg-red' : 'w-[6px] bg-line'
              }`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
