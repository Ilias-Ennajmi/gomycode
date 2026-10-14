"use client";

/*
 * Destructive actions wait out the 4-second Undo window before reaching the
 * server, and survive navigation (the toast lives at the app root). Screens
 * hide items that are waiting to be deleted.
 */

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const EVENT = "stash:pending-delete";

export const UNDO_MS = 4000;

export function isPendingDelete(id: string): boolean {
  return timers.has(id);
}

export function onPendingDeleteChange(listener: () => void): () => void {
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}

export function scheduleDelete(id: string, run: () => Promise<void>): () => void {
  cancelDelete(id);
  timers.set(
    id,
    setTimeout(() => {
      timers.delete(id);
      void run().finally(() => window.dispatchEvent(new Event(EVENT)));
    }, UNDO_MS),
  );
  window.dispatchEvent(new Event(EVENT));
  return () => cancelDelete(id);
}

export function cancelDelete(id: string): void {
  const t = timers.get(id);
  if (t) {
    clearTimeout(t);
    timers.delete(id);
    window.dispatchEvent(new Event(EVENT));
  }
}
