"use client";

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";

/**
 * A `role="toolbar"` whose buttons share one tab stop: arrow keys, Home and End move between them (focus stays on
 * the last used button, so Tab returns to it). Disabled buttons are skipped.
 */
export function RovingToolbar({
  label,
  orientation = "horizontal",
  className,
  children,
}: {
  label: string;
  orientation?: "horizontal" | "vertical";
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const buttons = () => Array.from(ref.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);

  // Exactly one enabled button is tabbable; re-run after every render so enabling and disabling keep that true.
  useEffect(() => {
    const all = buttons();
    const current = all.find((b) => b.tabIndex === 0) ?? all[0];
    all.forEach((b) => (b.tabIndex = b === current ? 0 : -1));
  });

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const all = buttons();
    const i = all.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    const next = orientation === "horizontal" ? "ArrowRight" : "ArrowDown";
    const prev = orientation === "horizontal" ? "ArrowLeft" : "ArrowUp";
    let to = -1;
    if (e.key === next) to = (i + 1) % all.length;
    else if (e.key === prev) to = (i - 1 + all.length) % all.length;
    else if (e.key === "Home") to = 0;
    else if (e.key === "End") to = all.length - 1;
    if (to < 0) return;
    e.preventDefault();
    all.forEach((b, j) => (b.tabIndex = j === to ? 0 : -1));
    all[to].focus();
  };

  return (
    <div ref={ref} role="toolbar" aria-label={label} aria-orientation={orientation} onKeyDown={onKeyDown} className={className}>
      {children}
    </div>
  );
}
