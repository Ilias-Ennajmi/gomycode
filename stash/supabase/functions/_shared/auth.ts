// Who is calling? The user id behind an access token, checked against the project's Auth.
import { adminClient } from "./clients.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Claims = { sub?: unknown; role?: unknown };
type WithClaims = { getClaims?: (jwt: string) => Promise<{ data: { claims: Claims } | null; error: unknown }> };

/**
 * The user id for a valid session token, else null. `getClaims` verifies the signature (locally
 * with the project's signing keys, or by asking Auth); older clients fall back to `getUser`.
 * An anon or service key is a valid JWT but not a user: refused.
 */
export async function userIdFromToken(token: string): Promise<string | null> {
  const auth = adminClient().auth;
  const claimsApi = auth as unknown as WithClaims;
  if (typeof claimsApi.getClaims === "function") {
    const { data, error } = await claimsApi.getClaims(token);
    const claims = data?.claims;
    if (error || !claims || claims.role !== "authenticated") return null;
    return typeof claims.sub === "string" && UUID.test(claims.sub) ? claims.sub : null;
  }
  const { data, error } = await auth.getUser(token);
  return error || !data.user ? null : data.user.id;
}

/** Always asks Auth (the user must still exist): for actions that change the account. */
export async function liveUserIdFromToken(token: string): Promise<string | null> {
  const { data, error } = await adminClient().auth.getUser(token);
  return error || !data.user || !UUID.test(data.user.id) ? null : data.user.id;
}
