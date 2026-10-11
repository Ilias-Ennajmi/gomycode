"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { assets } from "@/db/schema";
import { requireUserId } from "@/lib/auth";

export async function listAssets() {
  return db.query.assets.findMany({ with: { brand: true } });
}

export async function createAsset(input: { title: string; url: string; brandId: string | null }) {
  const userId = await requireUserId();
  const title = input.title.trim();
  const url = input.url.trim();
  if (!title || !url) return;

  await db.insert(assets).values({
    title,
    url,
    brandId: input.brandId,
    createdBy: userId,
  });
  revalidatePath("/library");
}

export async function deleteAsset(id: string) {
  await requireUserId();
  await db.delete(assets).where(eq(assets.id, id));
  revalidatePath("/library");
}
