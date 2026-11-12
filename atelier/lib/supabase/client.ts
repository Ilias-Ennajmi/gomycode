"use client";

import { createBrowserClient as createSsrBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { ATELIER_SCHEMA, getSupabaseEnv } from "./env";

export type AtelierClient = SupabaseClient<Database, "atelier">;

let client: AtelierClient | null = null;

/** Browser client bound to the `atelier` schema; null when Supabase is not configured. */
export function createBrowserClient(): AtelierClient | null {
  const env = getSupabaseEnv();
  if (!env) return null;
  client ??= createSsrBrowserClient<Database, "atelier">(env.url, env.anonKey, {
    db: { schema: ATELIER_SCHEMA },
  }) as AtelierClient;
  return client;
}
