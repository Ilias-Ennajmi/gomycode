"use client";

import * as React from "react";

// App-wide requests that any component can make without threading callbacks through the tree,
// handled by AppShell (which owns the dialogs).
type AppEvent =
  | "email-newsletter"
  | "content-filters"
  | "scroll-top"
  | "sources-unused"
  | "find-episodes"
  /** "Got 5 minutes?": the picker for a reading session. */
  | "time-pile";

export function requestAppEvent(event: AppEvent) {
  window.dispatchEvent(new CustomEvent(`reader:${event}`));
}

export function useAppEvent(event: AppEvent, handler: () => void) {
  const ref = React.useRef(handler);
  ref.current = handler;
  React.useEffect(() => {
    const listener = () => ref.current();
    window.addEventListener(`reader:${event}`, listener);
    return () => window.removeEventListener(`reader:${event}`, listener);
  }, [event]);
}

/** Opens the pop-up about a followed source (picture, latest items, mute, unfollow). */
export function requestSourceSheet(feedId: string) {
  window.dispatchEvent(new CustomEvent("reader:source-sheet", { detail: feedId }));
}

export function useSourceSheetRequest(handler: (feedId: string) => void) {
  const ref = React.useRef(handler);
  ref.current = handler;
  React.useEffect(() => {
    const listener = (event: Event) => ref.current((event as CustomEvent<string>).detail);
    window.addEventListener("reader:source-sheet", listener);
    return () => window.removeEventListener("reader:source-sheet", listener);
  }, []);
}
