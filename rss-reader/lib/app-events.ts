"use client";

import * as React from "react";

// App-wide requests that any component can make without threading callbacks through the tree,
// handled by AppShell (which owns the dialogs).
type AppEvent = "email-newsletter";

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
