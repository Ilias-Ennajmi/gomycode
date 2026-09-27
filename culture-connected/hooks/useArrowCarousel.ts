'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Shared scroll-tracking logic behind every arrow-driven horizontal
 * carousel in this codebase (first built inline in CaseStudiesPreview.tsx).
 * Returns a track ref to attach to the `overflow-x-auto` container, whether
 * each arrow should be enabled, and a `scrollByCard` step function sized off
 * the track's first child. `resetKey` re-runs the scroll-state check when a
 * filter/tab swaps the track's content out from under it.
 */
export function useArrowCarousel(resetKey?: unknown) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setCanPrev(el.scrollLeft > 4);
    setCanNext(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }, []);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return undefined;
    updateScrollState();
    el.addEventListener('scroll', updateScrollState, { passive: true });
    window.addEventListener('resize', updateScrollState);
    return () => {
      el.removeEventListener('scroll', updateScrollState);
      window.removeEventListener('resize', updateScrollState);
    };
  }, [updateScrollState]);

  useEffect(() => {
    const el = trackRef.current;
    if (!el || resetKey === undefined) return;
    el.scrollTo({ left: 0 });
    updateScrollState();
    // Only re-run when resetKey changes, not on every updateScrollState identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  function scrollByCard(direction: 1 | -1) {
    const track = trackRef.current;
    if (!track) return;
    const card = track.firstElementChild as HTMLElement | null;
    const gap = 16;
    const step = card ? card.getBoundingClientRect().width + gap : track.clientWidth;
    track.scrollBy({ left: direction * step, behavior: 'smooth' });
  }

  return { trackRef, canPrev, canNext, scrollByCard };
}
