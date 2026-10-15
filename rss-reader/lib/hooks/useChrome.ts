"use client";

import * as React from "react";

// The bars around a list (tabs, filters) slide away while you scroll down and come back when
// you scroll up, so a phone screen is mostly articles. One small store, shared by the list
// (which scrolls) and the app shell (which owns the bars).

let hidden = false;
const listeners = new Set<() => void>();

function set(next: boolean) {
  if (hidden === next) return;
  hidden = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Whether the bars are tucked away right now. */
export function useChromeHidden() {
  return React.useSyncExternalStore(
    subscribe,
    () => hidden,
    () => false
  );
}

export function showChrome() {
  set(false);
}

const MIN_SCROLL = 96; // never hide near the top
const STEP = 10; // ignore tiny moves and jitter

/**
 * Attach to a scrolling element's onScroll: down hides the bars, up shows them. Does
 * nothing where the bars aren't in the way (desktop), so call only for phones.
 */
export function useHideOnScroll() {
  const last = React.useRef(0);
  const ticking = React.useRef(false);
  return React.useCallback((event: React.UIEvent<HTMLElement>) => {
    const node = event.currentTarget;
    if (ticking.current) return;
    ticking.current = true;
    requestAnimationFrame(() => {
      ticking.current = false;
      const top = node.scrollTop;
      const delta = top - last.current;
      // Content shorter than the screen can't scroll: keep the bars.
      const scrollable = node.scrollHeight - node.clientHeight > MIN_SCROLL * 2;
      if (top < MIN_SCROLL || !scrollable) {
        set(false);
        last.current = top;
        return;
      }
      if (delta > STEP) set(true);
      else if (delta < -STEP) set(false);
      if (Math.abs(delta) > STEP) last.current = top;
    });
  }, []);
}
