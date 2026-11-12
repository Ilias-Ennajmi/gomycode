"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ToastAction = { label: string; run: () => void };
export type ToastMessage = { id: number; text: string; action?: ToastAction };

const SHOW_MS = 8000;

/** One toast at a time, announced politely, gone after eight seconds (a new one replaces it). */
export function useToast() {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const counter = useRef(0);

  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setToast(null);
  }, []);

  const show = useCallback(
    (text: string, action?: ToastAction) => {
      if (timer.current) clearTimeout(timer.current);
      setToast({ id: ++counter.current, text, action });
      timer.current = setTimeout(dismiss, SHOW_MS);
    },
    [dismiss],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return { toast, show, dismiss };
}

/** The live region always exists, so screen readers announce what appears inside it. */
export function ToastHost({ toast, onDismiss }: { toast: ToastMessage | null; onDismiss: () => void }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-(--z-toast) flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      {toast ? (
        <div
          key={toast.id}
          className="pointer-events-auto flex min-h-11 max-w-md items-center gap-4 rounded-md bg-fg px-4 py-2 text-(length:--text-sm) text-canvas shadow-3 transition-[opacity,transform] duration-(--dur-base) ease-out starting:translate-y-2 starting:opacity-0"
        >
          <span className="min-w-0 break-words">{toast.text}</span>
          {toast.action ? (
            <button
              type="button"
              className="-my-1 min-h-8 shrink-0 rounded-sm px-2 font-semibold underline underline-offset-2 active:scale-[0.97]"
              onClick={() => {
                toast.action!.run();
                onDismiss();
              }}
            >
              {toast.action.label}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
