"use client";

import * as React from "react";

// The bars around a list (tabs, filters) slide away while you scroll down and come back when
// you scroll up, so a phone screen is mostly articles. One small store, shared by the list
// (which scrolls) and the app shell (which owns the bars).

let hidden = false;
let lastToggle = 0;
const listeners = new Set<() => void>();
// The bars take this long to slide; the list resizing meanwhile is not the user scrolling.
const SETTLE_MS = 350;

function set(next: boolean) {
  if (hidden === next) return;
  hidden = next;
  lastToggle = performance.now();
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

// Where the list was at the last move; shared, so a jump we make ourselves (restoring a
// remembered position) can set the baseline instead of counting as the user scrolling.
let lastTop = 0;

/** The list was moved by the app, not the user: don't treat the jump as a scroll. */
export function syncChromeScroll(top: number) {
  lastTop = top;
}

/**
 * Attach to a scrolling element's onScroll: down hides the bars, up shows them. Does
 * nothing where the bars aren't in the way (desktop), so call only for phones.
 */
export function useHideOnScroll() {
  const ticking = React.useRef(false);
  return React.useCallback((event: React.UIEvent<HTMLElement>) => {
    const node = event.currentTarget;
    if (ticking.current) return;
    ticking.current = true;
    requestAnimationFrame(() => {
      ticking.current = false;
      const top = node.scrollTop;
      const delta = top - lastTop;
      // Content shorter than the screen can't scroll: keep the bars.
      const scrollable = node.scrollHeight - node.clientHeight > MIN_SCROLL * 2;
      if (top < MIN_SCROLL || !scrollable) {
        set(false);
        lastTop = top;
        return;
      }
      // Hiding or showing the bars resizes the list. At the end of a list that resize moves
      // the position by itself (the browser clamps it), which looked like scrolling back up,
      // showed the bars, shrank the list, and so on: the bars shook. Moves while the bars
      // settle, and upward moves pinned to the very end, don't count.
      const atEnd = top + node.clientHeight >= node.scrollHeight - 4;
      if (performance.now() - lastToggle < SETTLE_MS || (atEnd && delta < 0)) {
        lastTop = top;
        return;
      }
      if (delta > STEP) set(true);
      else if (delta < -STEP) set(false);
      if (Math.abs(delta) > STEP) lastTop = top;
    });
  }, []);
}
