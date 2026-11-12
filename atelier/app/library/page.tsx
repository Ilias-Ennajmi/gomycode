import type { Metadata } from "next";
import { connection } from "next/server";
import { LibraryApp } from "@/components/library/LibraryApp";
import { isLocalOnly } from "@/lib/server/owner";

export const metadata: Metadata = { title: "Library" };

// Per request: whether this server runs in local-only mode is a runtime fact, decided here and handed to the browser.
// The page carries no data (the library is read from the API, or from this device in local-only mode).
export default async function LibraryPage() {
  await connection();
  return <LibraryApp localOnly={isLocalOnly()} />;
}
