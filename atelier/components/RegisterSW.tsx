"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/** A new service worker may take over only when no board is open: never swap code under an edit. */
export function shouldActivateNow(pathname: string | null): boolean {
  return !(pathname ?? "").startsWith("/b/");
}

/**
 * Registers /sw.js (production only). An updated worker waits; this component tells it to take
 * over (SKIP_WAITING) as soon as the person is not in a board, immediately or on leaving one. It
 * deliberately does not listen for `controllerchange` and never reloads: the page that is open
 * keeps running until the person navigates on their own.
 */
export function RegisterSW({ enabled = process.env.NODE_ENV === "production" }: { enabled?: boolean }) {
  const pathname = usePathname();
  const waiting = useRef<ServiceWorker | null>(null);
  const pathRef = useRef(pathname);

  const release = () => {
    if (waiting.current && shouldActivateNow(pathRef.current)) {
      waiting.current.postMessage({ type: "SKIP_WAITING" });
      waiting.current = null;
    }
  };

  useEffect(() => {
    pathRef.current = pathname;
    release();
  }, [pathname]);

  useEffect(() => {
    if (!enabled || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    let cancelled = false;
    let registration: ServiceWorkerRegistration | undefined;

    const onForeground = () => {
      if (document.visibilityState !== "hidden") void registration?.update().catch(() => {});
    };

    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((reg) => {
        if (cancelled) return;
        registration = reg;
        // Only a replacement for a worker that already controls this page needs to be held back.
        const hold = (worker: ServiceWorker | null) => {
          if (worker && navigator.serviceWorker.controller) {
            waiting.current = worker;
            release();
          }
        };
        hold(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const incoming = reg.installing;
          incoming?.addEventListener("statechange", () => {
            if (incoming.state === "installed") hold(incoming);
          });
        });
      })
      .catch(() => {
        // No service worker (private window, blocked): the app still works online.
      });

    document.addEventListener("visibilitychange", onForeground);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onForeground);
    };
  }, [enabled]);

  return null;
}
