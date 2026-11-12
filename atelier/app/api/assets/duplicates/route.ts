import { clusterByHash, readAssetRows } from "@/lib/server/library";
import { requireOwner, responseFromError } from "@/lib/server/owner";

export const dynamic = "force-dynamic";

const json = (status: number, body: unknown) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

/**
 * Possible duplicates: groups of two or more of the owner's assets whose perceptual hashes are within 6 bits of each other
 * (a picture joins a group when it is that close to any member; `dist` is the largest distance inside the group, 0 for exact
 * copies). Only the owner's own visible assets are compared, so groups never mix owners. Same rule as the SQL function
 * `atelier.similar_assets`, applied here so one request clusters the whole library.
 */
export async function GET(): Promise<Response> {
  let auth;
  try {
    auth = await requireOwner();
  } catch (e) {
    return responseFromError(e);
  }
  const rows = await readAssetRows(auth.supabase, auth.userId);
  if (!rows) return json(500, { error: "server-error" });
  const groups = clusterByHash(rows.map((r) => ({ id: String(r.id), phash: typeof r.phash === "string" ? r.phash : null })));
  return json(200, { groups });
}
