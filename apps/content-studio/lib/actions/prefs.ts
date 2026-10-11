"use server";

import { currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { userPrefs, users } from "@/db/schema";
import { requireUserId } from "@/lib/auth";

/** Defensive against Clerk webhook lag: ensures a users + user_prefs row exists before reading prefs. */
async function ensureUserRow(userId: string) {
  const existing = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (existing) return;
  const clerkUser = await currentUser();
  const email = clerkUser?.primaryEmailAddress?.emailAddress ?? clerkUser?.emailAddresses[0]?.emailAddress ?? "";
  await db
    .insert(users)
    .values({
      id: userId,
      email,
      displayName: [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ") || null,
      imageUrl: clerkUser?.imageUrl ?? null,
    })
    .onConflictDoNothing();
}

export async function getPrefs() {
  const userId = await requireUserId();
  await ensureUserRow(userId);
  const existing = await db.query.userPrefs.findFirst({ where: eq(userPrefs.userId, userId) });
  if (existing) return existing;
  const [created] = await db.insert(userPrefs).values({ userId }).onConflictDoNothing().returning();
  return created ?? (await db.query.userPrefs.findFirst({ where: eq(userPrefs.userId, userId) }))!;
}

export async function setDarkMode(dark: boolean) {
  const userId = await requireUserId();
  await ensureUserRow(userId);
  await db.insert(userPrefs).values({ userId, dark }).onConflictDoUpdate({ target: userPrefs.userId, set: { dark } });
  revalidatePath("/", "layout");
}

export async function setActiveBrand(brandId: string) {
  const userId = await requireUserId();
  await ensureUserRow(userId);
  await db
    .insert(userPrefs)
    .values({ userId, activeBrandId: brandId })
    .onConflictDoUpdate({ target: userPrefs.userId, set: { activeBrandId: brandId } });
}
