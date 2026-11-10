"use client";

import { useEffect, useState } from "react";
import { LocateFixed, MapPin } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { currentPosition, geoPermission, type GeoPermission } from "@/lib/places";

/**
 * Settings → Nearby. The app never asks for location on its own; this button
 * is the one place it asks, so "Next time I'm nearby" reminders can be checked
 * whenever Stash opens.
 */
export function NearbySettings() {
  const [state, setState] = useState<GeoPermission | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void geoPermission().then(setState);
  }, []);

  const enable = async () => {
    setBusy(true);
    try {
      await currentPosition({ maximumAge: 0 });
      setState("granted");
    } catch {
      setState(await geoPermission());
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="nearby-title" className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
      <div className="flex items-center gap-3">
        <MapPin size={24} strokeWidth={2} aria-hidden className="text-fg-muted" />
        <h2 id="nearby-title" className="text-heading">
          Nearby
        </h2>
      </div>
      <p className="text-body text-fg-muted">
        When Stash opens, it checks whether you&apos;re within 500 m of a place you asked to be reminded about. Your
        location stays on your phone.
      </p>
      {state === "granted" ? (
        <p className="text-label text-fg">On</p>
      ) : state === "denied" ? (
        <p className="text-body text-fg">
          Location is blocked for Stash. Turn it on in Chrome: site settings for this app, then Location.
        </p>
      ) : state === "unsupported" ? (
        <p className="text-body text-fg-muted">This browser can&apos;t share a location.</p>
      ) : (
        <Button icon={LocateFixed} variant="secondary" loading={busy} onClick={() => void enable()} className="self-start">
          Enable Nearby
        </Button>
      )}
    </section>
  );
}
