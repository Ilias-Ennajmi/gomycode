import { isAssetId, newAssetId } from "@/lib/assets/asset-id";
import { parseAssetMeta } from "@/lib/assets/asset-schema";
import { isVariantName, type VariantName } from "@/lib/assets/variants";
import { listLibrary, parseLibraryQuery } from "@/lib/server/library";
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

/** At most this many ids per GET /api/assets (the browser asks 100 at a time). */
const MAX_IDS = 200;

/**
 * Two reads, owner only (RLS and an explicit owner filter):
 *
 * `GET /api/assets?ids=a,b,c` is what the canvas needs to draw assets it has not seen on this device: size, the variants
 * that exist, the analysis. Assets that do not exist, are someone else's, or have no pixel size are simply left out.
 *
 * Without `ids` it is the library list: `?query=&kind=&sort=recent|used|size&unused=1&limit=100&before=ISO` answers
 * `{ assets: LibraryAsset[] }` (hidden assets left out; `usedIn` counts boards that are not in the trash). `before` pages
 * the recent sort by creation time; the other sorts return their first `limit` (at most 200).
 */
export async function GET(request: Request): Promise<Response> {
  let auth;
  try {
    auth = await requireOwner();
  } catch (e) {
    return responseFromError(e);
  }

  const params = new URL(request.url).searchParams;
  if (!params.has("ids")) {
    const parsed = parseLibraryQuery(params);
    if (!parsed.ok) return json(400, { error: "bad-request" });
    const assets = await listLibrary(auth.supabase, auth.userId, parsed.q);
    return assets ? json(200, { assets }) : json(500, { error: "server-error" });
  }
  const raw = params.get("ids") ?? "";
  const ids = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0 || ids.length > MAX_IDS || !ids.every(isAssetId)) return json(400, { error: "bad-request" });

  const { data, error } = await auth.supabase
    .from("assets")
    .select("id,kind,width,height,bytes,variants,palette,phash,title,analysis_version")
    .eq("owner_id", auth.userId)
    .in("id", ids);
  if (error || !Array.isArray(data)) return json(500, { error: "server-error" });

  const assets = [];
  for (const r of data as Array<Record<string, unknown>>) {
    const width = r.width;
    const height = r.height;
    if (typeof r.id !== "string" || typeof width !== "number" || typeof height !== "number" || !(width > 0) || !(height > 0)) continue;
    if (r.kind !== "image" && r.kind !== "video" && r.kind !== "gif") continue;
    const stored = r.variants && typeof r.variants === "object" && !Array.isArray(r.variants) ? (r.variants as Record<string, unknown>) : {};
    const variants = (Object.keys(stored).filter((k) => isVariantName(k) && stored[k]) as VariantName[]).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
    assets.push({
      id: r.id,
      kind: r.kind,
      width,
      height,
      bytes: typeof r.bytes === "number" ? r.bytes : 0,
      variants,
      palette: Array.isArray(r.palette) ? r.palette : null,
      phash: typeof r.phash === "string" ? r.phash : null,
      title: typeof r.title === "string" ? r.title : "",
      analysisVersion: typeof r.analysis_version === "number" ? r.analysis_version : 0,
    });
  }
  return json(200, { assets });
}
