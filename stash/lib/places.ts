"use client";

import { getBrowserClient } from "@/lib/supabase/client";

export type LatLng = { lat: number; lng: number };

export type PlacePin = LatLng & {
  id: string;
  saveId: string;
  name: string;
  address: string | null;
};

/** Great-circle distance in metres (haversine). */
export function distanceM(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
}

/** Nearest first; places without a position keep their order at the end. */
export function sortByDistance<T extends LatLng>(items: T[], here: LatLng): (T & { distance: number })[] {
  return items.map((p) => ({ ...p, distance: distanceM(here, p) })).sort((a, b) => a.distance - b.distance);
}

export async function fetchPlaces(): Promise<PlacePin[]> {
  const supabase = getBrowserClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("places")
    .select("id,save_id,name,lat,lng,address")
    .not("lat", "is", null)
    .not("lng", "is", null)
    .limit(1000);
  if (error) throw error;
  return (data ?? [])
    .filter((p) => typeof p.lat === "number" && typeof p.lng === "number")
    .map((p) => ({ id: p.id, saveId: p.save_id, name: p.name, lat: p.lat as number, lng: p.lng as number, address: p.address }));
}

export type GeoPermission = "granted" | "prompt" | "denied" | "unsupported";

/** Asks the Permissions API without prompting. */
export async function geoPermission(): Promise<GeoPermission> {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) return "unsupported";
  try {
    const status = await navigator.permissions?.query({ name: "geolocation" as PermissionName });
    return (status?.state as GeoPermission | undefined) ?? "prompt";
  } catch {
    return "prompt";
  }
}

/** Current position (prompts only when the permission isn't decided yet). */
export function currentPosition(opts: PositionOptions = {}): Promise<LatLng> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("unsupported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (e) => reject(e),
      { enableHighAccuracy: false, maximumAge: 5 * 60_000, timeout: 15_000, ...opts },
    );
  });
}
