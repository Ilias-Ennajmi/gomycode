import { z } from "zod";
import { isAssetId } from "@/lib/assets/asset-id";
import { VARIANT_NAMES, variantPlan, type VariantName } from "@/lib/assets/variants";
import { requireOwner, responseFromError } from "@/lib/server/owner";
import type { Json } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

const json = (status: number, body: unknown) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

// An explicit whitelist: nothing but the listed keys can be changed through this route (a later task adds more).
const patchSchema = z
  .object({
    /** Variant files that have been uploaded since the asset was completed (the backfill of older images). */
    variants: z
      .partialRecord(z.enum(VARIANT_NAMES as [VariantName, ...VariantName[]]), z.literal(true))
      .refine((v) => Object.keys(v).length > 0, "at least one variant"),
  })
  .strict();

/**
 * Update an asset the owner already has. Currently: record extra variants (merged into `assets.variants`, never
 * removing what is there). A variant larger than the image is refused. 404 for a missing asset or someone else's.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  let auth;
  try {
    auth = await requireOwner();
  } catch (e) {
    return responseFromError(e);
  }

  const { id } = await params;
  if (!isAssetId(id)) return json(400, { error: "bad-request" });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json(400, { error: "bad-request" });
  }
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) return json(400, { error: "bad-request" });

  const { data: row, error: readError } = await auth.supabase
    .from("assets")
    .select("variants,width,height")
    .eq("id", id)
    .eq("owner_id", auth.userId)
    .maybeSingle();
  if (readError) return json(500, { error: "server-error" });
  if (!row) return json(404, { error: "not-found" });

  const asked = Object.keys(parsed.data.variants) as VariantName[];
  const plan = variantPlan(Number(row.width), Number(row.height));
  if (asked.some((v) => !plan.includes(v))) return json(400, { error: "bad-request" });

  const existing = row.variants && typeof row.variants === "object" && !Array.isArray(row.variants) ? (row.variants as Record<string, unknown>) : {};
  const merged = { ...existing, ...Object.fromEntries(asked.map((v) => [v, true])) };
  const { error } = await auth.supabase.from("assets").update({ variants: merged as Json }).eq("id", id).eq("owner_id", auth.userId);
  if (error) return json(500, { error: "server-error" });
  return json(200, { ok: true, assetId: id });
}
