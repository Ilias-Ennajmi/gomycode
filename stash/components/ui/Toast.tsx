"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useMotionOK } from "@/lib/hooks/useMotionOK";
import { cx } from "./cx";

export type ToastOptions = {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  /** ms before it hides. Default 4000 (the Undo window). */
  duration?: number;
  /** Sit above the bottom nav bar (default). False inside Play and full-screen flows. */
  aboveBar?: boolean;
};

type ToastItem = ToastOptions & { id: number };
type Ctx = { toast: (opts: ToastOptions) => number; dismiss: (id?: number) => void };

const ToastContext = createContext<Ctx | null>(null);

export function useToast(): Ctx {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

/** One toast at a time; a new one replaces the current. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<ToastItem | null>(null);
  const nextId = useRef(1);
  const motionOK = useMotionOK();

  const dismiss = useCallback((id?: number) => {
    setCurrent((c) => (c && (id === undefined || c.id === id) ? null : c));
  }, []);

  const toast = useCallback((opts: ToastOptions) => {
    const id = nextId.current++;
    setCurrent({ ...opts, id });
    return id;
  }, []);

  useEffect(() => {
    if (!current) return;
    const t = setTimeout(() => dismiss(current.id), current.duration ?? 4000);
    return () => clearTimeout(t);
  }, [current, dismiss]);

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);
  const aboveBar = current?.aboveBar ?? true;

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4"
        style={{
          bottom: aboveBar
            ? "calc(var(--bar-height) + env(safe-area-inset-bottom) + var(--space-3))"
            : "calc(env(safe-area-inset-bottom) + var(--space-4))",
        }}
      >
        <AnimatePresence>
          {current && (
            <motion.div
              key={current.id}
              initial={motionOK ? { opacity: 0, y: 16 } : false}
              animate={{ opacity: 1, y: 0 }}
              exit={motionOK ? { opacity: 0, y: 16 } : { opacity: 0, transition: { duration: 0 } }}
              transition={{ duration: 0.25, ease: [0.2, 0, 0, 1] }}
              className={cx(
                "pointer-events-auto flex min-h-14 w-full max-w-md items-center gap-3 rounded-card",
                "border border-line bg-raised py-1 pl-4 pr-1 text-fg shadow-raised",
              )}
            >
              <span className="min-w-0 flex-1 text-body">{current.message}</span>
              {current.actionLabel && (
                <button
                  type="button"
                  className="h-12 shrink-0 rounded-card bg-accent px-4 text-label text-on-accent active:scale-95"
                  onClick={() => {
                    current.onAction?.();
                    dismiss(current.id);
                  }}
                >
                  {current.actionLabel}
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
