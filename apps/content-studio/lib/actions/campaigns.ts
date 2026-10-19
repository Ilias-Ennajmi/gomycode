"use server";

import { and, count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { calendarCards, campaignItems, campaigns } from "@/db/schema";
import { requireUserId } from "@/lib/auth";

export async function listCampaigns() {
  const rows = await db.query.campaigns.findMany({
    with: { items: true },
    orderBy: (c, { asc }) => [asc(c.createdAt)],
  });

  const stats = await Promise.all(
    rows.map(async (camp) => {
      if (!camp.start || !camp.end) return { id: camp.id, total: 0, published: 0 };
      const [total] = await db.select({ n: count() }).from(calendarCards).where(eq(calendarCards.campaignId, camp.id));
      const [published] = await db
        .select({ n: count() })
        .from(calendarCards)
        .where(and(eq(calendarCards.campaignId, camp.id), eq(calendarCards.status, "Publié")));
      return { id: camp.id, total: total.n, published: published.n };
    }),
  );
  const statsById = Object.fromEntries(stats.map((s) => [s.id, s]));

  return rows.map((camp) => ({ ...camp, calendarStats: statsById[camp.id] }));
}

export async function createCampaign(input: { name: string; period: string; start: string | null; end: string | null }) {
  const userId = await requireUserId();
  const name = input.name.trim();
  if (!name) return;
  await db.insert(campaigns).values({
    name,
    period: input.period || "",
    start: input.start || null,
    end: input.end || null,
    createdBy: userId,
  });
  revalidatePath("/campaigns");
}

export async function updateCampaign(
  id: string,
  input: { name: string; period: string; start: string | null; end: string | null },
) {
  await requireUserId();
  await db
    .update(campaigns)
    .set({ name: input.name, period: input.period, start: input.start, end: input.end })
    .where(eq(campaigns.id, id));
  revalidatePath("/campaigns");
}

export async function deleteCampaign(id: string) {
  await requireUserId();
  await db.delete(campaigns).where(eq(campaigns.id, id));
  revalidatePath("/campaigns");
}

export async function createCampaignItem(campaignId: string, input: { title: string; date: string | null }) {
  await requireUserId();
  const title = input.title.trim();
  if (!title) return;
  await db.insert(campaignItems).values({ campaignId, title, status: "Idée", date: input.date || null });
  revalidatePath("/campaigns");
}

export async function updateCampaignItemStatus(id: string, status: "Idée" | "En préparation" | "Prêt" | "Publié") {
  await requireUserId();
  await db.update(campaignItems).set({ status }).where(eq(campaignItems.id, id));
  revalidatePath("/campaigns");
}

export async function deleteCampaignItem(id: string) {
  await requireUserId();
  await db.delete(campaignItems).where(eq(campaignItems.id, id));
  revalidatePath("/campaigns");
}
