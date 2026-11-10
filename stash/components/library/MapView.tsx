"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as LeafletMap, LayerGroup } from "leaflet";
import { LocateFixed, MapPin, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { cx } from "@/components/ui/cx";
import { SPACE_BG, type SpaceColor } from "@/components/ui/space";
import { cardText } from "@/components/library/SaveGrid";
import type { SaveItem, Space } from "@/lib/data";
import { currentPosition, fetchPlaces, formatDistance, sortByDistance, type LatLng, type PlacePin } from "@/lib/places";

/*
 * Map lens: Leaflet with OpenStreetMap tiles (free, no key). Pins carry their
 * Space colour through the same Tailwind token classes as everywhere else, so
 * they follow the theme with no colour values here.
 */

const CASABLANCA: LatLng = { lat: 33.5731, lng: -7.5898 };
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

type Pin = PlacePin & { save: SaveItem; color: SpaceColor; distance?: number };

function pinHtml(color: SpaceColor, selected: boolean): string {
  // Class names are spelled out in full so Tailwind generates them.
  const size = selected ? "h-6 w-6" : "h-4 w-4";
  return `<span class="block ${size} rounded-full border-2 border-surface shadow-raised ${SPACE_BG[color]}"></span>`;
}

const HERE_HTML = '<span class="block h-4 w-4 rounded-full border-2 border-surface bg-fg shadow-raised"></span>';

export default function MapView({
  saves,
  spacesById,
  thumbs,
  onOpen,
}: {
  saves: SaveItem[];
  spacesById: Map<string, Space>;
  thumbs: Record<string, string>;
  onOpen: (s: SaveItem) => void;
}) {
  const { toast } = useToast();
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const layer = useRef<LayerGroup | null>(null);
  const leaflet = useRef<typeof import("leaflet") | null>(null);
  const [ready, setReady] = useState(false);
  const [places, setPlaces] = useState<PlacePin[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [here, setHere] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchPlaces()
      .then((p) => alive && setPlaces(p))
      .catch(() => alive && setPlaces([]));
    return () => {
      alive = false;
    };
  }, []);

  const pins: Pin[] = useMemo(() => {
    const byId = new Map(saves.map((s) => [s.id, s]));
    const out: Pin[] = [];
    for (const p of places ?? []) {
      const save = byId.get(p.saveId);
      if (!save) continue;
      const color = (save.spaceId && spacesById.get(save.spaceId)?.color) || "inbox";
      out.push({ ...p, save, color });
    }
    return here ? sortByDistance(out, here) : out.sort((a, b) => a.name.localeCompare(b.name));
  }, [places, saves, spacesById, here]);

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    void import("leaflet").then((L) => {
      if (cancelled || !box.current || map.current) return;
      leaflet.current = L;
      const m = L.map(box.current, { zoomControl: false, attributionControl: true }).setView([CASABLANCA.lat, CASABLANCA.lng], 12);
      L.tileLayer(TILE_URL, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(m);
      L.control.zoom({ position: "topright" }).addTo(m);
      layer.current = L.layerGroup().addTo(m);
      map.current = m;
      setReady(true);
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      layer.current = null;
    };
  }, []);

  // Draw pins whenever they (or the selection) change.
  const fitted = useRef(false);
  useEffect(() => {
    const L = leaflet.current;
    if (!ready || !L || !map.current || !layer.current) return;
    layer.current.clearLayers();
    for (const p of pins) {
      const isSel = p.id === selected;
      const size = isSel ? 24 : 16;
      L.marker([p.lat, p.lng], {
        icon: L.divIcon({ className: "", html: pinHtml(p.color, isSel), iconSize: [size, size], iconAnchor: [size / 2, size / 2] }),
        keyboard: true,
        title: p.name,
        alt: p.name,
        zIndexOffset: isSel ? 1000 : 0,
      })
        .on("click", () => setSelected(p.id))
        .addTo(layer.current);
    }
    if (here) {
      L.marker([here.lat, here.lng], {
        icon: L.divIcon({ className: "", html: HERE_HTML, iconSize: [16, 16], iconAnchor: [8, 8] }),
        title: "You are here",
        alt: "You are here",
        interactive: false,
      }).addTo(layer.current);
    }
    if (!fitted.current && pins.length) {
      fitted.current = true;
      map.current.fitBounds(L.latLngBounds(pins.map((p) => [p.lat, p.lng] as [number, number])).pad(0.2), { maxZoom: 15 });
    }
  }, [ready, pins, selected, here]);

  const nearby = async () => {
    setLocating(true);
    try {
      const pos = await currentPosition();
      setHere(pos);
      map.current?.setView([pos.lat, pos.lng], 14);
      const nearest = sortByDistance(pins, pos)[0];
      if (nearest) setSelected(nearest.id);
    } catch {
      toast({ message: "Location is off. Allow it for Stash in Chrome's site settings." });
    } finally {
      setLocating(false);
    }
  };

  const current = pins.find((p) => p.id === selected) ?? null;

  return (
    <section aria-label="Map" className="flex flex-col gap-3 px-4">
      <div className="relative isolate h-96 overflow-hidden rounded-lg border border-line bg-raised">
        <div ref={box} className="h-full w-full" />
        {!ready && <Skeleton shape="block" className="absolute inset-0 h-full" />}
        <div className="absolute bottom-3 left-3 z-1000">
          <Button variant="secondary" icon={LocateFixed} loading={locating} onClick={() => void nearby()} className="bg-surface">
            Nearby
          </Button>
        </div>
        {current && (
          <div className="absolute inset-x-3 bottom-3 z-1000 flex gap-3 rounded-card border border-line bg-surface p-2 shadow-raised">
            <button type="button" onClick={() => onOpen(current.save)} className="flex min-w-0 flex-1 gap-3 text-left">
              <span className="relative h-20 w-14 shrink-0 overflow-hidden rounded-sm bg-raised">
                <span aria-hidden className={cx("absolute inset-x-0 top-0 z-10 h-0.75", SPACE_BG[current.color])} />
                {current.save.thumbPath && thumbs[current.save.thumbPath] && (
                  // eslint-disable-next-line @next/next/no-img-element -- signed Storage URL
                  <img src={thumbs[current.save.thumbPath]} alt="" className="h-full w-full object-cover" />
                )}
              </span>
              <span className="flex min-w-0 flex-col gap-1 py-1">
                <span className="truncate text-label text-fg">{current.name}</span>
                <span className="line-clamp-2 text-caption text-fg-muted">{cardText(current.save)}</span>
                {current.distance !== undefined && <span className="text-caption text-fg-muted">{formatDistance(current.distance)} away</span>}
              </span>
            </button>
            <IconButton label="Close" icon={X} onClick={() => setSelected(null)} />
          </div>
        )}
      </div>

      {places === null ? (
        <Skeleton shape="line" />
      ) : pins.length === 0 ? (
        <p className="py-6 text-center text-body text-fg-muted">Saves that name a real place (a café, a shop, a hotel) get a pin here.</p>
      ) : (
        <ul className="flex flex-col gap-1" aria-label={here ? "Places, nearest first" : "Places"}>
          {pins.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  setSelected(p.id);
                  map.current?.setView([p.lat, p.lng], Math.max(map.current.getZoom(), 15));
                }}
                className={cx("flex min-h-12 w-full items-center gap-3 rounded-card px-3 text-left", p.id === selected ? "bg-raised" : "hover:bg-raised")}
              >
                <MapPin size={20} strokeWidth={2} aria-hidden className="shrink-0 text-fg-muted" />
                <span aria-hidden className={cx("h-2 w-2 shrink-0 rounded-full", SPACE_BG[p.color])} />
                <span className="min-w-0 flex-1 truncate text-body text-fg">{p.name}</span>
                {p.distance !== undefined && <span className="shrink-0 text-caption text-fg-muted">{formatDistance(p.distance)}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-caption text-fg-muted">Map data © OpenStreetMap contributors.</p>
    </section>
  );
}
