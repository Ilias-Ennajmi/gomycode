import { z } from "zod";
import { isAssetId } from "@/lib/assets/asset-id";
import { normalisePalette, paletteSchema } from "@/lib/assets/asset-schema";
import { VARIANT_NAMES, variantPlan, type VariantName } from "@/lib/assets/variants";
import { readAssetRow, readUsage, toLibraryAsset, usageOf } from "@/lib/server/library";
import { requireOwner, responseFromError } from "@/lib/server/owner";
import { deleteAssetObjects, StorageDeleteError } from "@/lib/server/r2";
import type { AssetRow, Json } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

const json = (status: number, body: unknown) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

const isWebUrl = (v: string): boolean => {
  try {
    const u = new URL(v);
    // http(s) only, and never a link that carries a username or password.
    return (u.protocol === "https:" || u.protocol === "http:") && u.username === "" && u.password === "";
  } catch {
    return false;
  }
};
const isIsoDate = (v: string): boolean => /^\d{4}-\d{2}-\d{2}([T ][\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/.test(v) && !Number.isNaN(Date.parse(v));

// An explicit whitelist: nothing but the listed keys can be changed through this route.
const patchSchema = z
  .object({
    /** Variant files that have been uploaded since the asset was completed (the backfill of older images). */
    variants: z
      .partialRecord(z.enum(VARIANT_NAMES as [VariantName, ...VariantName[]]), z.literal(true))
      .refine((v) => Object.keys(v).length > 0, "at least one variant")
      .optional(),
    /** Colour analysis: up to 12 colours; an empty list means analysed with nothing to find. */
    palette: paletteSchema.optional(),
    phash: z
      .string()
      .regex(/^[0-9a-fA-F]{16}$/)
      .optional(),
    /** 1 = the Phase 2 analysis is done (palette and hash are set). */
    analysisVersion: z.literal(1).optional(),
    title: z.string().max(200).optional(),
    provenance: z
      .object({
        sourceUrl: z.string().max(2048).refine(isWebUrl, "http(s) link").nullable(),
        credit: z.string().max(500),
        licence: z.string().max(200),
        capturedAt: z.string().max(40).refine(isIsoDate, "ISO date").nullable(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine((o) => Object.keys(o).length > 0, "nothing to change");

/**
 * Update an asset the owner already has: record extra variants (merged into `assets.variants`, never removing what is
 * there; a variant larger than the image is refused), the colour analysis (palette, phash, analysisVersion), the title and
 * the provenance (source_url, credit, licence, captured_at). Only the listed keys are accepted. 404 for a missing asset or
 * someone else's.
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
  const d = parsed.data;

  const { data: row, error: readError } = await auth.supabase
    .from("assets")
    .select("variants,width,height")
    .eq("id", id)
    .eq("owner_id", auth.userId)
    .maybeSingle();
  if (readError) return json(500, { error: "server-error" });
  if (!row) return json(404, { error: "not-found" });

  const update: Partial<AssetRow> = {};
  if (d.variants) {
    const asked = Object.keys(d.variants) as VariantName[];
    const plan = variantPlan(Number(row.width), Number(row.height));
    if (asked.some((v) => !plan.includes(v))) return json(400, { error: "bad-request" });
    const existing = row.variants && typeof row.variants === "object" && !Array.isArray(row.variants) ? (row.variants as Record<string, unknown>) : {};
    update.variants = { ...existing, ...Object.fromEntries(asked.map((v) => [v, true])) } as Json;
  }
  if (d.palette) update.palette = normalisePalette(d.palette) as Json;
  if (d.phash) update.phash = d.phash.toLowerCase();
  if (d.analysisVersion) update.analysis_version = d.analysisVersion;
  if (d.title !== undefined) update.title = d.title.trim() || null;
  if (d.provenance) {
    update.source_url = d.provenance.sourceUrl;
    update.credit = d.provenance.credit.trim() || null;
    update.licence = d.provenance.licence.trim() || null;
    update.captured_at = d.provenance.capturedAt;
  }

  const { error } = await auth.supabase.from("assets").update(update).eq("id", id).eq("owner_id", auth.userId);
  if (error) return json(500, { error: "server-error" });
  return json(200, { ok: true, assetId: id });
}

type Ctx = { params: Promise<{ id: string }> };

/** One asset as the library shows it, with the boards that use it. 404 for a missing asset or someone else's. */
export async function GET(_request: Request, { params }: Ctx): Promise<Response> {
  let auth;
  try {
    auth = await requireOwner();
  } catch (e) {
    return responseFromError(e);
  }
  const { id } = await params;
  if (!isAssetId(id)) return json(400, { error: "bad-request" });
  const { row, error } = await readAssetRow(auth.supabase, auth.userId, id);
  if (error) return json(500, { error: "server-error" });
  if (!row) return json(404, { error: "not-found" });
  const usage = await readUsage(auth.supabase, auth.userId, [id]);
  if (!usage) return json(500, { error: "server-error" });
  const asset = toLibraryAsset(row, usage, []);
  return asset ? json(200, asset) : json(404, { error: "not-found" });
}

/**
 * Delete an asset for good: its row and every stored file (`a/{id}/original` and the WebP variants). Refused with 409
 * `in-use` while a board uses it, and with 409 `in-trashed-board` while a board in the trash does (restoring that board
 * would otherwise bring back a picture that no longer exists). The files go first: when R2 cannot delete them (502 or 503)
 * the row stays, so the delete can be repeated and nothing is left behind unnoticed. Inbox entries that point at the asset
 * go with it (the database cascades).
 */
export async function DELETE(_request: Request, { params }: Ctx): Promise<Response> {
  let auth;
  try {
    auth = await requireOwner();
  } catch (e) {
    return responseFromError(e);
  }
  const { id } = await params;
  if (!isAssetId(id)) return json(400, { error: "bad-request" });
  const { row, error } = await readAssetRow(auth.supabase, auth.userId, id);
  if (error) return json(500, { error: "server-error" });
  if (!row) return json(404, { error: "not-found" });

  const usage = await readUsage(auth.supabase, auth.userId, [id]);
  if (!usage) return json(500, { error: "server-error" });
  const { live, trashed } = usageOf(usage, id);
  if (live.length > 0) return json(409, { error: "in-use", usedIn: live.length, boards: live.slice(0, 5) });
  if (trashed > 0) return json(409, { error: "in-trashed-board", trashedBoards: trashed });

  try {
    await deleteAssetObjects(id);
  } catch (e) {
    if (e instanceof StorageDeleteError) return e.reason === "not-configured" ? json(503, { error: "storage-not-configured" }) : json(502, { error: "storage-delete-failed" });
    throw e;
  }
  const { error: deleteError } = await auth.supabase.from("assets").delete().eq("id", id).eq("owner_id", auth.userId);
  if (deleteError) return json(500, { error: "server-error" });
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}
