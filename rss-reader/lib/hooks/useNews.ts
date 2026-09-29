"use client";

import * as React from "react";
import useSWR, { useSWRConfig } from "swr";
import type { NewsSection, NewsStory } from "@/lib/news/front-page";
import type { DeskId } from "@/lib/news/desks";
import type { NewsPrefs, WeatherLocation } from "@/lib/news/prefs";

export type { NewsSection, NewsStory };

export interface FrontPageData {
  hasSources: boolean;
  hero: NewsStory[];
  developing: NewsStory[];
  moroccoAbroad: NewsStory[];
  sections: NewsSection[];
  hidden: DeskId[];
  updatedAt: string;
}

export function useFrontPage() {
  const { data, error, isLoading, mutate } = useSWR<FrontPageData>("/api/news", {
    refreshInterval: 10 * 60 * 1000,
  });
  return { page: data, error, isLoading, mutate };
}

export function useInsights(enabled: boolean) {
  const { data, isLoading } = useSWR<{
    bullets: string[];
    generatedAt?: string;
    disabled?: boolean;
  }>(enabled ? "/api/news/insights" : null, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });
  return { insights: data, isLoading };
}

export interface Weather {
  name: string | null;
  source: "browser" | "saved" | "ip";
  temperature: number;
  feelsLike: number;
  code: number;
  isDay: boolean;
  wind: number;
  high: number;
  low: number;
  hours: { time: string; temperature: number; code: number }[];
}

const DEVICE_LOCATION_KEY = "weather-device-location";

function readDeviceLocation(): WeatherLocation | null {
  try {
    return JSON.parse(localStorage.getItem(DEVICE_LOCATION_KEY) ?? "null");
  } catch {
    return null;
  }
}

/** Weather for this device's location if shared, else the saved city or IP location. */
export function useWeather() {
  const [device, setDevice] = React.useState<WeatherLocation | null>(null);
  React.useEffect(() => setDevice(readDeviceLocation()), []);

  const key = device
    ? `/api/weather?lat=${device.lat.toFixed(3)}&lon=${device.lon.toFixed(3)}&name=${encodeURIComponent(device.name)}`
    : "/api/weather";
  const { data, isLoading, mutate } = useSWR<
    Weather & { needsLocation?: boolean; unavailable?: boolean }
  >(key, { refreshInterval: 30 * 60 * 1000, revalidateOnFocus: false });

  const locateDevice = React.useCallback(
    () =>
      new Promise<void>((resolve, reject) => {
        if (!navigator.geolocation) return reject(new Error("Location isn't available here"));
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const location = {
              name: "My location",
              lat: position.coords.latitude,
              lon: position.coords.longitude,
            };
            try {
              localStorage.setItem(DEVICE_LOCATION_KEY, JSON.stringify(location));
            } catch {
              // Private mode: it lasts until reload.
            }
            setDevice(location);
            resolve();
          },
          () => reject(new Error("Location permission was denied")),
          { timeout: 10000, maximumAge: 30 * 60 * 1000 }
        );
      }),
    []
  );

  const forgetDevice = React.useCallback(() => {
    try {
      localStorage.removeItem(DEVICE_LOCATION_KEY);
    } catch {
      // Nothing stored.
    }
    setDevice(null);
  }, []);

  return {
    weather: data && !data.needsLocation && !data.unavailable ? data : null,
    needsLocation: Boolean(data?.needsLocation),
    isLoading,
    usingDevice: Boolean(device),
    locateDevice,
    forgetDevice,
    mutate,
  };
}

export async function searchPlaces(query: string) {
  const res = await fetch(`/api/weather/search?q=${encodeURIComponent(query)}`);
  const body = (await res.json().catch(() => ({}))) as {
    results?: { name: string; detail: string; lat: number; lon: number }[];
  };
  return body.results ?? [];
}

/** Saves News settings and refreshes the front page and weather. */
export function useSaveNewsPrefs() {
  const { mutate } = useSWRConfig();
  return React.useCallback(
    async (update: Partial<NewsPrefs>) => {
      const res = await fetch("/api/news/prefs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
      });
      if (!res.ok) throw new Error("Could not save");
      await mutate(
        (key) =>
          typeof key === "string" && (key.startsWith("/api/news") || key.startsWith("/api/weather"))
      );
    },
    [mutate]
  );
}
