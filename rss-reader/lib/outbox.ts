"use client";

// Changes made while offline (read, saved, archived, progress, snooze) wait here and are
// sent when the connection is back. Each entry is a request to replay, oldest first.

const KEY = "outbox";
const EVENT = "reader:outbox";

export interface OutboxItem {
  id: string;
  url: string;
  method: string;
  body: unknown;
  at: number;
}

function read(): OutboxItem[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]") as OutboxItem[];
  } catch {
    return [];
  }
}

function write(items: OutboxItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // Lost on reload: the user sees the change undone and can redo it.
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function outboxSize() {
  return read().length;
}

export function onOutboxChange(handler: () => void) {
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}

/** A failed network request: keep the newest change per url (a later tap wins). */
export function enqueue(url: string, method: string, body: unknown) {
  const items = read().filter((item) => !(item.url === url && item.method === method));
  items.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    url,
    method,
    body,
    at: Date.now(),
  });
  write(items);
}

/** True for the failures that mean "no network", not "the server said no". */
export function isNetworkError(error: unknown) {
  return (
    (typeof navigator !== "undefined" && navigator.onLine === false) ||
    (error instanceof TypeError && /fetch|network|load failed/i.test(error.message))
  );
}

let flushing = false;

/** Replays the queue. Stops at the first network failure; drops requests the server rejects. */
export async function flushOutbox(): Promise<number> {
  if (flushing) return 0;
  flushing = true;
  let sent = 0;
  try {
    let items = read();
    while (items.length > 0) {
      const item = items[0];
      try {
        const res = await fetch(item.url, {
          method: item.method,
          headers: { "Content-Type": "application/json" },
          body: item.body === undefined ? undefined : JSON.stringify(item.body),
        });
        if (res.status === 401) break;
        sent += 1;
      } catch (error) {
        if (isNetworkError(error)) break;
      }
      items = items.slice(1);
      write(items);
    }
  } finally {
    flushing = false;
  }
  return sent;
}
