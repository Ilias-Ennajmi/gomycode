import { prisma } from "@/lib/prisma";
import { isDesk, type DeskId } from "@/lib/news/desks";

const KEY = "news-prefs";

export interface WeatherLocation {
  name: string;
  lat: number;
  lon: number;
}

export interface NewsPrefs {
  /** Sections hidden from the News tab. */
  hidden: DeskId[];
  /** A place picked by hand; otherwise the weather follows the visitor's location. */
  weather?: WeatherLocation | null;
}

export async function readNewsPrefs(): Promise<NewsPrefs> {
  const row = await prisma.setting.findUnique({ where: { key: KEY } });
  try {
    const value = row ? (JSON.parse(row.value) as Partial<NewsPrefs>) : {};
    return {
      hidden: (value.hidden ?? []).filter(isDesk),
      weather: value.weather ?? null,
    };
  } catch {
    return { hidden: [] };
  }
}

export async function writeNewsPrefs(update: Partial<NewsPrefs>) {
  const next = { ...(await readNewsPrefs()), ...update };
  const value = JSON.stringify(next);
  await prisma.setting.upsert({
    where: { key: KEY },
    create: { key: KEY, value },
    update: { value },
  });
  return next;
}
