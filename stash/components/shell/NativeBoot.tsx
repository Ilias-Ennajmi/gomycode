"use client";

import { useEffect } from "react";
import { captureNativeParams } from "@/lib/native";
import { flush } from "@/lib/outbox";

/** Records ?source=android&v=, registers the service worker and sends saves made offline. Renders nothing. */
export function NativeBoot() {
  useEffect(() => {
    captureNativeParams(window.location.search);
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    void flush();
    const online = () => void flush();
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, []);
  return null;
}
