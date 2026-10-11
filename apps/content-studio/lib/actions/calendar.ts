"use server";

import { and, eq, gte, isNull, lte, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { calendarCards } from "@/db/schema";
import { requireUserId } from "@/lib/auth";

type Kind = "Feed" | "Story 1" | "Story 2" | "Story 3";
type ContentType = "Photo" | "Vidéo" | "Carousel" | "Reel" | "Texte";
type Status = "Idée" | "En préparation" | "Prêt" | "Publié";

export async function listCalendarCardsInRange(brandId: string, startDate: string, endDate: string) {
  return db.query.calendarCards.findMany({
    where: and(eq(calendarCards.brandId, brandId), gte(calendarCards.date, startDate), lte(calendarCards.date, endDate)),
  });
}

/** Every non-dismissed card for a brand, regardless of date — feeds the "À traiter" attention panel. */
export async function listAttentionCandidates(brandId: string) {
  return db.query.calendarCards.findMany({
    where: and(eq(calendarCards.brandId, brandId), isNull(calendarCards.attentionDismissedAt), ne(calendarCards.status, "Publié")),
  });
}

export async function createCalendarCard(input: {
  brandId: string;
  date: string;
  kind: Kind;
  category: string;
  contentType: ContentType;
  title: string;
  format: string;
  cta: string;
  brandName: string | null;
  image: string;
  link: string;
  recurWeeks: number;
}) {
  const userId = await requireUserId();
  const base = new Date(input.date + "T00:00:00");
  const rows = [];
  for (let i = 0; i <= input.recurWeeks; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() + 7 * i);
    rows.push({
      brandId: input.brandId,
      date: d.toISOString().slice(0, 10),
      kind: input.kind,
      category: input.category,
      contentType: input.contentType,
      title: input.title || "Nouveau contenu",
      format: input.format,
      cta: input.cta,
      status: "Idée" as Status,
      responsable: "À assigner",
      note: "",
      checklist: [false, false, false],
      image: input.image || null,
      link: input.link || null,
      createdBy: userId,
    });
  }
  await db.insert(calendarCards).values(rows);
  revalidatePath("/calendar");
}

export async function updateCalendarCard(
  id: string,
  input: Partial<{
    title: string;
    format: string;
    cta: string;
    status: Status;
    responsable: string;
    note: string;
    image: string | null;
    link: string | null;
    checklist: boolean[];
    date: string;
    campaignId: string | null;
  }>,
) {
  const userId = await requireUserId();
  await db
    .update(calendarCards)
    .set({ ...input, attentionDismissedAt: null, updatedBy: userId, updatedAt: new Date() })
    .where(eq(calendarCards.id, id));
  revalidatePath("/calendar");
}

export async function cycleCalendarCardStatus(id: string) {
  const userId = await requireUserId();
  const card = await db.query.calendarCards.findFirst({ where: eq(calendarCards.id, id) });
  if (!card) return;
  const order: Status[] = ["Idée", "En préparation", "Prêt", "Publié"];
  const next = order[(order.indexOf(card.status) + 1) % order.length];
  await db.update(calendarCards).set({ status: next, attentionDismissedAt: null, updatedBy: userId, updatedAt: new Date() }).where(eq(calendarCards.id, id));
  revalidatePath("/calendar");
}

export async function toggleCalendarCardChecklistItem(id: string, index: number) {
  const userId = await requireUserId();
  const card = await db.query.calendarCards.findFirst({ where: eq(calendarCards.id, id) });
  if (!card) return;
  const checklist = [...((card.checklist as boolean[]) ?? [false, false, false])];
  checklist[index] = !checklist[index];
  await db.update(calendarCards).set({ checklist, updatedBy: userId, updatedAt: new Date() }).where(eq(calendarCards.id, id));
  revalidatePath("/calendar");
}

export async function deleteCalendarCard(id: string) {
  await requireUserId();
  await db.delete(calendarCards).where(eq(calendarCards.id, id));
  revalidatePath("/calendar");
}

export async function duplicateCalendarCard(id: string) {
  const userId = await requireUserId();
  const card = await db.query.calendarCards.findFirst({ where: eq(calendarCards.id, id) });
  if (!card) return;
  await db.insert(calendarCards).values({
    brandId: card.brandId,
    date: card.date,
    kind: card.kind,
    category: card.category,
    contentType: card.contentType,
    title: card.title,
    format: card.format,
    cta: card.cta,
    status: "Idée",
    responsable: card.responsable,
    note: card.note,
    checklist: card.checklist,
    image: card.image,
    link: card.link,
    campaignId: card.campaignId,
    createdBy: userId,
  });
  revalidatePath("/calendar");
}

