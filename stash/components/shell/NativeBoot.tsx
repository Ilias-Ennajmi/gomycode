"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { captureNativeParams } from "@/lib/native";
import { flush } from "@/lib/outbox";
import { ensureSession, onIdentityCreated } from "@/lib/supabase/client";

/**
 * Records ?source=android&v=, registers the service worker, gives this device its
 * anonymous identity (once, when JavaScript runs: never for crawlers or link
 * previews) and sends saves made offline. Renders nothing.
 */
export function NativeBoot() {
  const router = useRouter();
  useEffect(() => {
    captureNativeParams(window.location.search);
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    // Server-rendered parts (API routes, cookies) see the new identity after a refresh.
    const off = onIdentityCreated(() => router.refresh());
    void ensureSession().then(() => flush());
    const online = () => void ensureSession().then(() => flush());
    window.addEventListener("online", online);
    return () => {
      off();
      window.removeEventListener("online", online);
    };
  }, [router]);
  return null;
}
