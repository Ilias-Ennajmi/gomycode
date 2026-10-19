"use client";

import { flushSync } from "react-dom";

// Motion helpers: the browser's view transitions (a card morphs into the article), and the
// phone's "reduce motion" setting, which every effect in the app checks through here.

export function reducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

type WithTransition = Document & {
  startViewTransition?: (update: () => void) => { finished: Promise<void> };
};

/**
 * Runs a state change inside a view transition where the browser supports it, so elements
 * that share a `view-transition-name` before and after glide between their places. Falls
 * back to a plain update elsewhere, and when motion is reduced.
 */
export function withViewTransition(update: () => void, { prepare }: { prepare?: () => void } = {}) {
  const doc = document as WithTransition;
  if (!doc.startViewTransition || reducedMotion()) {
    update();
    return;
  }
  prepare?.();
  doc.startViewTransition(() => flushSync(update));
}
