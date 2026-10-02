"use client";

import { useEffect } from "react";
import { captureNativeParams } from "@/lib/native";

/** Records ?source=android&v= and registers the service worker. Renders nothing. */
export function NativeBoot() {
  useEffect(() => {
    captureNativeParams(window.location.search);
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
