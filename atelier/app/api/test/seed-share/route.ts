import { jsonResponse } from "@/lib/server/http";
import { isLocalOnly } from "@/lib/server/owner";
import { seedShare, type SeedSpec } from "@/lib/server/seed-share";
import { getShareStore } from "@/lib/server/share-store";
import { MemoryShareStore } from "@/lib/server/share-store-memory";

// POST /api/test/seed-share   (local-only mode only: end-to-end tests and screenshots; everywhere else this route is a 404)
// Body: { op: "create", spec } -> a board + a share link in the in-memory store.
//       { op: "revoke", linkId } | { op: "reveal", linkId } | { op: "password", linkId } -> change that link as the owner would.
// The routes a client uses are the real ones (/s/{token}, /api/s/{token}/*); this only stands in for the owner's dialog.

const notFound = () => jsonResponse(404, { error: "not-found" });

export async function POST(req: Request): Promise<Response> {
  let local = false;
  try {
    local = isLocalOnly();
  } catch {
    local = false; // local-only requested in production: the route does not exist
  }
  if (!local) return notFound();
  const store = getShareStore();
  if (!(store instanceof MemoryShareStore)) return notFound();

  const body = (await req.json().catch(() => null)) as { op?: string; spec?: SeedSpec; linkId?: string } | null;
  if (!body) return jsonResponse(400, { error: "invalid-body" });
  if (body.op === "create" && body.spec) return jsonResponse(201, await seedShare(store, body.spec));
  if (typeof body.linkId === "string") {
    const link = await store.getLink(body.linkId);
    if (!link) return notFound();
    if (body.op === "revoke") await store.revokeLink(link.id, link.ownerId, new Date());
    else if (body.op === "reveal") await store.updateLink(link.id, link.ownerId, { votesRevealed: true });
    else if (body.op === "password") await store.updateLink(link.id, link.ownerId, { bumpEpoch: true });
    else return jsonResponse(400, { error: "unknown-op" });
    return jsonResponse(204, null);
  }
  return jsonResponse(400, { error: "invalid-body" });
}
