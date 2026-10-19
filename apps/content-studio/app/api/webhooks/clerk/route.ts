import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { userPrefs, users } from "@/db/schema";

export async function POST(req: NextRequest) {
  let evt;
  try {
    evt = await verifyWebhook(req);
  } catch {
    return new NextResponse("Webhook verification failed", { status: 400 });
  }

  if (evt.type === "user.created" || evt.type === "user.updated") {
    const u = evt.data;
    const email = u.email_addresses.find((e) => e.id === u.primary_email_address_id)?.email_address;
    if (!email) return NextResponse.json({ ok: true });

    await db
      .insert(users)
      .values({
        id: u.id,
        email,
        displayName: [u.first_name, u.last_name].filter(Boolean).join(" ") || null,
        imageUrl: u.image_url ?? null,
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          email,
          displayName: [u.first_name, u.last_name].filter(Boolean).join(" ") || null,
          imageUrl: u.image_url ?? null,
        },
      });

    if (evt.type === "user.created") {
      await db.insert(userPrefs).values({ userId: u.id }).onConflictDoNothing();
    }
  }

  if (evt.type === "user.deleted" && evt.data.id) {
    await db.delete(users).where(eq(users.id, evt.data.id));
  }

  return NextResponse.json({ ok: true });
}
