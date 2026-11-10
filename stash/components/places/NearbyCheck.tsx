"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { haptic } from "@/lib/haptics";
import { currentPosition, geoPermission } from "@/lib/places";
import { fetchPlaceReminders, fetchPlacesFor, markReminderFired, matchNearby } from "@/lib/nearby";

const KEY = "stash.nearby.lastCheck";
const MIN_GAP_MS = 10 * 60_000; // an "app open", not every tab switch

/**
 * Place reminders ("Next time I'm nearby"): when the app opens, if location
 * permission was already granted (never prompts here; Settings has "Enable
 * Nearby"), check each reminder's place. Within 500 m: a toast with Watch,
 * and the reminder is marked fired. Renders nothing.
 */
export function NearbyCheck() {
  const router = useRouter();
  const { toast } = useToast();
  const running = useRef(false);

  useEffect(() => {
    const check = async () => {
      if (running.current || document.visibilityState !== "visible") return;
      try {
        const last = Number(sessionStorage.getItem(KEY) ?? 0);
        if (Date.now() - last < MIN_GAP_MS) return;
      } catch {
        // storage blocked: check anyway
      }
      running.current = true;
      try {
        if ((await geoPermission()) !== "granted") return;
        const reminders = await fetchPlaceReminders();
        try {
          sessionStorage.setItem(KEY, String(Date.now()));
        } catch {
          // fine
        }
        if (!reminders.length) return;
        const places = await fetchPlacesFor([...new Set(reminders.map((r) => r.saveId))]);
        if (!places.length) return;
        const here = await currentPosition();
        const hit = matchNearby(reminders, places, here)[0];
        if (!hit) return;
        haptic();
        toast({
          message: `You're near ${hit.place.name} — watch the save`,
          actionLabel: "Watch",
          duration: 10_000,
          onAction: () => router.push(`/item/${hit.saveId}`),
        });
        if (hit.reminderId) await markReminderFired(hit.reminderId);
      } catch {
        // offline, no session, position timeout: try again on the next open
      } finally {
        running.current = false;
      }
    };

    void check();
    const onVisible = () => void check();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [router, toast]);

  return null;
}
