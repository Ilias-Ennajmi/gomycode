"use server";

import { asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { calendarCards, productionCards } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import type { ContentAxis } from "@/lib/constants/content-axes";

export async function listProductionCards() {
  return db.query.productionCards.findMany({
    with: { brand: true, campaign: true },
    orderBy: [asc(productionCards.createdAt)],
  });
}

export async function createProductionCardFromAxis(axis: ContentAxis) {
  const userId = await requireUserId();
  await db.insert(productionCards).values({
    column: "todo",
    kind: axis.kind,
    category: axis.category,
    title: axis.category,
    contentType: "Photo",
    createdBy: userId,
  });
  revalidatePath("/production");
  revalidatePath("/library");
}

export async function createProductionCard(input: {
  kind: "Feed" | "Story 1" | "Story 2" | "Story 3";
  category: string;
  title: string;
  brandId: string | null;
  format?: string;
  cta?: string;
  contentType: "Photo" | "Vidéo" | "Carousel" | "Reel" | "Texte";
  responsable?: string;
  campaignId?: string | null;
  dueDate?: string | null;
}) {
  const userId = await requireUserId();
  await db.insert(productionCards).values({
    column: "todo",
    kind: input.kind,
    category: input.category,
    title: input.title,
    brandId: input.brandId,
    format: input.format ?? "",
    cta: input.cta ?? "",
    contentType: input.contentType,
    responsable: input.responsable ?? "À assigner",
    campaignId: input.campaignId ?? null,
    dueDate: input.dueDate ?? null,
    createdBy: userId,
  });
  revalidatePath("/production");
}

export async function moveProductionCard(id: string, column: "todo" | "inprogress" | "ready") {
  const userId = await requireUserId();
  await db.update(productionCards).set({ column, updatedBy: userId, updatedAt: new Date() }).where(eq(productionCards.id, id));
  revalidatePath("/production");
}

export async function updateProductionCard(
  id: string,
  input: Partial<{
    title: string;
    brandId: string | null;
    format: string;
    cta: string;
    contentType: "Photo" | "Vidéo" | "Carousel" | "Reel" | "Texte";
    responsable: string;
    campaignId: string | null;
    dueDate: string | null;
  }>,
) {
  const userId = await requireUserId();
  await db.update(productionCards).set({ ...input, updatedBy: userId, updatedAt: new Date() }).where(eq(productionCards.id, id));
  revalidatePath("/production");
}

export async function deleteProductionCard(id: string) {
  await requireUserId();
  await db.delete(productionCards).where(eq(productionCards.id, id));
  revalidatePath("/production");
}

/** "Programmer" — clones a production card onto a brand's calendar and links it back via scheduledCardId. */
export async function scheduleProductionCard(id: string, input: { brandId: string; date: string }) {
  const userId = await requireUserId();
  const card = await db.query.productionCards.findFirst({ where: eq(productionCards.id, id) });
  if (!card) return;

  const [scheduled] = await db
    .insert(calendarCards)
    .values({
      brandId: input.brandId,
      date: input.date,
      kind: card.kind,
      category: card.category,
      contentType: card.contentType,
      title: card.title,
      format: card.format ?? "",
      cta: card.cta ?? "",
      status: "Prêt",
      responsable: card.responsable,
      campaignId: card.campaignId,
      dueDate: card.dueDate,
      fromIdea: !!card.fromIdeaId,
      createdBy: userId,
    })
    .returning();

  await db
    .update(productionCards)
    .set({ scheduledCardId: scheduled.id, updatedBy: userId, updatedAt: new Date() })
    .where(eq(productionCards.id, id));

  revalidatePath("/production");
  revalidatePath("/calendar");
}
