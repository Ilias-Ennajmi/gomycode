import { NextRequest, NextResponse } from "next/server";
import { isDesk } from "@/lib/news/desks";
import { readNewsPrefs, writeNewsPrefs, type WeatherLocation } from "@/lib/news/prefs";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await readNewsPrefs());
}

// PUT { hidden?: string[], weather?: {name, lat, lon} | null }
export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json()) as { hidden?: unknown; weather?: unknown };
    const update: Parameters<typeof writeNewsPrefs>[0] = {};
    if (Array.isArray(body.hidden)) update.hidden = body.hidden.filter(isDesk);
    if (body.weather === null) update.weather = null;
    else if (body.weather && typeof body.weather === "object") {
      const w = body.weather as Partial<WeatherLocation>;
      const lat = Number(w.lat);
      const lon = Number(w.lon);
      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lon) ||
        Math.abs(lat) > 90 ||
        Math.abs(lon) > 180
      ) {
        return NextResponse.json({ error: "Invalid location" }, { status: 400 });
      }
      update.weather = { name: String(w.name || "My location").slice(0, 80), lat, lon };
    }
    return NextResponse.json(await writeNewsPrefs(update));
  } catch (error) {
    console.error("PUT /api/news/prefs failed", error);
    return NextResponse.json({ error: "Could not save" }, { status: 500 });
  }
}
