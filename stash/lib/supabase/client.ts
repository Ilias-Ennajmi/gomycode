"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "./env";

let client: ReturnType<typeof createBrowserClient<Database, "stash">> | null = null;

/** Browser client bound to the `stash` schema; null when env isn't configured. */
export function getBrowserClient() {
  if (!isSupabaseConfigured) return null;
  client ??= createBrowserClient<Database, "stash">(SUPABASE_URL, SUPABASE_ANON_KEY, {
    db: { schema: "stash" },
  });
  return client;
}
