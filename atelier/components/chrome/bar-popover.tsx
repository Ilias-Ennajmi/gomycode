"use client";

import { ChevronDown } from "lucide-react";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { chromeButton } from "./controls";
import { Popover } from "./Popover";
import { Tip } from "./Tip";

/** A context-bar button that opens a popover next to it (above the bar, or below when the bar sits under its selection). */
export function BarPopoverButton({
  label,
  popoverLabel = label,
  face,
  side,
  children,
  role = "dialog",
  chevron = true,
}: {
  /** Accessible name of the button (may include the current value). */
  label: string;
  popoverLabel?: string;
  face: ReactNode;
  side: "top" | "bottom";
  children: ReactNode | ((close: () => void) => ReactNode);
  role?: "dialog" | "menu";
  chevron?: boolean;
}) {
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <Tip label={popoverLabel} side={side}>
        <button
          ref={anchor}
          type="button"
          aria-label={label}
          aria-haspopup={role}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className={`${chromeButton} ${chevron ? "w-auto min-w-9 gap-0.5 px-1.5 pointer-coarse:w-auto pointer-coarse:min-w-11" : ""}`}
        >
          {face}
          {chevron ? <ChevronDown aria-hidden="true" size={12} strokeWidth={2} className="text-fg-muted" /> : null}
        </button>
      </Tip>
      <Popover open={open} onClose={close} anchor={anchor} placement={side} role={role} label={popoverLabel} className={role === "menu" ? "p-1" : "p-3"}>
        {typeof children === "function" ? children(close) : children}
      </Popover>
    </>
  );
}
