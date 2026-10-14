"use client";

import { useSyncExternalStore } from "react";

// Re-reads computed token values whenever <html>'s theme, accent or inline vars change.
function subscribe(onChange: () => void) {
  const mo = new MutationObserver(onChange);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-accent", "style"] });
  return () => mo.disconnect();
}

/** Live computed values of CSS custom properties on <html> (empty strings on the server). */
export function useLiveTokens(names: readonly string[]): Record<string, string> {
  const key = names.join("|");
  const snapshot = useSyncExternalStore(
    subscribe,
    () => {
      const cs = getComputedStyle(document.documentElement);
      return names.map((n) => cs.getPropertyValue(n).trim()).join("|");
    },
    () => "",
  );
  const values = snapshot ? snapshot.split("|") : [];
  return Object.fromEntries(key.split("|").map((n, i) => [n, values[i] ?? ""]));
}

function subscribeScheme(onChange: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/** The OS colour scheme, for the "System" preview panel. */
export function useSystemTheme(): "dark" | "light" {
  return useSyncExternalStore(
    subscribeScheme,
    () => (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
    () => "light",
  );
}
