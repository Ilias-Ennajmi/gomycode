import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./types";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./env";

/** Server client (Server Components, Route Handlers) bound to the `stash` schema. */
export async function getServerClient() {
  const cookieStore = await cookies();
  return createServerClient<Database, "stash">(SUPABASE_URL, SUPABASE_ANON_KEY, {
    db: { schema: "stash" },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component: the proxy refreshes the session instead.
        }
      },
    },
  });
}
