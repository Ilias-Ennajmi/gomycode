"use client";

import { getBrowserClient } from "@/lib/supabase/client";
import { distanceM, type LatLng, type PlacePin } from "@/lib/places";

/*
 * "Next time I'm nearby" without background geofencing (a TWA can't): when the
 * app opens, and only if location permission was already granted, compare the
 * phone's position with the places of saves that have a place reminder.
 */

export const NEARBY_RADIUS_M = 500;

export type PlaceReminder = { id: string; saveId: string };
export type NearbyHit = { reminderId: string | null; saveId: string; place: PlacePin; distance: number };

/** The closest place within `radius` metres, per reminder; nearest first. */
export function matchNearby(
  reminders: PlaceReminder[],
  places: PlacePin[],
  here: LatLng,
  radius = NEARBY_RADIUS_M,
): NearbyHit[] {
  const bySave = new Map<string, PlacePin[]>();
  for (const p of places) bySave.set(p.saveId, [...(bySave.get(p.saveId) ?? []), p]);
  const hits: NearbyHit[] = [];
  for (const r of reminders) {
    let best: NearbyHit | null = null;
    for (const p of bySave.get(r.saveId) ?? []) {
      const d = distanceM(here, p);
      if (d <= radius && (!best || d < best.distance)) best = { reminderId: r.id, saveId: r.saveId, place: p, distance: d };
    }
    if (best) hits.push(best);
  }
  return hits.sort((a, b) => a.distance - b.distance);
}

/** The nearest place of any save within `radius` (for Today's "Place nearby" card). */
export function nearestPlace(places: PlacePin[], here: LatLng, radius: number): NearbyHit | null {
  let best: NearbyHit | null = null;
  for (const p of places) {
    const d = distanceM(here, p);
    if (d <= radius && (!best || d < best.distance)) best = { reminderId: null, saveId: p.saveId, place: p, distance: d };
  }
  return best;
}

export async function fetchPlaceReminders(): Promise<PlaceReminder[]> {
  const supabase = getBrowserClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from("reminders").select("id,save_id").eq("kind", "place").eq("fired", false).limit(200);
  if (error) throw error;
  return (data ?? []).map((r) => ({ id: r.id, saveId: r.save_id }));
}

export async function fetchPlacesFor(saveIds: string[]): Promise<PlacePin[]> {
  const supabase = getBrowserClient();
  if (!supabase || saveIds.length === 0) return [];
  const { data, error } = await supabase
    .from("places")
    .select("id,save_id,name,lat,lng,address")
    .in("save_id", saveIds)
    .not("lat", "is", null)
    .not("lng", "is", null);
  if (error) throw error;
  return (data ?? []).map((p) => ({ id: p.id, saveId: p.save_id, name: p.name, lat: p.lat as number, lng: p.lng as number, address: p.address }));
}

export async function markReminderFired(id: string): Promise<void> {
  const supabase = getBrowserClient();
  if (!supabase) return;
  await supabase.from("reminders").update({ fired: true }).eq("id", id);
}
