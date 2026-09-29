"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  Loader2,
  LocateFixed,
  MapPin,
  Moon,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { searchPlaces, useSaveNewsPrefs, useWeather } from "@/lib/hooks/useNews";

/** WMO weather codes (Open-Meteo) → an icon and a short label. */
function describe(code: number, isDay = true): { icon: LucideIcon; label: string } {
  if (code === 0) return { icon: isDay ? Sun : Moon, label: "Clear" };
  if (code <= 2) return { icon: isDay ? CloudSun : CloudMoon, label: "Partly cloudy" };
  if (code === 3) return { icon: Cloud, label: "Cloudy" };
  if (code === 45 || code === 48) return { icon: CloudFog, label: "Fog" };
  if (code >= 51 && code <= 57) return { icon: CloudDrizzle, label: "Drizzle" };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) {
    return { icon: CloudRain, label: code >= 80 ? "Showers" : "Rain" };
  }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86)
    return { icon: CloudSnow, label: "Snow" };
  if (code >= 95) return { icon: CloudLightning, label: "Thunderstorm" };
  return { icon: Cloud, label: "Cloudy" };
}

function hourLabel(time: string) {
  return `${Number(time.slice(11, 13))}h`;
}

export function WeatherWidget({ className }: { className?: string }) {
  const { weather, needsLocation, isLoading, usingDevice, locateDevice, forgetDevice } =
    useWeather();
  const savePrefs = useSaveNewsPrefs();
  const [locating, setLocating] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [places, setPlaces] = React.useState<
    { name: string; detail: string; lat: number; lon: number }[]
  >([]);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (query.trim().length < 2) return setPlaces([]);
    const timer = setTimeout(() => searchPlaces(query.trim()).then(setPlaces), 300);
    return () => clearTimeout(timer);
  }, [query]);

  async function shareLocation() {
    setLocating(true);
    try {
      await locateDevice();
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not get your location");
    } finally {
      setLocating(false);
    }
  }

  async function pickPlace(place: { name: string; lat: number; lon: number }) {
    try {
      // A chosen city wins over this device's location.
      forgetDevice();
      await savePrefs({ weather: { name: place.name, lat: place.lat, lon: place.lon } });
      setQuery("");
      setOpen(false);
    } catch {
      toast.error("Could not save the city");
    }
  }

  if (isLoading && !weather) {
    return <div className={cn("h-9 w-28 animate-pulse rounded-full bg-muted", className)} />;
  }

  const now = weather ? describe(weather.code, weather.isDay) : null;
  const Icon = now?.icon ?? MapPin;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          "inline-flex items-center gap-2 rounded-full border bg-card/60 py-1.5 pl-2.5 pr-3.5 text-sm transition-colors hover:bg-accent",
          className
        )}
        aria-label={
          weather ? `Weather: ${weather.temperature}°, ${now?.label}` : "Set weather location"
        }
      >
        <Icon className="h-5 w-5 text-amber-500" />
        {weather ? (
          <>
            <span className="text-base font-semibold tabular-nums">{weather.temperature}°</span>
            <span className="max-w-[9rem] truncate text-muted-foreground">
              {weather.name ?? "Near you"}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">
            {needsLocation ? "Add your city" : "Weather unavailable"}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        {weather && now && (
          <div className="border-b p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{weather.name ?? "Near you"}</p>
                <p className="text-xs text-muted-foreground">
                  {now.label} · feels {weather.feelsLike}° · wind {weather.wind} km/h
                </p>
              </div>
              <div className="shrink-0 whitespace-nowrap text-right">
                <p className="text-3xl font-semibold tabular-nums leading-none">
                  {weather.temperature}°
                </p>
                <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                  H {weather.high}° · L {weather.low}°
                </p>
              </div>
            </div>
            <ol className="mt-4 grid grid-cols-6 gap-1 text-center">
              {weather.hours
                .filter((_, i) => i % 2 === 1)
                .map((hour) => {
                  const HourIcon = describe(hour.code).icon;
                  return (
                    <li key={hour.time} className="flex flex-col items-center gap-1">
                      <span className="text-[11px] text-muted-foreground">
                        {hourLabel(hour.time)}
                      </span>
                      <HourIcon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs font-medium tabular-nums">{hour.temperature}°</span>
                    </li>
                  );
                })}
            </ol>
          </div>
        )}
        <div className="space-y-2 p-3">
          <button
            type="button"
            onClick={shareLocation}
            disabled={locating}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
          >
            {locating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LocateFixed className="h-4 w-4 text-primary" />
            )}
            {usingDevice ? "Update my exact location" : "Use my exact location"}
          </button>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Or search a city…"
            aria-label="Search a city"
            className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:border-primary"
          />
          {places.length > 0 && (
            <ul className="max-h-48 overflow-y-auto">
              {places.map((place) => (
                <li key={`${place.lat},${place.lon}`}>
                  <button
                    type="button"
                    onClick={() => pickPlace(place)}
                    className="flex w-full flex-col rounded-md px-2 py-1.5 text-left hover:bg-accent"
                  >
                    <span className="text-sm">{place.name}</span>
                    <span className="text-xs text-muted-foreground">{place.detail}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {weather?.source === "ip" && (
            <p className="px-2 text-[11px] text-muted-foreground">
              Based on your approximate location.
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
