import { assetKey, newAssetId } from "@/lib/assets/asset-id";
import { parseAssetMeta } from "@/lib/assets/asset-schema";
import { requireOwner, responseFromError } from "@/lib/server/owner";
import { presignPut } from "@/lib/server/r2";

export const dynamic = "force-dynamic";

const json = (status: number, body: unknown) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

/**
 * Start an image upload. Owner only; web image types up to 50 MB. Returns presigned R2 PUT URLs (10 minutes) for the
 * original and the 1024 px WebP variant. Nothing is stored yet: POST /api/assets/:id/complete records the asset.
 * The client may propose the asset id (it needs one to place an image while offline); otherwise the server makes one.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    await requireOwner();
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

  const assetId = parsed.meta.assetId ?? newAssetId();
  try {
    return json(200, {
      assetId,
      uploads: {
        original: presignPut({ key: assetKey(assetId, "original"), contentType: parsed.meta.mime }),
        w1024: presignPut({ key: assetKey(assetId, "w1024"), contentType: "image/webp" }),
      },
    });
  } catch {
    return json(503, { error: "storage-not-configured" });
  }
}
