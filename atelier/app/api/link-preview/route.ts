import { decodeHtmlBody, parseOpenGraph } from "@/lib/server/open-graph";
import { errorResponse, fetchErrorResponse, rateLimited } from "@/lib/server/link-preview-http";
import { previewLimiter } from "@/lib/server/link-preview-limits";
import { requireOwner, responseFromError } from "@/lib/server/owner";
import { safeFetch } from "@/lib/server/safe-fetch";

export const dynamic = "force-dynamic";

const MAX_BODY_CHARS = 8 * 1024;

/**
 * POST /api/link-preview { url } -> 200 LinkPreview | 400 { error: "blocked" | "bad-request" } | 429 | 502 | 504.
 * Owner only. Fetches the page through safeFetch (public http(s) targets only, 5 s, 512 KB read cap), parses Open Graph
 * data and returns plain-text fields; never raw HTML. 30 requests per minute per owner (per server instance).
 */
export async function POST(request: Request): Promise<Response> {
  let userId: string;
  try {
    ({ userId } = await requireOwner());
  } catch (e) {
    return responseFromError(e);
  }

  const limit = previewLimiter.hit(userId);
  if (!limit.ok) return rateLimited(limit.retryAfterSec);

  let url: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_CHARS) return errorResponse(400, "bad-request");
    url = (JSON.parse(text) as { url?: unknown } | null)?.url;
  } catch {
    return errorResponse(400, "bad-request");
  }
  if (typeof url !== "string" || url.length === 0 || url.length > 2048) return errorResponse(400, "bad-request");

  try {
    const res = await safeFetch(url, { maxBytes: 512 * 1024, onLimit: "truncate", accept: /^(text\/html|application\/xhtml\+xml)/ });
    const preview = parseOpenGraph(decodeHtmlBody(res.body, res.contentType), res.finalUrl);
    return Response.json(preview, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return fetchErrorResponse(e);
  }
}
