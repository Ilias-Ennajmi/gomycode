import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "./env";

/**
 * Server-side client with the public key and no session, so it always acts as
 * `anon`: for public pages (shared collections) that must never see or create
 * an identity. Null when env isn't configured.
 */
export function getPublicClient() {
  if (!isSupabaseConfigured) return null;
  return createClient<Database, "stash">(SUPABASE_URL, SUPABASE_ANON_KEY, {
    db: { schema: "stash" },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
