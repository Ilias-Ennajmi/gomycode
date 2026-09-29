import { prisma } from "@/lib/prisma";
import { fetchAndParseFeed } from "@/lib/rss";
import { resolveSource } from "@/lib/feed-source";
import { mapWithConcurrency } from "@/lib/ingest";
import { CATALOG } from "@/lib/discover/catalog";

// Catalog URLs can break over time (sites move their feeds, channels rename).
// A few entries are re-checked on each run; one that fails twice in a row is
// hidden until it works again.

const SETTING_KEY = "catalog-health";
const RECHECK_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const HIDE_AFTER_FAILURES = 2;
const CHECK_TIMEOUT_MS = 10_000;

type Health = Record<string, { fails: number; at: number }>;

async function readHealth(): Promise<Health> {
  const row = await prisma.setting.findUnique({ where: { key: SETTING_KEY } });
  try {
    return row ? (JSON.parse(row.value) as Health) : {};
  } catch {
    return {};
  }
}

export async function hiddenCatalogIds() {
  const health = await readHealth();
  return new Set(
    Object.entries(health)
      .filter(([, h]) => h.fails >= HIDE_AFTER_FAILURES)
      .map(([id]) => id)
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number) {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

async function works(url: string) {
  try {
    await withTimeout(
      resolveSource(url).then((source) => fetchAndParseFeed(source.feedUrl)),
      CHECK_TIMEOUT_MS
    );
    return true;
  } catch {
    return false;
  }
}

/** Re-checks the catalog entries that were checked longest ago. */
export async function checkCatalogBatch(limit = 12) {
  const health = await readHealth();
  const now = Date.now();
  const due = CATALOG.filter((entry) => now - (health[entry.id]?.at ?? 0) > RECHECK_AFTER_MS)
    .sort((a, b) => (health[a.id]?.at ?? 0) - (health[b.id]?.at ?? 0))
    .slice(0, limit);
  if (due.length === 0) return { checked: 0, failed: 0 };

  const results = await mapWithConcurrency(due, 6, async (entry) => ({
    id: entry.id,
    ok: await works(entry.url),
  }));

  // Re-read so two overlapping runs don't wipe each other's results.
  const latest = await readHealth();
  for (const { id, ok } of results) {
    latest[id] = { fails: ok ? 0 : (latest[id]?.fails ?? 0) + 1, at: now };
  }
  // Forget entries that were removed from the catalog.
  const ids = new Set(CATALOG.map((e) => e.id));
  for (const id of Object.keys(latest)) if (!ids.has(id)) delete latest[id];

  const value = JSON.stringify(latest);
  await prisma.setting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value },
    update: { value },
  });
  return { checked: results.length, failed: results.filter((r) => !r.ok).length };
}
