import { createServerClient, type AtelierServerClient } from "@/lib/supabase/server";
import { checkSecondFactor } from "./mfa";

type Env = Record<string, string | undefined>;

/**
 * True only for the one Supabase user id in ATELIER_OWNER_ID. Missing, empty or blank ids never
 * match, and neither does anything when no owner is configured (so undefined !== undefined can
 * never open the door).
 */
export function isOwnerId(id: string | undefined, env: Env = process.env): boolean {
  const owner = env.ATELIER_OWNER_ID?.trim().toLowerCase();
  const candidate = id?.trim().toLowerCase();
  return Boolean(owner) && Boolean(candidate) && candidate === owner;
}

/**
 * Local-only mode (ATELIER_LOCAL_ONLY=1: no login, no sync) is for development and end-to-end
 * tests. Asking for it in production is a misconfiguration that would publish the app without a
 * login, so it throws instead of quietly turning on.
 */
export function isLocalOnly(env: Env = process.env): boolean {
  if (env.ATELIER_LOCAL_ONLY !== "1") return false;
  if (env.VERCEL_ENV === "production") throw new Error("Local-only mode is not allowed in production");
  return true;
}

/** The claims Atelier cares about, from a verified token. */
export type OwnerClaims = { sub?: string; is_anonymous?: boolean; aal?: string };

/** Anonymous Supabase identities (Stash creates them in the same project) never count as the owner. */
export function claimsAreOwner(claims: OwnerClaims | null | undefined, env: Env = process.env): boolean {
  return Boolean(claims) && claims!.is_anonymous !== true && isOwnerId(claims!.sub, env);
}

function json(status: number, body: Record<string, string>): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

/**
 * Guard for Route Handlers. Resolves with the owner's id and a Supabase client acting as them;
 * otherwise THROWS a Response (401 no session, 403 someone else, 503 not available), which the
 * handler returns:
 *
 *   try { const { userId, supabase } = await requireOwner(); ... }
 *   catch (e) { return responseFromError(e); }
 */
export async function requireOwner(): Promise<{ userId: string; supabase: AtelierServerClient }> {
  // Throws in production; there is no account to check in local-only mode.
  if (isLocalOnly()) throw json(503, { error: "local-only" });

  const supabase = await createServerClient();
  if (!supabase) throw json(503, { error: "not-configured" });

  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims as OwnerClaims | undefined;
  if (error || !claims?.sub) throw json(401, { error: "unauthorized" });
  if (!claimsAreOwner(claims)) throw json(403, { error: "forbidden" });

  // Once two-step verification is on, a password-only session is not enough (repeats the proxy).
  if (claims.aal !== "aal2") {
    const second = await checkSecondFactor(supabase);
    if (second !== "ok") throw json(401, { error: second === "needed" ? "mfa-required" : "unauthorized" });
  }

  return { userId: claims.sub, supabase };
}

/** Turns what requireOwner threw into the Response to return; rethrows real errors. */
export function responseFromError(e: unknown): Response {
  if (e instanceof Response) return e;
  throw e;
}
