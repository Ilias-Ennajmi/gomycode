import type { Metadata } from "next";
import { connection } from "next/server";
import { InboxApp } from "@/components/inbox/InboxApp";
import { isLocalOnly } from "@/lib/server/owner";

export const metadata: Metadata = { title: "Inbox" };

// Per request: whether this server runs in local-only mode is a runtime fact, decided here and handed to the browser.
// The page carries no data (items are read from the API, or from this device in local-only mode).
export default async function InboxPage() {
  await connection();
  return <InboxApp localOnly={isLocalOnly()} />;
}
