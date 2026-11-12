import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { ATELIER_SCHEMA } from "./env";
import type { AtelierServerClient } from "./server";

/**
 * Service-role client for the schema `atelier`: it bypasses row-level security, so it is for server code that has ALREADY
 * decided who may do what (the share routes after `requireVisitor`, `requireOwner`'s own checks for owner-scoped writes).
 *
 * Never import this from client code. `import "server-only"` makes the build fail if a Client Component (or anything it
 * imports) reaches this file, and tests/unit/service-client.test.ts also walks the import graph to prove none does.
 * The key comes from SUPABASE_SERVICE_ROLE_KEY (never NEXT_PUBLIC_*), is never logged, and is not cached on a global.
 * Null when Supabase is not configured. There is no session: nothing is stored, nothing refreshed.
 */
export function createServiceClient(env: Record<string, string | undefined> = process.env): AtelierServerClient | null {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient<Database, "atelier">(url, key, {
    db: { schema: ATELIER_SCHEMA },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }) as unknown as AtelierServerClient;
}
