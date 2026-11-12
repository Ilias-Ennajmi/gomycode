import { z } from "zod";
import { isAssetId } from "./asset-id";

export const MAX_ASSET_BYTES = 50 * 1024 * 1024;

/** Types the canvas can show. SVG is left out on purpose: R2 serves it as-is and SVG can carry scripts. */
export const ALLOWED_IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif", "image/bmp"] as const;

const metaSchema = z.object({
  assetId: z.string().refine(isAssetId).optional(),
  mime: z.string().min(1).max(100),
  bytes: z.number().int().positive(),
  width: z.number().int().min(1).max(65_535),
  height: z.number().int().min(1).max(65_535),
});

export type AssetMeta = { mime: string; bytes: number; width: number; height: number; assetId?: string };
export type AssetMetaResult = { ok: true; meta: AssetMeta } | { ok: false; status: 400 | 413 | 415; error: string };

/** Validates the body of POST /api/assets and /api/assets/:id/complete. Oversize wins over every other complaint. */
export function parseAssetMeta(raw: unknown): AssetMetaResult {
  if (typeof raw !== "object" || raw === null) return { ok: false, status: 400, error: "bad-request" };
  const claimed = (raw as { bytes?: unknown }).bytes;
  if (typeof claimed === "number" && claimed > MAX_ASSET_BYTES) return { ok: false, status: 413, error: "too-large" };
  const parsed = metaSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, status: 400, error: "bad-request" };
  const { mime } = parsed.data;
  if (!(ALLOWED_IMAGE_MIMES as readonly string[]).includes(mime)) return { ok: false, status: 415, error: "unsupported-type" };
  return { ok: true, meta: parsed.data };
}
