"use client";

import { X } from "lucide-react";
import { useSyncExternalStore } from "react";
import type { ToastOptions } from "@/lib/engine/commands/registry";

export type ToastItem = Required<Pick<ToastOptions, "message" | "durationMs">> & { id: number; action?: ToastOptions["action"] };

type Timer = { handle: ReturnType<typeof setTimeout> | null; remaining: number; startedAt: number; holds: Set<string> };

const DEFAULT_MS = 5000;
const MAX_VISIBLE = 3;

/**
 * The toasts on screen. A toast lives `durationMs` (5 s by default); while the pointer is over it or focus is inside
 * it the clock is stopped and keeps the time that was left. At most three show at once, the oldest goes first.
 */
export class ToastStore {
  private list: readonly ToastItem[] = [];
  private readonly timers = new Map<number, Timer>();
  private readonly listeners = new Set<() => void>();
  private counter = 0;

  get items(): readonly ToastItem[] {
    return this.list;
  }

  push(o: ToastOptions): number {
    const id = ++this.counter;
    const item: ToastItem = { id, message: o.message, action: o.action, durationMs: o.durationMs ?? DEFAULT_MS };
    this.list = [...this.list, item];
    this.timers.set(id, { handle: null, remaining: item.durationMs, startedAt: 0, holds: new Set() });
    this.start(id);
    while (this.list.length > MAX_VISIBLE) this.remove(this.list[0].id);
    this.emit();
    return id;
  }

  dismiss(id: number): void {
    if (this.remove(id)) this.emit();
  }

  /** Stop (on) or restart (off) the clock for one reason; the clock runs only while there is no reason to hold it. */
  hold(id: number, reason: "hover" | "focus", on: boolean): void {
    const t = this.timers.get(id);
    if (!t) return;
    const wasHeld = t.holds.size > 0;
    if (on) t.holds.add(reason);
    else t.holds.delete(reason);
    const held = t.holds.size > 0;
    if (held && !wasHeld && t.handle !== null) {
      clearTimeout(t.handle);
      t.handle = null;
      t.remaining = Math.max(0, t.remaining - (Date.now() - t.startedAt));
    } else if (!held && wasHeld) {
      this.start(id);
    }
  }

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  };

  private start(id: number): void {
    const t = this.timers.get(id);
    if (!t) return;
    t.startedAt = Date.now();
    t.handle = setTimeout(() => this.dismiss(id), t.remaining);
  }

  private remove(id: number): boolean {
    const t = this.timers.get(id);
    if (t?.handle) clearTimeout(t.handle);
    this.timers.delete(id);
    const next = this.list.filter((x) => x.id !== id);
    if (next.length === this.list.length) return false;
    this.list = next;
    return true;
  }

  private emit(): void {
    for (const cb of [...this.listeners]) cb();
  }
}

/** The app-wide toast store. */
export const toastStore = new ToastStore();

/** Show a toast: `toast({ message: "Deleted 3 objects", action: { label: "Undo", run } })`. Returns its id. */
export function toast(o: ToastOptions): number {
  return toastStore.push(o);
}

const subscribeStore = (store: ToastStore) => store.subscribe;

/**
 * Renders the toasts. The polite live region is always mounted so screen readers announce what appears in it; toasts
 * never take focus. Mount once, near the root of the editor.
 */
export function ToastViewport({ store = toastStore }: { store?: ToastStore }) {
  const items = useSyncExternalStore(
    subscribeStore(store),
    () => store.items,
    () => store.items,
  );
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-0 z-(--z-toast) flex flex-col items-center gap-2 px-4"
      style={{ bottom: "calc(var(--space-8) * 3 + env(safe-area-inset-bottom, 0px))" }}
    >
      {items.map((t) => (
        <div
          key={t.id}
          data-toast=""
          onMouseEnter={() => store.hold(t.id, "hover", true)}
          onMouseLeave={() => store.hold(t.id, "hover", false)}
          onFocus={() => store.hold(t.id, "focus", true)}
          onBlur={() => store.hold(t.id, "focus", false)}
          className="pointer-events-auto flex min-h-(--target-min) max-w-md items-center gap-3 rounded-md bg-fg py-1 pr-1 pl-4 text-(length:--text-sm) text-canvas shadow-3 transition-[opacity,transform] duration-(--dur-base) ease-out starting:translate-y-2 starting:opacity-0"
        >
          <span className="min-w-0 py-1 break-words">{t.message}</span>
          {t.action ? (
            <button
              type="button"
              className="min-h-(--target-min) shrink-0 rounded-sm px-3 font-semibold underline underline-offset-2 transition-transform duration-(--dur-fast) ease-out active:scale-[0.97]"
              onClick={() => {
                t.action!.run();
                store.dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          ) : null}
          <button
            type="button"
            aria-label="Dismiss"
            className="inline-flex min-h-(--target-min) min-w-(--target-min) shrink-0 items-center justify-center rounded-sm transition-transform duration-(--dur-fast) ease-out active:scale-[0.97]"
            onClick={() => store.dismiss(t.id)}
          >
            <X aria-hidden="true" size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
