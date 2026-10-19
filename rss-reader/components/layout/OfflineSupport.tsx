"use client";

import * as React from "react";
import { toast } from "sonner";
import { useSWRConfig } from "swr";
import { WifiOff } from "lucide-react";
import { flushOutbox, onOutboxChange, outboxSize } from "@/lib/outbox";

/** Asks the service worker to save everything in Later for reading offline. */
export function cacheLaterForOffline() {
  navigator.serviceWorker?.controller?.postMessage({ type: "cache-later" });
}

/** Asks the service worker to keep one article (its text and full page) for offline reading. */
export function cacheArticleForOffline(id: string) {
  navigator.serviceWorker?.controller?.postMessage({ type: "cache-article", id });
}

/**
 * Registers the service worker (public/sw.js) and shows a bar while offline. Only in
 * production builds: in development it would serve stale code. Changes made offline wait
 * in the outbox and are sent when the connection returns.
 */
export function OfflineSupport() {
  const [online, setOnline] = React.useState(true);
  const [pending, setPending] = React.useState(0);
  const { mutate } = useSWRConfig();

  React.useEffect(() => {
    setOnline(navigator.onLine);
    setPending(outboxSize());
    const send = async () => {
      const sent = await flushOutbox();
      setPending(outboxSize());
      if (sent > 0) {
        toast.success(`${sent} change${sent === 1 ? "" : "s"} made offline sent`);
        mutate((key) => typeof key === "string" && key.startsWith("/api/articles"));
      }
    };
    const goOnline = () => {
      setOnline(true);
      cacheLaterForOffline();
      void send();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    const stopWatching = onOutboxChange(() => setPending(outboxSize()));
    if (navigator.onLine) void send();

    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then(() => navigator.serviceWorker.ready)
        .then((registration) => {
          // The first visit isn't controlled yet, so send it to the active worker directly.
          (navigator.serviceWorker.controller ?? registration.active)?.postMessage({
            type: "cache-later",
          });
        })
        .catch(() => {
          // No offline support in this browser; everything else still works.
        });
    }
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      stopWatching();
    };
  }, [mutate]);

  if (online) return null;
  return (
    <div className="flex shrink-0 items-center justify-center gap-2 bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground">
      <WifiOff className="h-3.5 w-3.5" />
      Offline: showing saved copies
      {pending > 0 && (
        <span className="rounded-full bg-primary/15 px-1.5 text-primary">
          {pending} change{pending === 1 ? "" : "s"} waiting
        </span>
      )}
    </div>
  );
}
