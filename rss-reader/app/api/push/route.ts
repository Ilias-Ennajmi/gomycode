import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getNotifyPrefs, pushConfigured, setNotifyPrefs, vapidPublicKey } from "@/lib/push";

export const dynamic = "force-dynamic";

/** The key a device needs to subscribe, the preferences, and whether this device is on. */
export async function GET(request: NextRequest) {
  const endpoint = request.nextUrl.searchParams.get("endpoint");
  const subscribed = endpoint
    ? Boolean(await prisma.pushSubscription.findUnique({ where: { endpoint } }))
    : false;
  return NextResponse.json({
    configured: pushConfigured(),
    publicKey: vapidPublicKey(),
    prefs: await getNotifyPrefs(),
    subscribed,
  });
}

/** Saves this device's subscription. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const sub = body.subscription;
  if (
    typeof sub?.endpoint !== "string" ||
    typeof sub?.keys?.p256dh !== "string" ||
    typeof sub?.keys?.auth !== "string"
  ) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }
  const data = { p256dh: sub.keys.p256dh, auth: sub.keys.auth };
  await prisma.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    update: data,
    create: { endpoint: sub.endpoint, ...data },
  });
  return NextResponse.json({ ok: true });
}

/** Turns notifications off for one device. */
export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  if (typeof body.endpoint === "string") {
    await prisma.pushSubscription.deleteMany({ where: { endpoint: body.endpoint } });
  }
  return NextResponse.json({ ok: true });
}

/** Which notifications to send. */
export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const prefs: { briefing?: boolean; breaking?: boolean } = {};
  if (typeof body.briefing === "boolean") prefs.briefing = body.briefing;
  if (typeof body.breaking === "boolean") prefs.breaking = body.breaking;
  return NextResponse.json({ prefs: await setNotifyPrefs(prefs) });
}