export async function moveCalendarCard(id: string, newDate: string) {
  const userId = await requireUserId();
  await db.update(calendarCards).set({ date: newDate, updatedBy: userId, updatedAt: new Date() }).where(eq(calendarCards.id, id));
  revalidatePath("/calendar");
}

export async function dismissAttentionItem(id: string) {
  await requireUserId();
  await db.update(calendarCards).set({ attentionDismissedAt: new Date() }).where(eq(calendarCards.id, id));
  revalidatePath("/calendar");
}

export async function dismissAllAttentionItems(ids: string[]) {
  await requireUserId();
  if (!ids.length) return;
  await Promise.all(ids.map((id) => db.update(calendarCards).set({ attentionDismissedAt: new Date() }).where(eq(calendarCards.id, id))));
  revalidatePath("/calendar");
}

export async function bulkUpdateCalendarCards(ids: string[], input: Partial<{ status: Status; responsable: string }>) {
  const userId = await requireUserId();
  if (!ids.length) return;
  await Promise.all(
    ids.map((id) => db.update(calendarCards).set({ ...input, updatedBy: userId, updatedAt: new Date() }).where(eq(calendarCards.id, id))),
  );
  revalidatePath("/calendar");
}

export async function bulkDeleteCalendarCards(ids: string[]) {
  await requireUserId();
  if (!ids.length) return;
  await Promise.all(ids.map((id) => db.delete(calendarCards).where(eq(calendarCards.id, id))));
  revalidatePath("/calendar");
}

const VALID_KINDS: Kind[] = ["Feed", "Story 1", "Story 2", "Story 3"];
const VALID_STATUSES: Status[] = ["Idée", "En préparation", "Prêt", "Publié"];

export async function importCalendarCsv(brandId: string, csvText: string) {
  const userId = await requireUserId();
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim());
  const startIdx = /date/i.test(lines[0] ?? "") ? 1 : 0;
  const errors: string[] = [];
  const rows: (typeof calendarCards.$inferInsert)[] = [];

  for (let i = startIdx; i < lines.length; i++) {
    const lineNum = i + 1;
    const cols = lines[i].split(",").map((c) => c.trim());
    if (cols.length < 3) {
      errors.push(`Ligne ${lineNum} : au moins 3 colonnes attendues (Date, Type, Titre), ${cols.length} trouvée(s).`);
      continue;
    }
    const dateParts = cols[0].split("/");
    if (dateParts.length !== 3) {
      errors.push(`Ligne ${lineNum} : date "${cols[0]}" invalide (format attendu JJ/MM/AAAA).`);
      continue;
    }
    const dateKey = `${dateParts[2]}-${dateParts[1].padStart(2, "0")}-${dateParts[0].padStart(2, "0")}`;
    if (isNaN(new Date(dateKey + "T00:00:00").getTime())) {
      errors.push(`Ligne ${lineNum} : date "${cols[0]}" invalide.`);
      continue;
    }
    const kind = (cols[1] || "Feed") as Kind;
    if (!VALID_KINDS.includes(kind)) {
      errors.push(`Ligne ${lineNum} : type "${kind}" non reconnu (attendu Feed / Story 1 / Story 2 / Story 3).`);
      continue;
    }
    if (!cols[2]) {
      errors.push(`Ligne ${lineNum} : titre manquant.`);
      continue;
    }
    let status = (cols[4] || "Idée") as Status;
    if (!VALID_STATUSES.includes(status)) {
      errors.push(`Ligne ${lineNum} : statut "${status}" non reconnu, "Idée" utilisé à la place.`);
      status = "Idée";
    }
    rows.push({
      brandId,
      date: dateKey,
      kind,
      category: kind === "Feed" ? "Planet Sport Content" : kind,
      contentType: "Photo",
      title: cols[2],
      format: cols[3] || "",
      cta: "",
      status,
      responsable: cols[5] || "À assigner",
      note: "",
      checklist: [false, false, false],
      link: null,
      createdBy: userId,
    });
  }

  if (rows.length) await db.insert(calendarCards).values(rows);
  revalidatePath("/calendar");
  return { added: rows.length, errors };
}
