"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { captureNativeParams } from "@/lib/native";
import { flush } from "@/lib/outbox";
import { syncDeviceTimeZone } from "@/lib/loop";
import { ensureSession, onIdentityCreated, onIdentityReplaced } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/Toast";

/**
 * Records ?source=android&v=, registers the service worker, gives this device its
 * anonymous identity (once, when JavaScript runs: never for crawlers or link
 * previews), sends saves made offline and keeps the stored time zone on the
 * phone's zone (once per session). Renders nothing.
 */
export function NativeBoot() {
  const router = useRouter();
  const { toast } = useToast();
  useEffect(() => {
    captureNativeParams(window.location.search);
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    // Server-rendered parts (API routes, cookies) see the new identity after a refresh.
    const off = onIdentityCreated(() => router.refresh());
    // Non-blocking: the app keeps working on the new identity.
    const offReplaced = onIdentityReplaced(() =>
      toast({
        message: "This device's sign-in was lost, so Stash started fresh. Earlier saves stay with the old device id.",
        duration: 10_000,
      }),
    );
    void ensureSession().then((session) => {
      void flush();
      if (session) void syncDeviceTimeZone().catch(() => {});
    });
    const online = () => void ensureSession().then(() => flush());
    window.addEventListener("online", online);
    return () => {
      off();
      offReplaced();
      window.removeEventListener("online", online);
    };
  }, [router, toast]);
  return null;
}
