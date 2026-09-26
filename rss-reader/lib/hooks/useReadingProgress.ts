"use client";

import { useEffect, useRef, useState } from "react";

interface UseReadingProgressOptions {
  markReadThreshold?: number;
  onThresholdReached?: () => void;
  /** Pass the current article id so progress resets when the article changes. */
  resetKey?: string;
}

/**
 * Tracks scroll progress (0-100) of a scrollable container and fires
 * `onThresholdReached` once when the user scrolls past `markReadThreshold`.
 */
export function useReadingProgress<T extends HTMLElement>({
  markReadThreshold = 80,
  onThresholdReached,
  resetKey,
}: UseReadingProgressOptions = {}) {
  const containerRef = useRef<T | null>(null);
  const [progress, setProgress] = useState(0);
  const firedRef = useRef(false);
  const callbackRef = useRef(onThresholdReached);
  callbackRef.current = onThresholdReached;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    firedRef.current = false;
    el.scrollTop = 0;
    setProgress(0);

    function handleScroll() {
      if (!el) return;
      const scrollable = el.scrollHeight - el.clientHeight;
      const pct = scrollable > 0 ? (el.scrollTop / scrollable) * 100 : 100;
      setProgress(Math.min(100, Math.max(0, pct)));

      if (!firedRef.current && pct >= markReadThreshold) {
        firedRef.current = true;
        callbackRef.current?.();
      }
    }

    el.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => el.removeEventListener("scroll", handleScroll);
  }, [markReadThreshold, resetKey]);

  return { containerRef, progress };
}
