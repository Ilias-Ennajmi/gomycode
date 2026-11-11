"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { influencers } from "@/db/schema";
import { requireUserId } from "@/lib/auth";

export async function listInfluencers() {
  return db.query.influencers.findMany({
    with: { campaign: true },
    orderBy: (i, { asc }) => [asc(i.createdAt)],
  });
}

type InfluencerInput = {
  name: string;
  platform: "Instagram" | "TikTok" | "YouTube" | "Twitter/X" | "Autre";
  category: string;
  campaignId: string | null;
  status: "Prospection" | "Contacté" | "Négociation" | "Actif" | "Terminé" | "Refusé";
  contact: string;
  followers: string;
  notes: string;
  followUpDate: string | null;
};

export async function createInfluencer(input: InfluencerInput) {
  const userId = await requireUserId();
  const name = input.name.trim();
  if (!name) return;
  await db.insert(influencers).values({ ...input, name, createdBy: userId });
  revalidatePath("/influence");
}

export async function updateInfluencer(id: string, input: InfluencerInput) {
  await requireUserId();
  await db.update(influencers).set(input).where(eq(influencers.id, id));
  revalidatePath("/influence");
}

export async function deleteInfluencer(id: string) {
  await requireUserId();
  await db.delete(influencers).where(eq(influencers.id, id));
  revalidatePath("/influence");
}
