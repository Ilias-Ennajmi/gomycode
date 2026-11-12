import { assetKey, isAssetId } from "@/lib/assets/asset-id";
import { parseAssetMeta } from "@/lib/assets/asset-schema";
import { requireOwner, responseFromError } from "@/lib/server/owner";

export const dynamic = "force-dynamic";

const json = (status: number, body: unknown) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

/**
 * The client has PUT both files to R2: record the asset. Idempotent (a retried call updates the same row); an id that
 * already belongs to somebody else is a 409 and nothing changes.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
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
  const parsed = parseAssetMeta(raw);
  if (!parsed.ok) return json(parsed.status, { error: parsed.error });
  const { mime, bytes, width, height } = parsed.meta;

  const { error } = await auth.supabase.from("assets").upsert(
    {
      id,
      owner_id: auth.userId,
      kind: "image",
      mime,
      width,
      height,
      bytes,
      variants: { original: assetKey(id, "original"), w1024: assetKey(id, "w1024") },
    },
    { onConflict: "id" },
  );
  if (error) {
    const code = (error as { code?: string }).code;
    if (code === "23505" || code === "42501") return json(409, { error: "conflict" });
    return json(500, { error: "server-error" });
  }
  return json(200, { ok: true, assetId: id });
}
