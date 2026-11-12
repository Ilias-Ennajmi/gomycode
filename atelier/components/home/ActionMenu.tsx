"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { MoreHorizontal, type LucideIcon } from "lucide-react";

const SUPPORTS_POPOVER = typeof HTMLElement !== "undefined" && "showPopover" in HTMLElement.prototype;

export type MenuAction = { label: string; icon: LucideIcon; onSelect: () => void; danger?: boolean };

/**
 * A "more actions" button with a menu in the browser's popover layer (top layer, no z-index fights). Keyboard: Enter/Space/ArrowDown open it on the first item (ArrowUp on the
 * last), arrows move and wrap, Home/End jump, Escape closes and gives focus back to the button,
 * Tab closes. The menu opens at the button and flips above it near the bottom of the window.
 */
export function ActionMenu({
  label,
  items,
  disabled = false,
  className = "",
}: {
  label: string;
  items: MenuAction[];
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [startAt, setStartAt] = useState<"first" | "last">("first");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback((refocus: boolean) => {
    try {
      menuRef.current?.hidePopover?.();
    } catch {
      /* already hidden */
    }
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }, []);

  // Close on a press anywhere outside (the popover is "manual" so the button's own click can toggle).
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !triggerRef.current?.contains(t)) close(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open, close]);

  useLayoutEffect(() => {
    if (!open) return;
    const menu = menuRef.current;
    const trigger = triggerRef.current;
    if (!menu || !trigger) return;
    try {
      menu.showPopover?.();
    } catch {
      /* unsupported: the menu is simply shown in place */
    }
    // Place it under the button, right-aligned; flip up or clamp when it would leave the window.
    const t = trigger.getBoundingClientRect();
    const w = menu.offsetWidth;
    const h = menu.offsetHeight;
    const left = Math.max(8, Math.min(t.right - w, window.innerWidth - w - 8));
    const below = t.bottom + 4;
    const top = below + h > window.innerHeight - 8 && t.top - 4 - h >= 8 ? t.top - 4 - h : below;
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    const els = menu.querySelectorAll<HTMLElement>('[role="menuitem"]');
    (startAt === "last" ? els[els.length - 1] : els[0])?.focus();
  }, [open, startAt]);

  function onTriggerKey(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setStartAt(e.key === "ArrowUp" ? "last" : "first");
      setOpen(true);
    }
  }

  function onMenuKey(e: KeyboardEvent<HTMLDivElement>) {
    const els = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    const i = els.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => {
      e.preventDefault();
      els[(n + els.length) % els.length]?.focus();
    };
    switch (e.key) {
      case "ArrowDown":
        return go(i + 1);
      case "ArrowUp":
        return go(i - 1);
      case "Home":
        return go(0);
      case "End":
        return go(els.length - 1);
      case "Escape":
        e.preventDefault();
        e.stopPropagation();
        return close(true);
      case "Tab":
        return close(false);
    }
  }

  return (
    <div className={className}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => {
          setStartAt("first");
          setOpen((o) => !o);
        }}
        onKeyDown={onTriggerKey}
        className="inline-flex min-h-(--target-min) min-w-(--target-min) items-center justify-center rounded-md text-fg-muted transition-[transform,background-color,color] duration-(--dur-fast) ease-out active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 hoverable:bg-line hoverable:text-fg pointer-coarse:min-h-11 pointer-coarse:min-w-11"
      >
        <MoreHorizontal size={18} aria-hidden="true" />
      </button>
      {open ? (
        <div
          ref={menuRef}
          role="menu"
          aria-label={label}
          popover={SUPPORTS_POPOVER ? "manual" : undefined}
          onKeyDown={onMenuKey}
          className="m-0 inset-auto min-w-44 origin-top-right rounded-md border border-line bg-panel p-1 text-fg shadow-2 transition-[opacity,transform] duration-(--dur-fast) ease-out starting:scale-[0.97] starting:opacity-0"
          style={{ position: "fixed" }}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                close(true); // focus returns to the button first, so a dialog opened next remembers it
                item.onSelect();
              }}
              className={`flex min-h-9 w-full items-center gap-3 rounded-sm px-3 text-left text-(length:--text-md) pointer-coarse:min-h-11 focus-visible:bg-line focus-visible:outline-none hoverable:bg-line ${item.danger ? "text-alert" : ""}`}
            >
              <item.icon size={16} aria-hidden="true" />
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
