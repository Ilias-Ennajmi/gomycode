import { connection } from "next/server";
import { HomeApp } from "@/components/home/HomeApp";
import { isLocalOnly } from "@/lib/server/owner";

// Per request: whether this server runs in local-only mode is a runtime fact. The page itself
// carries no board data (the browser reads boards from IndexedDB and the API), so what it renders
// is the same for everyone and safe for the service worker to keep for offline starts.
export default async function Home() {
  await connection();
  return <HomeApp localOnly={isLocalOnly()} />;
}
