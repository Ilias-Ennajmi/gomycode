"use client";

import { Check } from "lucide-react";
import { useRef, useState, type KeyboardEvent } from "react";

export type MenuEntry =
  | { type: "item"; id: string; label: string; shortcut?: string; checked?: boolean; danger?: boolean; run(opts: { animate: boolean }): void }
  | { type: "separator"; id: string }
  | { type: "heading"; id: string; label: string };

/**
 * The items of a menu (put it in a Popover with role="menu"). Arrow keys move, Home and End jump, typing a letter jumps
 * to the next item that starts with it; Enter and Space run the item (native buttons). `onRun` fires after an item ran,
 * so the owner can close the menu. Items of 36 px (44 on touch).
 */
export function MenuList({ entries, onRun, ignoreClicksMs = 0 }: { entries: readonly MenuEntry[]; onRun(): void; /** Pointer clicks this soon after the menu appeared are ignored (a finger lifting after a long press). */ ignoreClicksMs?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shownAt] = useState(() => Date.now());
  const items = () => Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const all = items();
    const i = all.indexOf(document.activeElement as HTMLButtonElement);
    let to = -1;
    if (e.key === "ArrowDown") to = (i + 1) % all.length;
    else if (e.key === "ArrowUp") to = (i - 1 + all.length) % all.length;
    else if (e.key === "Home") to = 0;
    else if (e.key === "End") to = all.length - 1;
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && /\S/.test(e.key)) {
      const k = e.key.toLowerCase();
      for (let step = 1; step <= all.length; step++) {
        const j = (i + step) % all.length;
        if ((all[j].textContent ?? "").trim().toLowerCase().startsWith(k)) {
          to = j;
          break;
        }
      }
    }
    if (to < 0 || all.length === 0) return;
    e.preventDefault();
    e.stopPropagation();
    all[to].focus();
  };

  return (
    <div ref={ref} onKeyDown={onKeyDown} className="flex max-h-[min(80dvh,34rem)] min-w-52 flex-col overflow-y-auto overscroll-contain">
      {entries.map((e) =>
        e.type === "separator" ? (
          <div key={e.id} role="separator" className="my-1 h-px bg-line" />
        ) : e.type === "heading" ? (
          <div key={e.id} role="presentation" className="px-3 pt-2 pb-1 text-(length:--text-xs) font-medium text-fg-muted">
            {e.label}
          </div>
        ) : (
          <button
            key={e.id}
            type="button"
            role={e.checked === undefined ? "menuitem" : "menuitemradio"}
            aria-checked={e.checked}
            tabIndex={-1}
            onClick={(ev) => {
              if (ev.detail > 0 && Date.now() - shownAt < ignoreClicksMs) return;
              e.run({ animate: ev.detail > 0 });
              onRun();
            }}
            className={`flex min-h-8 w-full items-center gap-3 rounded-sm px-3 text-left text-(length:--text-sm) transition-[background-color] duration-(--dur-fast) ease-out pointer-coarse:min-h-11 focus-visible:bg-(--color-selection-fill) focus-visible:outline-none hoverable:bg-(--color-selection-fill) aria-checked:font-semibold ${
              e.danger ? "text-alert" : "text-fg"
            }`}
          >
            {e.checked !== undefined ? (
              <span aria-hidden="true" className="-ml-1 inline-flex w-4 shrink-0">
                {e.checked ? <Check size={14} strokeWidth={2.25} /> : null}
              </span>
            ) : null}
            <span className="min-w-0 flex-1 truncate">{e.label}</span>
            {e.shortcut ? <span className="shrink-0 text-(length:--text-xs) text-fg-muted">{e.shortcut}</span> : null}
          </button>
        ),
      )}
    </div>
  );
}
