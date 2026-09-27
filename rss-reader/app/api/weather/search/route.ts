import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface GeoResult {
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string;
}

// GET ?q=Rabat → places to pick for the weather.
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ results: [] });
  try {
    const params = new URLSearchParams({
      name: q.slice(0, 80),
      count: "6",
      language: "fr",
      format: "json",
    });
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`, {
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(6000),
    });
    const body = (await res.json()) as { results?: GeoResult[] };
    return NextResponse.json({
      results: (body.results ?? []).map((r) => ({
        name: r.name,
        detail: [r.admin1, r.country].filter(Boolean).join(", "),
        lat: r.latitude,
        lon: r.longitude,
      })),
    });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
