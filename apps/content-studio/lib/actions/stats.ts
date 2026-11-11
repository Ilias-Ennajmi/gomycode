"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { calendarCards } from "@/db/schema";

/** Feed/Story content count per brand, across the whole calendar (all brands) — a cross-brand overview. */
export async function getBrandBreakdown() {
  const rows = await db.query.calendarCards.findMany({ with: { brand: true } });
  const counts = new Map<string, { label: string; feed: number; story: number }>();
  for (const c of rows) {
    const label = c.brand?.name ?? "Général";
    const entry = counts.get(label) ?? { label, feed: 0, story: 0 };
    if (c.kind === "Feed") entry.feed++;
    else entry.story++;
    counts.set(label, entry);
  }
  return [...counts.values()].map((e) => ({ ...e, count: e.feed + e.story })).sort((a, b) => b.count - a.count);
}

const STATUS_ORDER = ["Idée", "En préparation", "Prêt", "Publié"] as const;
const CATEGORY_ORDER = ["Campaigns Content", "Brands Collections Content", "Planet Sport Content", "Educational Content"] as const;
const CATEGORY_LABELS: Record<string, string> = {
  "Campaigns Content": "Campaigns",
  "Brands Collections Content": "Brands",
  "Planet Sport Content": "Planet Sport",
  "Educational Content": "Educational",
};
const RESPONSABLE_ORDER = ["Ilias", "Agence", "Équipe Boutique", "À assigner"] as const;

/** Status/category/responsable breakdown for one brand's whole calendar (no date limit, matches legacy). */
export async function getContentStats(brandId: string) {
  const rows = await db.query.calendarCards.findMany({ where: eq(calendarCards.brandId, brandId) });

  const statusCounts = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0])) as Record<string, number>;
  const categoryCounts = Object.fromEntries(CATEGORY_ORDER.map((c) => [c, 0])) as Record<string, number>;
  const respCounts = Object.fromEntries(RESPONSABLE_ORDER.map((r) => [r, 0])) as Record<string, number>;

  for (const c of rows) {
    if (c.status in statusCounts) statusCounts[c.status]++;
    if (c.category in categoryCounts) categoryCounts[c.category]++;
    const r = c.responsable || "À assigner";
    respCounts[r] = (respCounts[r] ?? 0) + 1;
  }

  return {
    total: rows.length,
    status: STATUS_ORDER.map((s) => ({ label: s, count: statusCounts[s] })),
    category: CATEGORY_ORDER.map((c) => ({ label: CATEGORY_LABELS[c], count: categoryCounts[c] })),
    responsable: RESPONSABLE_ORDER.map((r) => ({ label: r, count: respCounts[r] })),
  };
}
