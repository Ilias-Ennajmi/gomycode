import { NextRequest, NextResponse } from "next/server";
import { readNewsPrefs } from "@/lib/news/prefs";

export const dynamic = "force-dynamic";

// Weather for the News tab from Open-Meteo (free, no key). The place is, in
// order: coordinates from the browser, a city saved in News settings, or the
// visitor's approximate location from Vercel's IP geolocation headers.

interface OpenMeteo {
  timezone: string;
  current: {
    time: string;
    temperature_2m: number;
    apparent_temperature: number;
    weather_code: number;
    is_day: number;
    wind_speed_10m: number;
  };
  hourly: { time: string[]; temperature_2m: number[]; weather_code: number[] };
  daily: {
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    weather_code: number[];
  };
}

function coordinate(value: string | null, limit: number) {
  const n = value === null ? NaN : Number(value);
  return Number.isFinite(n) && Math.abs(n) <= limit ? n : null;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  let lat = coordinate(params.get("lat"), 90);
  let lon = coordinate(params.get("lon"), 180);
  let name = params.get("name");
  let source: "browser" | "saved" | "ip" = "browser";

  if (lat === null || lon === null) {
    const saved = (await readNewsPrefs()).weather;
    if (saved) {
      ({ lat, lon, name } = saved);
      source = "saved";
    } else {
      lat = coordinate(request.headers.get("x-vercel-ip-latitude"), 90);
      lon = coordinate(request.headers.get("x-vercel-ip-longitude"), 180);
      const city = request.headers.get("x-vercel-ip-city");
      name = city ? decodeURIComponent(city) : null;
      source = "ip";
    }
  }
  if (lat === null || lon === null) return NextResponse.json({ needsLocation: true });

  const query = new URLSearchParams({
    // Two decimals (~1 km) is plenty and lets nearby requests share the cache.
    latitude: lat.toFixed(2),
    longitude: lon.toFixed(2),
    current: "temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m",
    hourly: "temperature_2m,weather_code",
    daily: "temperature_2m_max,temperature_2m_min,weather_code",
    timezone: "auto",
    forecast_days: "2",
  });
  try {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${query}`, {
      next: { revalidate: 1800 },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
    const data = (await res.json()) as OpenMeteo;
    const now = data.current.time.slice(0, 13);
    const start = Math.max(
      0,
      data.hourly.time.findIndex((t) => t.slice(0, 13) >= now)
    );
    const hours = data.hourly.time.slice(start + 1, start + 13).map((time, i) => ({
      time,
      temperature: Math.round(data.hourly.temperature_2m[start + 1 + i]),
      code: data.hourly.weather_code[start + 1 + i],
    }));
    return NextResponse.json({
      name: name || null,
      source,
      timezone: data.timezone,
      temperature: Math.round(data.current.temperature_2m),
      feelsLike: Math.round(data.current.apparent_temperature),
      code: data.current.weather_code,
      isDay: data.current.is_day === 1,
      wind: Math.round(data.current.wind_speed_10m),
      high: Math.round(data.daily.temperature_2m_max[0]),
      low: Math.round(data.daily.temperature_2m_min[0]),
      hours,
    });
  } catch (error) {
    console.warn("Weather unavailable", error instanceof Error ? error.message : error);
    return NextResponse.json({ unavailable: true });
  }
}
