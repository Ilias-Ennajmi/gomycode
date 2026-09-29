import { NextResponse } from "next/server";
import { pushConfigured, sendToAll } from "@/lib/push";

/** "Send a test notification" in Settings. */
export async function POST() {
  if (!pushConfigured()) {
    return NextResponse.json(
      { error: "Notifications aren't set up on the server" },
      { status: 503 }
    );
  }
  const sent = await sendToAll({
    title: "Notifications are on",
    body: "You'll get your morning briefing and big breaking stories here.",
    url: "/reader",
    tag: "test",
  });
  return NextResponse.json({ sent });
}
