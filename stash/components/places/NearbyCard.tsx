"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MapPin } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { cardText } from "@/components/library/SaveGrid";
import { fetchSave, fetchSpaces, type SaveItem } from "@/lib/data";
import { currentPosition, fetchPlaces, formatDistance, geoPermission } from "@/lib/places";
import { nearestPlace, type NearbyHit } from "@/lib/nearby";
import type { SpaceColor } from "@/components/ui/space";

/**
 * "Place nearby" card for Today's For-you row: the closest saved place within
 * `radius` metres. Renders nothing unless location permission is already
 * granted (it never prompts) and a saved place is close.
 */
export function NearbyCard({ radius = 1500, className }: { radius?: number; className?: string }) {
  const [hit, setHit] = useState<{ near: NearbyHit; save: SaveItem; color?: SpaceColor } | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      if ((await geoPermission()) !== "granted") return;
      const places = await fetchPlaces();
      if (!places.length) return;
      const near = nearestPlace(places, await currentPosition(), radius);
      if (!near) return;
      const [save, spaces] = await Promise.all([fetchSave(near.saveId), fetchSpaces()]);
      if (!save || save.archivedAt || !alive) return;
      setHit({ near, save, color: spaces.find((s) => s.id === save.spaceId)?.color });
    })().catch(() => {});
    return () => {
      alive = false;
    };
  }, [radius]);

  if (!hit) return null;
  return (
    <Card spaceColor={hit.color} className={className}>
      <Link href={`/item/${hit.save.id}`} className="flex min-h-12 flex-col gap-2">
        <span className="inline-flex items-center gap-2 text-label text-fg-muted">
          <MapPin size={20} strokeWidth={2} aria-hidden />
          Place nearby · {formatDistance(hit.near.distance)}
        </span>
        <span className="text-heading text-fg">{hit.near.place.name}</span>
        <span className="line-clamp-2 text-body text-fg-muted">{cardText(hit.save)}</span>
      </Link>
    </Card>
  );
}
