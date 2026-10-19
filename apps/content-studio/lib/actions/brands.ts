"use server";

import { asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { brands } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { getPrefs } from "@/lib/actions/prefs";
import { slugify } from "@/lib/slugify";

export async function listBrands() {
  return db.query.brands.findMany({ orderBy: [asc(brands.isCatalog), asc(brands.name)] });
}

export async function getBrandBySlug(slug: string) {
  return db.query.brands.findFirst({ where: eq(brands.slug, slug) });
}

/** Resolves the active brand: explicit ?brand= slug wins, else the user's saved pref, else "general". */
export async function resolveActiveBrand(slugParam: string | undefined, allBrands: (typeof brands.$inferSelect)[]) {
  if (slugParam) {
    const bySlug = allBrands.find((b) => b.slug === slugParam);
    if (bySlug) return bySlug;
  }
  const prefs = await getPrefs();
  if (prefs.activeBrandId) {
    const byPref = allBrands.find((b) => b.id === prefs.activeBrandId);
    if (byPref) return byPref;
  }
  return allBrands.find((b) => b.slug === "general") ?? allBrands[0];
}

export async function createBrand(name: string) {
  const userId = await requireUserId();
  const trimmed = name.trim();
  if (!trimmed) return null;

  const slug = slugify(trimmed);
  const existing = await db.query.brands.findFirst({ where: eq(brands.slug, slug) });
  if (existing) return existing;

  const [brand] = await db
    .insert(brands)
    .values({ slug, name: trimmed, tier: "Custom", isCatalog: false, createdBy: userId })
    .returning();

  revalidatePath("/", "layout");
  return brand;
}

export async function deleteBrand(brandId: string) {
  await requireUserId();
  await db.delete(brands).where(eq(brands.id, brandId));
  revalidatePath("/", "layout");
}
