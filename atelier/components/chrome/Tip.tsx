"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { formatShortcut } from "@/lib/engine/commands/shortcuts";
import { boxOf, placeFloating, type Placed, type Placement } from "./place";

const FIRST_DELAY_MS = 500;
const GRACE_MS = 600;
const LEAVE_MS = 120;

/** When a tooltip was last hidden: within GRACE_MS the next one shows at once ("instant after the first"). */
let lastHidden = 0;

const hoverCapable = () => typeof matchMedia === "function" && matchMedia("(hover: hover) and (pointer: fine)").matches;

/**
 * A tooltip for the control inside: name and shortcut. It shows on hover (after half a second, at once when another
 * tooltip was just showing) and on keyboard focus, hides on press, Escape and leave, and stays while the pointer is
 * on it (WCAG 1.4.13). It never shows on touch. The tip is a supplement: the control carries its own accessible name.
 */
export function Tip({
  label,
  shortcut,
  side = "top",
  children,
  className = "inline-flex",
}: {
  label: string;
  /** A registry shortcut such as "Mod+D" or a single key. */
  shortcut?: string;
  side?: Placement;
  children: ReactNode;
  className?: string;
}) {
  const wrap = useRef<HTMLSpanElement>(null);
  const tip = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [placed, setPlaced] = useState<Placed | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const show = (delay: number) => {
    clear();
    if (delay <= 0) setOpen(true);
    else timer.current = setTimeout(() => setOpen(true), delay);
  };
  const hide = (delay = 0) => {
    clear();
    const done = () => {
      setOpen((was) => {
        if (was) lastHidden = Date.now();
        return false;
      });
      setPlaced(null);
    };
    if (delay <= 0) done();
    else timer.current = setTimeout(done, delay);
  };
  useEffect(() => clear, []);

  useLayoutEffect(() => {
    if (!open) return;
    const a = wrap.current;
    const t = tip.current;
    if (!a || !t) return;
    setPlaced(placeFloating(boxOf(a.getBoundingClientRect()), { width: t.offsetWidth, height: t.offsetHeight }, { width: window.innerWidth, height: window.innerHeight }, { prefer: side, gap: 6 }));
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };
    document.addEventListener("keydown", esc, true);
    return () => document.removeEventListener("keydown", esc, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, side]);

  return (
    <span
      ref={wrap}
      className={className}
      onPointerEnter={(e) => {
        if (e.pointerType === "touch" || !hoverCapable()) return;
        show(Date.now() - lastHidden < GRACE_MS ? 0 : FIRST_DELAY_MS);
      }}
      onPointerLeave={() => hide(LEAVE_MS)}
      onPointerDown={() => hide()}
      onFocus={(e) => {
        if (e.target instanceof HTMLElement && e.target.matches(":focus-visible")) show(0);
      }}
      onBlur={() => hide()}
    >
      {children}
      {open && typeof document !== "undefined"
        ? createPortal(
            <span
              ref={tip}
              role="tooltip"
              onPointerEnter={clear}
              onPointerLeave={() => hide(LEAVE_MS)}
              style={{ position: "fixed", left: placed?.left ?? 0, top: placed?.top ?? 0, visibility: placed ? "visible" : "hidden" }}
              className="z-(--z-menu) inline-flex max-w-[calc(100vw-1rem)] items-center gap-2 rounded-sm bg-fg px-2 py-1 text-(length:--text-xs) font-medium whitespace-nowrap text-canvas shadow-2"
            >
              {label}
              {shortcut ? <kbd className="rounded-sm border border-canvas/40 px-1 font-sans opacity-80">{formatShortcut(shortcut)}</kbd> : null}
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}
