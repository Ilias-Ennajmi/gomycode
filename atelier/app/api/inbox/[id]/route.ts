import { z } from "zod";
import { isGuid, json, readJson } from "@/lib/server/boards";
import { failure, serverError } from "@/lib/server/inbox";
import { requireOwner, responseFromError } from "@/lib/server/owner";

export const dynamic = "force-dynamic";

// PATCH  /api/inbox/:id { placed: boolean } -> { ok: true }   sets or clears placed_at (the first placed time is kept)
// DELETE /api/inbox/:id -> 204
// 404 for an item that is not the owner's.

type Ctx = { params: Promise<{ id: string }> };
const patchBody = z.object({ placed: z.boolean() }).strict();

export async function PATCH(request: Request, { params }: Ctx): Promise<Response> {
  let auth;
  try {
    auth = await requireOwner();
  } catch (e) {
    return responseFromError(e);
  }
  const { id } = await params;
  const parsed = patchBody.safeParse(await readJson(request));
  if (!isGuid(id) || !parsed.success) return failure(400, "bad-request");
  const { supabase, userId } = auth;
  const { data: row, error: readError } = await supabase.from("inbox_items").select("id,placed_at").eq("id", id).eq("owner_id", userId).maybeSingle();
  if (readError) return serverError();
  if (!row) return failure(404, "not-found");
  const was = (row as { placed_at: string | null }).placed_at;
  const placed_at = parsed.data.placed ? (was ?? new Date().toISOString()) : null;
  const { error } = await supabase.from("inbox_items").update({ placed_at }).eq("id", id).eq("owner_id", userId);
  if (error) return serverError();
  return json(200, { ok: true });
}

export async function DELETE(_request: Request, { params }: Ctx): Promise<Response> {
  let auth;
  try {
    auth = await requireOwner();
  } catch (e) {
    return responseFromError(e);
  }
  const { id } = await params;
  if (!isGuid(id)) return failure(400, "bad-request");
  const { supabase, userId } = auth;
  const { data, error } = await supabase.from("inbox_items").delete().eq("id", id).eq("owner_id", userId).select("id");
  if (error || !Array.isArray(data)) return serverError();
  if (data.length === 0) return failure(404, "not-found");
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}
