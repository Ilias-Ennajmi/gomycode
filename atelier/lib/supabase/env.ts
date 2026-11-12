// NEXT_PUBLIC_* values are inlined at build time wherever they are written out literally, so each
// one is read with a literal property access here (never process.env[name]).

export type SupabaseEnv = { url: string; anonKey: string };

/** The public Supabase settings, or null when they are not configured. */
export function getSupabaseEnv(): SupabaseEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  return url && anonKey ? { url, anonKey } : null;
}

/** Postgres schema that holds every Atelier table. */
export const ATELIER_SCHEMA = "atelier";
