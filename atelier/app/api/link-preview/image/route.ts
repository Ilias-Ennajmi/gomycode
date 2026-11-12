import { errorResponse, fetchErrorResponse, rateLimited } from "@/lib/server/link-preview-http";
import { imageLimiter } from "@/lib/server/link-preview-limits";
import { requireOwner, responseFromError } from "@/lib/server/owner";
import { safeFetch } from "@/lib/server/safe-fetch";

export const dynamic = "force-dynamic";

type ImageType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

/** What the first bytes say the file is; must agree with the Content-Type the server claimed. */
function sniff(b: Uint8Array): ImageType | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length >= 4 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return "image/gif";
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}

/**
 * GET /api/link-preview/image?url= -> the image bytes (JPEG, PNG, WebP or GIF up to 5 MiB; never SVG). Owner only.
 * The browser must not load third-party og:image URLs itself (it would leak the viewer's IP and could hit internal
 * addresses); it asks this route, which fetches through safeFetch. The response is locked down so that even a mislabelled
 * payload cannot run as a document: allow-listed Content-Type only, nosniff, and a CSP that forbids everything.
 */
export async function GET(request: Request): Promise<Response> {
  let userId: string;
  try {
    ({ userId } = await requireOwner());
  } catch (e) {
    return responseFromError(e);
  }

  const limit = imageLimiter.hit(userId);
  if (!limit.ok) return rateLimited(limit.retryAfterSec);

  const target = new URL(request.url).searchParams.get("url");
  if (!target || target.length > 2048) return errorResponse(400, "bad-request");

  const unsupported = errorResponse(400, "unsupported-type");
  try {
    const res = await safeFetch(target, { maxBytes: 5 * 1024 * 1024, accept: /^image\/(jpeg|png|webp|gif)$/ });
    const claimed = res.contentType.split(";")[0].trim().toLowerCase();
    if (sniff(res.body) !== claimed) return unsupported;
    return new Response(res.body as BodyInit, {
      status: 200,
      headers: {
        "content-type": claimed,
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'",
        "cache-control": "private, max-age=3600",
        "cross-origin-resource-policy": "same-origin",
      },
    });
  } catch (e) {
    return fetchErrorResponse(e, { badContentType: unsupported, tooLarge: errorResponse(413, "too-large") });
  }
}
