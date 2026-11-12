import { isAssetId } from "@/lib/assets/asset-id";
import { failureResponse, isGuid, json, readJson } from "@/lib/server/boards";
import { requireOwner, responseFromError } from "@/lib/server/owner";

export const dynamic = "force-dynamic";

/** At most this many asset ids per board (the editor's own limit is far lower). */
export const MAX_BOARD_ASSETS = 5000;
const ID_CHUNK = 100;

type Ctx = { params: Promise<{ id: string }> };

const fail = (status: number, error: string) => failureResponse({ ok: false, status, error });

/**
 * PUT /api/boards/:id/assets { assetIds } -> { count }
 *
 * Replaces the board's `asset_usages` rows with the given set: rows for assets that are no longer on the board are
 * deleted, new ones inserted, the rest left alone (so repeating a request changes nothing). Owner only; 404 when the board
 * is not the owner's. Ids that are not the owner's assets (or do not exist) are ignored: the count says how many were
 * recorded. At most 5,000 ids; a malformed id or body is 400.
 */
export async function PUT(request: Request, { params }: Ctx): Promise<Response> {
  let auth;
  try {
    auth = await requireOwner();
  } catch (e) {
    return responseFromError(e);
  }
  const { id: boardId } = await params;
  const body = (await readJson(request)) as { assetIds?: unknown } | null;
  const ids = body && typeof body === "object" ? body.assetIds : undefined;
  if (!Array.isArray(ids) || ids.length > MAX_BOARD_ASSETS || !ids.every(isAssetId)) return fail(400, "invalid-body");
  const wanted = [...new Set(ids as string[])];

  if (!isGuid(boardId)) return fail(404, "not-found");
  const { supabase, userId } = auth;
  const { data: board, error: boardError } = await supabase.from("boards").select("id").eq("id", boardId).eq("owner_id", userId).maybeSingle();
  if (boardError) return fail(500, "database-error");
  if (!board) return fail(404, "not-found");

  const { data: current, error: currentError } = await supabase.from("asset_usages").select("asset_id").eq("board_id", boardId).limit(MAX_BOARD_ASSETS + 1000);
  if (currentError || !Array.isArray(current)) return fail(500, "database-error");
  const have = new Set((current as { asset_id: string }[]).map((r) => r.asset_id));

  // Only the owner's own assets count; one lookup per chunk keeps the URL short.
  const owned = new Set<string>();
  const toCheck = wanted.filter((a) => !have.has(a));
  for (let i = 0; i < toCheck.length; i += ID_CHUNK) {
    const { data, error } = await supabase.from("assets").select("id").eq("owner_id", userId).in("id", toCheck.slice(i, i + ID_CHUNK));
    if (error || !Array.isArray(data)) return fail(500, "database-error");
    for (const r of data as { id: string }[]) owned.add(r.id);
  }

  const gone = [...have].filter((a) => !wanted.includes(a));
  for (let i = 0; i < gone.length; i += ID_CHUNK) {
    const { error } = await supabase.from("asset_usages").delete().eq("board_id", boardId).in("asset_id", gone.slice(i, i + ID_CHUNK));
    if (error) return fail(500, "database-error");
  }
  const added = [...owned];
  for (let i = 0; i < added.length; i += 500) {
    const { error } = await supabase.from("asset_usages").insert(added.slice(i, i + 500).map((asset_id) => ({ asset_id, board_id: boardId })));
    if (error) return fail(500, "database-error");
  }

  return json(200, { count: wanted.filter((a) => have.has(a) || owned.has(a)).length });
}
