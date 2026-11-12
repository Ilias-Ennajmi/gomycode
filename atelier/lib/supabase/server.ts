import { createServerClient as createSsrServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "./types";
import { ATELIER_SCHEMA, getSupabaseEnv } from "./env";

export type AtelierServerClient = SupabaseClient<Database, "atelier">;

/**
 * Server client for Server Components, Server Actions and Route Handlers, bound to the `atelier`
 * schema and to the signed-in person's cookies. Null when Supabase is not configured.
 */
export async function createServerClient(): Promise<AtelierServerClient | null> {
  const env = getSupabaseEnv();
  if (!env) return null;
  const cookieStore = await cookies();
  return createSsrServerClient<Database, "atelier">(env.url, env.anonKey, {
    db: { schema: ATELIER_SCHEMA },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component, which cannot set cookies: the proxy refreshes the session.
        }
      },
    },
  }) as AtelierServerClient;
}
