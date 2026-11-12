import type { AssetUploader } from "@/lib/assets/upload-queue";
import type { LinkPreview } from "@/lib/server/open-graph";
import { LinkPreviewUnavailable, type LinkCardDeps } from "./link-cards";

/** A hung request must not hold one of the two preview slots for ever (the server itself gives up after 5 s). */
const PREVIEW_TIMEOUT_MS = 15_000;
const IMAGE_TIMEOUT_MS = 20_000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const text = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "");
const webUrl = (v: unknown): string | null => {
  if (typeof v !== "string" || v.length === 0 || v.length > 2048) return null;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
};

/**
 * POST /api/link-preview. The answer is plain text by contract, but it is clamped and re-checked here anyway: titles and
 * descriptions only ever reach the DOM as text, and the image URL only as a query value for the same-origin proxy.
 * 503 (local-only mode: no server to fetch for us) rejects with LinkPreviewUnavailable so the card stays a domain card.
 */
export async function fetchLinkPreview(url: string, f: typeof fetch = fetch): Promise<LinkPreview> {
  const res = await f("/api/link-preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
    signal: AbortSignal.timeout(PREVIEW_TIMEOUT_MS),
  });
  if (res.status === 503) throw new LinkPreviewUnavailable();
  if (!res.ok) throw new Error(`link preview failed (${res.status})`);
  const j = (await res.json()) as Partial<Record<keyof LinkPreview, unknown>> | null;
  if (!j || typeof j !== "object") throw new Error("link preview: bad answer");
  return {
    title: text(j.title, 200),
    description: text(j.description, 400),
    siteName: text(j.siteName, 100),
    imageUrl: webUrl(j.imageUrl),
    faviconUrl: webUrl(j.faviconUrl),
    finalUrl: webUrl(j.finalUrl) ?? url,
  };
}

/** GET /api/link-preview/image?url=: the picture through our own server, never straight from the third-party host. */
export async function fetchLinkImage(imageUrl: string, f: typeof fetch = fetch): Promise<Blob> {
  const res = await f(`/api/link-preview/image?url=${encodeURIComponent(imageUrl)}`, { signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`link image failed (${res.status})`);
  const blob = await res.blob();
  if (!/^image\/(jpeg|png|webp|gif)$/.test(blob.type) || blob.size === 0 || blob.size > MAX_IMAGE_BYTES) throw new Error("link image: unusable");
  return blob;
}

/** The dependencies link cards run with in the browser. `addAssetOnly` is what keeps the og:image as an asset. */
export function createLinkCardDeps(uploader: Pick<AssetUploader, "addAssetOnly">): LinkCardDeps {
  return {
    fetchPreview: (u) => fetchLinkPreview(u),
    fetchImage: (u) => fetchLinkImage(u),
    uploader,
    online: () => typeof navigator === "undefined" || navigator.onLine !== false,
  };
}
