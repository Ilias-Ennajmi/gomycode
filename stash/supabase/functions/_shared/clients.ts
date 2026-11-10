// Supabase clients for the functions. The three values are injected by the platform; nobody handles them.
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const STATELESS = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };

export function env(name: string): string {
  const value = Deno.env.get(name) ?? "";
  if (!value) throw new Error(`missing env ${name}`);
  return value;
}

export const supabaseUrl = (): string => env("SUPABASE_URL").replace(/\/+$/, "");

let admin: SupabaseClient | null = null;

/** Service-role client. Never used to sign a user in (that would replace its own credentials). */
export function adminClient(): SupabaseClient {
  admin ??= createClient(supabaseUrl(), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: STATELESS });
  return admin;
}

/** A fresh anon client: one per sign-in, thrown away afterwards. */
export function anonClient(): SupabaseClient {
  return createClient(supabaseUrl(), env("SUPABASE_ANON_KEY"), { auth: STATELESS });
}

/** `stash.rate_limit_take`: false when over the limit. Throws when the database cannot be asked. */
export async function rateLimitTake(subject: string, bucket: string, max: number, windowS: number): Promise<boolean> {
  const { data, error } = await adminClient().schema("stash").rpc("rate_limit_take", {
    p_subject: subject,
    p_bucket: bucket,
    p_max: max,
    p_window_s: windowS,
  });
  if (error) throw new Error("rate_limit_take failed");
  return data === true;
}
