'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Port of the prototype's `[data-rv]` scroll reveal: fades/translates an
 * element in once it enters the viewport, staggered up to 4 items at 60ms,
 * with a 3s failsafe. Uses IntersectionObserver instead of a scroll sweep.
 */
export function useReveal<T extends HTMLElement = HTMLElement>(index = 0) {
  const ref = useRef<T | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    const prefersReduced =
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReduced) {
      setShown(true);
      return undefined;
    }

    let staggerTimeout: ReturnType<typeof setTimeout> | undefined;

    const reveal = () => {
      staggerTimeout = setTimeout(() => setShown(true), (index % 4) * 60);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          reveal();
          observer.disconnect();
        }
      },
      { threshold: 0, rootMargin: '0px 0px -40px 0px' },
    );
    observer.observe(el);

    const failsafe = setTimeout(() => setShown(true), 3000);

    return () => {
      observer.disconnect();
      clearTimeout(staggerTimeout);
      clearTimeout(failsafe);
    };
  }, [index]);

  return { ref, shown };
}
