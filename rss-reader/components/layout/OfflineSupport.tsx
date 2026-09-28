"use client";

import * as React from "react";
import { WifiOff } from "lucide-react";

/** Asks the service worker to save everything in Later for reading offline. */
export function cacheLaterForOffline() {
  navigator.serviceWorker?.controller?.postMessage({ type: "cache-later" });
}

/**
 * Registers the service worker (public/sw.js) and shows a bar while offline. Only in
 * production builds: in development it would serve stale code.
 */
export function OfflineSupport() {
  const [online, setOnline] = React.useState(true);

  React.useEffect(() => {
    setOnline(navigator.onLine);
    const goOnline = () => {
      setOnline(true);
      cacheLaterForOffline();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

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
    };
  }, []);

  if (online) return null;
  return (
    <div className="flex shrink-0 items-center justify-center gap-2 bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground">
      <WifiOff className="h-3.5 w-3.5" />
      Offline: showing saved copies
    </div>
  );
}
