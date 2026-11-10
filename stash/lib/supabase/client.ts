"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Session } from "@supabase/supabase-js";
import type { Database } from "./types";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "./env";
import { createSessionGate, isBotAgent, isPublicPath, sessionAwareFetch } from "./session";

type StashClient = ReturnType<typeof createBrowserClient<Database, "stash">>;
let client: StashClient | null = null;
const createdListeners = new Set<() => void>();

/**
 * The device's anonymous identity: created here, on the phone, the first time a
 * data path needs it (never by the server, so link previews and crawlers don't
 * create users). Shared by every caller; at most one sign-in is ever in flight.
 */
export const ensureSession = createSessionGate<Session>(() => getBrowserClient()?.auth ?? null, {
  isPublicPage: () => typeof window !== "undefined" && isPublicPath(window.location.pathname),
  isBot: () => typeof navigator !== "undefined" && isBotAgent(navigator.userAgent),
  isOnline: () => typeof navigator === "undefined" || navigator.onLine,
  onCreated: () => createdListeners.forEach((l) => l()),
});

/** Runs when this device has just received its identity. */
export function onIdentityCreated(listener: () => void): () => void {
  createdListeners.add(listener);
  return () => createdListeners.delete(listener);
}

/** Browser client bound to the `stash` schema; null when env isn't configured. */
export function getBrowserClient(): StashClient | null {
  if (!isSupabaseConfigured) return null;
  client ??= createBrowserClient<Database, "stash">(SUPABASE_URL, SUPABASE_ANON_KEY, {
    db: { schema: "stash" },
    // Data requests wait for the identity, so nothing goes out as "nobody" on a first open.
    global: { fetch: sessionAwareFetch(ensureSession, SUPABASE_ANON_KEY) },
  });
  return client;
}

/** The signed-in device user (creating the identity if needed), or null offline / unconfigured. */
export async function sessionUser() {
  const session = await ensureSession();
  return session?.user ?? null;
}
