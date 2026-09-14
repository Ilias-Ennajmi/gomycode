"use server";

import { isNull, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { ideas, productionCards } from "@/db/schema";
import { requireUserId } from "@/lib/auth";

export async function listIdeas() {
  const rows = await db.query.ideas.findMany({
    where: isNull(ideas.sentToProductionCardId),
    orderBy: (i, { asc }) => [asc(i.createdAt)],
  });
  const priorityOrder: Record<string, number> = { Haute: 0, Moyenne: 1, Basse: 2 };
  return rows.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
}

export async function createIdea(input: {
  title: string;
  note: string;
  image: string;
  link: string;
  tagType: "Produit" | "Campagne" | "Autre" | "";
  tagDetail: string;
  priority: "Haute" | "Moyenne" | "Basse";
}) {
  const userId = await requireUserId();
  const title = input.title.trim();
  if (!title) return;
  await db.insert(ideas).values({
    title,
    note: input.note,
    image: input.image || null,
    link: input.link || null,
    tagType: input.tagType || null,
    tagDetail: input.tagDetail,
    priority: input.priority,
    createdBy: userId,
  });
  revalidatePath("/ideation");
}

export async function deleteIdea(id: string) {
  await requireUserId();
  await db.delete(ideas).where(eq(ideas.id, id));
  revalidatePath("/ideation");
}

/** "Envoyer en production" — creates a production card and links the idea to it (kept, not deleted, for traceability). */
export async function sendIdeaToProduction(id: string) {
  const userId = await requireUserId();
  const idea = await db.query.ideas.findFirst({ where: eq(ideas.id, id) });
  if (!idea) return;

  const [card] = await db
    .insert(productionCards)
    .values({
      column: "todo",
      kind: "Feed",
      category: "Planet Sport Content",
      title: idea.title,
      contentType: "Photo",
      fromIdeaId: idea.id,
      createdBy: userId,
    })
    .returning();

  await db.update(ideas).set({ sentToProductionCardId: card.id }).where(eq(ideas.id, id));

  revalidatePath("/ideation");
  revalidatePath("/production");
}
