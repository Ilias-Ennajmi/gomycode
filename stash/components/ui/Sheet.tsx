"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { AnimatePresence, motion, useDragControls, type PanInfo } from "framer-motion";
import { useBackToClose } from "@/lib/hooks/useBackToClose";
import { useMotionOK } from "@/lib/hooks/useMotionOK";
import { cx } from "./cx";

export type SheetProps = {
  open: boolean;
  onClose: () => void;
  /** Accessible name of the dialog. */
  label: string;
  /** Optional visible heading. */
  title?: string;
  children: ReactNode;
  className?: string;
};

const SPRING = { type: "spring", stiffness: 380, damping: 36, mass: 0.9 } as const;
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])';

/**
 * Bottom sheet: spring in, drag the handle down to dismiss, tap the scrim,
 * press Escape or use Android back (useBackToClose) to close.
 */
export function Sheet({ open, onClose, label, title, children, className }: SheetProps) {
  const motionOK = useMotionOK();
  const panelRef = useRef<HTMLDivElement>(null);
  const drag = useDragControls();
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useBackToClose(open, onClose, "sheet");

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      // Keep focus inside the sheet.
      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 600) onClose();
  };

  const fade = motionOK ? { duration: 0.25 } : { duration: 0 };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          <motion.div
            aria-hidden
            className="absolute inset-0 bg-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={fade}
            onClick={onClose}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={label}
            tabIndex={-1}
            className={cx(
              "absolute inset-x-0 bottom-0 mx-auto flex max-h-[88dvh] w-full max-w-lg flex-col",
              "rounded-t-sheet bg-surface pb-safe text-fg shadow-sheet outline-none",
              className,
            )}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={motionOK ? SPRING : { duration: 0 }}
            drag="y"
            dragControls={drag}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.7 }}
            onDragEnd={onDragEnd}
          >
            <div
              aria-hidden
              className="flex h-8 shrink-0 cursor-grab touch-none items-center justify-center"
              onPointerDown={(e) => drag.start(e)}
            >
              <span className="h-1 w-10 rounded-full bg-line" />
            </div>
            {title && (
              <h2
                className="shrink-0 touch-none px-5 pb-2 text-heading"
                onPointerDown={(e) => drag.start(e)}
              >
                {title}
              </h2>
            )}
            <div className="scroll-area min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
            <button type="button" className="sr-only focus:not-sr-only" onClick={onClose}>
              Close
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
