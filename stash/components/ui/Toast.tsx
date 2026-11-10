"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, m } from "framer-motion";
import { useMotionOK } from "@/lib/hooks/useMotionOK";
import { cx } from "./cx";
import { spring } from "@/lib/motionTokens";

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
            <m.div
              key={current.id}
              initial={motionOK ? { opacity: 0, y: 24, scale: 0.96 } : false}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={motionOK ? { opacity: 0, y: 16, scale: 0.98, transition: { duration: 0.14 } } : { opacity: 0, transition: { duration: 0 } }}
              transition={spring("pop", motionOK)}
              className={cx(
                "pointer-events-auto flex min-h-14 w-full max-w-md items-center gap-3 rounded-full",
                "bg-fg py-1 pl-5 pr-1 text-background shadow-raised",
              )}
            >
              <span className="min-w-0 flex-1 py-2 text-label">{current.message}</span>
              {current.actionLabel && (
                <button
                  type="button"
                  className="press h-12 shrink-0 rounded-full bg-accent px-5 text-label text-on-accent"
                  onClick={() => {
                    current.onAction?.();
                    dismiss(current.id);
                  }}
                >
                  {current.actionLabel}
                </button>
              )}
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
