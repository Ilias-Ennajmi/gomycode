import { newAssetId } from "@/lib/assets/asset-id";
import { parseAssetMeta } from "@/lib/assets/asset-schema";
import { requireOwner, responseFromError } from "@/lib/server/owner";
import { presignAssetUploads } from "@/lib/server/r2";

export const dynamic = "force-dynamic";

const json = (status: number, body: unknown) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

/**
 * Start an upload. Owner only; web images (jpeg, png, webp, gif, avif) up to 50 MB, mp4 / webm up to 200 MB. Returns
 * presigned R2 PUT URLs (10 minutes) for the original and for each WebP variant the client says it made (256 / 1024 /
 * 2048 px; a variant larger than the image is refused: nothing is upscaled). A request that lists no `variants` at all
 * is a Phase 1 client and gets the w1024 URL. Nothing is stored yet: POST /api/assets/:id/complete records the asset.
 * The client may propose the asset id (it needs one to place an image while offline); otherwise the server makes one.
 *
 * With a `phash`, an existing, visible asset of the same owner with the same hash and size is reported as `duplicateOf`
 * and no URLs are returned: the client points its object at that asset instead of uploading again.
 */
export async function POST(request: Request): Promise<Response> {
  let auth;
  try {
    auth = await requireOwner();
  } catch (e) {
    return responseFromError(e);
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json(400, { error: "bad-request" });
  }
  const parsed = parseAssetMeta(raw);
  if (!parsed.ok) return json(parsed.status, { error: parsed.error });
  const { meta } = parsed;

  const assetId = meta.assetId ?? newAssetId();

  if (meta.phash && meta.kind !== "video") {
    // Best effort: a failed lookup just means "no duplicate found".
    let query = auth.supabase
      .from("assets")
      .select("id")
      .eq("owner_id", auth.userId)
      .eq("phash", meta.phash)
      .eq("bytes", meta.bytes)
      .neq("hidden", true);
    if (meta.assetId) query = query.neq("id", meta.assetId);
    const { data, error } = await query.limit(1);
    const dup = !error && Array.isArray(data) ? (data[0] as { id?: unknown } | undefined)?.id : undefined;
    if (typeof dup === "string") return json(200, { assetId, uploads: {}, duplicateOf: dup });
  }

  try {
    return json(200, {
      assetId,
      uploads: presignAssetUploads({ assetId, mime: meta.mime, variants: meta.variants }),
      duplicateOf: null,
    });
  } catch {
    return json(503, { error: "storage-not-configured" });
  }
}
