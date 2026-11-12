"use client";

import { useId, useSyncExternalStore } from "react";

/**
 * A faint tiled diagonal label over the whole page: "Studio · Jane · 2026-11-12". It is a deterrent for screenshots, not protection:
 * anyone with the link can still reach the image files. The text is drawn as an SVG text node (so any name is plain text) and
 * the colour is a token. It is created after mount so the date (the visitor's own day) never differs from the server's HTML.
 */
const subscribeNothing = () => () => undefined;
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function Watermark({ studio, name }: { studio?: string | null; name: string | null }) {
  const id = useId().replace(/:/g, "");
  // null on the server and during hydration, the visitor's own date afterwards.
  const date = useSyncExternalStore(subscribeNothing, today, () => null);
  if (!date) return null;
  const text = [studio, name || "Guest", date].filter(Boolean).join(" \u00b7 ");
  return (
    <svg className="vw-watermark" aria-hidden="true" focusable="false" width="100%" height="100%">
      <defs>
        <pattern id={id} width="280" height="180" patternUnits="userSpaceOnUse" patternTransform="rotate(-24)">
          <text x="20" y="100" fontSize="15" fontFamily="var(--font-ui)" fill="var(--color-ink)">
            {text}
          </text>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}
