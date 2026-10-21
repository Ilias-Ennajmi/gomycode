'use client';

import { useEffect, useRef, useState } from 'react';

export interface UseCounterOptions {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
}

function format(value: number, decimals: number, prefix: string, suffix: string) {
  return `${prefix}${value.toFixed(decimals)}${suffix}`;
}

/**
 * Port of the prototype's `[data-count]` counter: counts from 0 to target
 * over 1500ms with cubic ease-out, fired once on viewport entry, with a
 * 3.2s failsafe. The final value is always the returned display fallback,
 * so the number is never blank if JS is slow to run.
 */
export function useCounter<T extends HTMLElement = HTMLElement>({
  value,
  decimals = 0,
  prefix = '',
  suffix = '',
}: UseCounterOptions) {
  const ref = useRef<T | null>(null);
  const target = format(value, decimals, prefix, suffix);
  const [display, setDisplay] = useState(target);
  const ranRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    const prefersReduced =
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const run = () => {
      if (ranRef.current) return;
      ranRef.current = true;
      if (prefersReduced) {
        setDisplay(target);
        return;
      }
      const start = performance.now();
      const duration = 1500;
      const step = (now: number) => {
        const progress = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        setDisplay(format(value * eased, decimals, prefix, suffix));
        if (progress < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          run();
          observer.disconnect();
        }
      },
      { threshold: 0 },
    );
    observer.observe(el);

    const failsafe = setTimeout(run, 3200);

    return () => {
      observer.disconnect();
      clearTimeout(failsafe);
    };
  }, [value, decimals, prefix, suffix, target]);

  return { ref, display };
}
