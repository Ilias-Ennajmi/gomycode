import { z } from "zod";
import { isAssetId } from "./asset-id";
import { VARIANT_NAMES, variantPlan, type VariantName } from "./variants";

export const MAX_ASSET_BYTES = 50 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

/**
 * Types the canvas can show. SVG is left out on purpose: R2 serves it as-is and SVG can carry scripts.
 * HEIC is attempted by the browser (createImageBitmap) and re-encoded only if it can decode it; it is not stored.
 */
export const ALLOWED_IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"] as const;
export const ALLOWED_VIDEO_MIMES = ["video/mp4", "video/webm"] as const;

export type AssetKind = "image" | "video" | "gif";

/** At most this many colours are stored per asset (the analysis makes at most 8). */
export const MAX_PALETTE_COLORS = 12;

/** `assets.palette`: lower-case or upper-case `#rrggbb` with a 0..1 weight. Empty = analysed, nothing to find (fully transparent). */
export const paletteSchema = z
  .array(z.object({ hex: z.string().regex(/^#[0-9a-fA-F]{6}$/), weight: z.number().min(0).max(1) }).strict())
  .max(MAX_PALETTE_COLORS);

/** Normalised for storage: lower-case hex. */
export const normalisePalette = (p: { hex: string; weight: number }[]) => p.map((c) => ({ hex: c.hex.toLowerCase(), weight: c.weight }));

const metaSchema = z.object({
  assetId: z.string().refine(isAssetId).optional(),
  mime: z.string().min(1).max(100),
  bytes: z.number().int().positive(),
  width: z.number().int().min(1).max(65_535),
  height: z.number().int().min(1).max(65_535),
  kind: z.enum(["image", "video", "gif"]).optional(),
  variants: z.array(z.enum(VARIANT_NAMES as [VariantName, ...VariantName[]])).max(12).optional(),
  phash: z.string().regex(/^[0-9a-fA-F]{16}$/).optional(),
  palette: paletteSchema.optional(),
});

export type AssetMeta = {
  mime: string;
  bytes: number;
  width: number;
  height: number;
  assetId?: string;
  kind: AssetKind;
  /** Variant files the client made (ascending, no duplicates). A request that lists none at all is a Phase 1 client: ["w1024"]. */
  variants: VariantName[];
  /** 16 lower-case hex characters. */
  phash?: string;
  /** The colour analysis ran on the client (possibly with no colours at all); absent = not analysed yet. */
  palette?: { hex: string; weight: number }[];
};
export type AssetMetaResult = { ok: true; meta: AssetMeta } | { ok: false; status: 400 | 413 | 415; error: string };

const isVideo = (mime: unknown): boolean => typeof mime === "string" && mime.startsWith("video/");

/**
 * Validates the body of POST /api/assets and /api/assets/:id/complete. Oversize wins over every other complaint
 * (images 50 MB, video 200 MB); then shape (400), type (415), kind-matches-type and variants-fit-the-image (400).
 */
export function parseAssetMeta(raw: unknown): AssetMetaResult {
  if (typeof raw !== "object" || raw === null) return { ok: false, status: 400, error: "bad-request" };
  const { bytes: claimed, mime: claimedMime } = raw as { bytes?: unknown; mime?: unknown };
  const limit = isVideo(claimedMime) ? MAX_VIDEO_BYTES : MAX_ASSET_BYTES;
  if (typeof claimed === "number" && claimed > limit) return { ok: false, status: 413, error: "too-large" };
  const parsed = metaSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, status: 400, error: "bad-request" };
  const d = parsed.data;

  const video = (ALLOWED_VIDEO_MIMES as readonly string[]).includes(d.mime);
  const image = (ALLOWED_IMAGE_MIMES as readonly string[]).includes(d.mime);
  if (!video && !image) return { ok: false, status: 415, error: "unsupported-type" };

  const kind: AssetKind = d.kind ?? (video ? "video" : "image");
  if (video !== (kind === "video")) return { ok: false, status: 400, error: "bad-request" };

  let variants: VariantName[] = ["w1024"];
  if (d.variants) {
    const plan = variantPlan(d.width, d.height);
    variants = VARIANT_NAMES.filter((n) => d.variants!.includes(n));
    if (variants.some((v) => !plan.includes(v))) return { ok: false, status: 400, error: "bad-request" };
  }

  const meta: AssetMeta = { mime: d.mime, bytes: d.bytes, width: d.width, height: d.height, kind, variants };
  if (d.assetId) meta.assetId = d.assetId;
  if (d.phash) meta.phash = d.phash.toLowerCase();
  if (d.palette) meta.palette = normalisePalette(d.palette);
  return { ok: true, meta };
}

/** The `assets.variants` jsonb for a finished upload: `{ w256: true, ..., original: { bytes } }`. */
export function variantsColumn(variants: readonly VariantName[], bytes: number): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const v of variants) out[v] = true;
  out.original = { bytes };
  return out;
}
