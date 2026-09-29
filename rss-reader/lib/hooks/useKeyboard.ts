"use client";

import { useEffect } from "react";

export type KeyboardShortcutMap = Record<string, (event: KeyboardEvent) => void>;

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
}

/**
 * Registers global keyboard shortcuts, matched case-insensitively on
 * `event.key`. Ignored while typing in a form field, except "escape".
 */
export function useKeyboard(shortcuts: KeyboardShortcutMap, enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      if (key !== "escape" && isTypingTarget(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      shortcuts[key]?.(event);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, shortcuts]);
}
