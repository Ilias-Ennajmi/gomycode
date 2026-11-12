import { z } from "zod";
import { json, readJson } from "@/lib/server/boards";
import { COLUMNS, INBOX_FULL_MESSAGE, INBOX_LIMIT, countUnplaced, failure, parseNewItem, serverError, toItem } from "@/lib/server/inbox";
import { requireOwner, responseFromError } from "@/lib/server/owner";
import type { InboxItemRow } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

// GET    /api/inbox?placed=0|1&limit=100&before=ISO -> { items: InboxItem[]; unplaced: number }   (owner only; newest first)
// POST   /api/inbox NewInboxItem -> { id }       image / video need an assetId the owner owns; at most 200 unplaced items (409 inbox-full)
// DELETE /api/inbox { ids: string[] (1..200) } | { placed: true } -> { deleted: number }     several at once; never another owner's

export async function GET(request: Request): Promise<Response> {
  let auth;
  try {
    auth = await requireOwner();
  } catch (e) {
    return responseFromError(e);
  }
  const params = new URL(request.url).searchParams;
  const placed = params.get("placed");
  if (placed !== null && placed !== "0" && placed !== "1") return failure(400, "bad-request");
  const rawLimit = params.get("limit");
  let limit = 100;
  if (rawLimit !== null) {
    if (!/^\d{1,3}$/.test(rawLimit) || Number(rawLimit) < 1 || Number(rawLimit) > 500) return failure(400, "bad-request");
    limit = Number(rawLimit);
  }
  const before = params.get("before");
  if (before !== null && before !== "" && !Number.isFinite(Date.parse(before))) return failure(400, "bad-request");

  const { supabase, userId } = auth;
  let q = supabase.from("inbox_items").select(COLUMNS).eq("owner_id", userId);
  if (placed === "0") q = q.is("placed_at", null);
  if (placed === "1") q = q.not("placed_at", "is", null);
  if (before) q = q.lt("created_at", before);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(limit);
  if (error || !Array.isArray(data)) return serverError();
  const unplaced = await countUnplaced(supabase, userId);
  if (unplaced === null) return serverError();
  return json(200, { items: (data as InboxItemRow[]).map(toItem), unplaced });
}

export async function POST(request: Request): Promise<Response> {
  let auth;
  try {
    auth = await requireOwner();
  } catch (e) {
    return responseFromError(e);
  }
  const item = parseNewItem(await readJson(request));
  if (!item) return failure(400, "bad-request");
  const { supabase, userId } = auth;

  if (item.assetId) {
    const { data, error } = await supabase.from("assets").select("id").eq("id", item.assetId).eq("owner_id", userId).maybeSingle();
    if (error) return serverError();
    if (!data) return failure(400, "unknown-asset");
  }

  const waiting = await countUnplaced(supabase, userId);
  if (waiting === null) return serverError();
  if (waiting >= INBOX_LIMIT) return failure(409, "inbox-full", { limit: INBOX_LIMIT, message: INBOX_FULL_MESSAGE });

  const { data, error } = await supabase
    .from("inbox_items")
    .insert({
      owner_id: userId,
      kind: item.kind,
      asset_id: item.assetId,
      url: item.url,
      text_body: item.text,
      title: item.title,
      source_url: item.sourceUrl,
      credit: item.credit,
    })
    .select("id")
    .single();
  if (error || !data) return serverError();
  return json(200, { id: (data as { id: string }).id });
}

const deleteBody = z.union([
  z.object({ ids: z.array(z.guid()).min(1).max(200) }).strict(),
  z.object({ placed: z.literal(true) }).strict(),
]);

export async function DELETE(request: Request): Promise<Response> {
  let auth;
  try {
    auth = await requireOwner();
  } catch (e) {
    return responseFromError(e);
  }
  const parsed = deleteBody.safeParse(await readJson(request));
  if (!parsed.success) return failure(400, "bad-request");
  const { supabase, userId } = auth;
  let q = supabase.from("inbox_items").delete().eq("owner_id", userId);
  q = "ids" in parsed.data ? q.in("id", parsed.data.ids) : q.not("placed_at", "is", null);
  const { data, error } = await q.select("id");
  if (error || !Array.isArray(data)) return serverError();
  return json(200, { deleted: data.length });
}
