import type { AssetUploader } from "./upload-queue";
import type { AssetResolverImpl } from "./resolver";
import { VARIANT_NAMES, variantPlan, type VariantName } from "./variants";
import type { ProcessedImage } from "./pipeline-core";

export type BackfillDeps = {
  resolver: Pick<AssetResolverImpl, "url" | "available" | "meta">;
  uploader: Pick<AssetUploader, "uploadVariants">;
  /** Defaults to the global fetch. */
  fetch?: typeof fetch;
  /** Decode + variants. Defaults to the pipeline (worker). */
  process?: (file: Blob) => Promise<ProcessedImage>;
};

// One asset at a time, across every caller: decoding a 40 MP original is heavy.
let tail: Promise<unknown> = Promise.resolve();

/**
 * An image uploaded before the 256 / 2048 px variants existed (or before this device knew them) has only w1024: fetch its
 * original, make the variants the plan says it should have, upload them and record them (PATCH /api/assets/:id).
 * A no-op when the asset's metadata is unknown, nothing is missing, it is not an image, or the browser is offline.
 * Calls are serialised; throws when the original cannot be fetched or an upload fails (the metadata is left as it was,
 * so a later call tries again).
 */
export function ensureVariants(assetId: string, deps: BackfillDeps): Promise<void> {
  const run = tail.then(() => work(assetId, deps));
  tail = run.catch(() => {});
  return run;
}

async function work(assetId: string, deps: BackfillDeps): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  const { resolver } = deps;
  const known = resolver.available(assetId);
  const stored = resolver.meta.get(assetId);
  if (!known || !stored || stored.kind === "video") return;
  const missing = variantPlan(known.width, known.height).filter((v) => !known.variants.includes(v));
  if (missing.length === 0) return;

  const originalUrl = resolver.url(assetId, "original");
  if (!originalUrl) return;
  const f = deps.fetch ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a));
  const res = await f(originalUrl);
  if (!res.ok) throw new Error(`Fetching the original failed (${res.status})`);
  const original = await res.blob();

  const process = deps.process ?? (await import("./pipeline")).processImage;
  const processed = await process(original);
  const picked: Partial<Record<VariantName, Blob>> = {};
  for (const v of missing) {
    const blob = processed.variants[v];
    if (blob) picked[v] = blob;
  }
  if (Object.keys(picked).length === 0) return;

  await deps.uploader.uploadVariants(
    assetId,
    // The size on file (not the decoded one) so the server's plan check agrees with the row it holds.
    { mime: original.type || "image/jpeg", bytes: original.size, width: known.width, height: known.height, kind: stored.kind === "gif" ? "gif" : "image" },
    picked,
  );
  const have = new Set<VariantName>([...known.variants, ...(Object.keys(picked) as VariantName[])]);
  resolver.meta.put({ ...stored, variants: VARIANT_NAMES.filter((v) => have.has(v)) });
}

/**
 * Backfill `assetIds` one after another, each when the browser is idle (requestIdleCallback with a 2 s timeout, or a
 * short timer where that does not exist). Failures go to `onError` and the next asset still runs.
 */
export function scheduleBackfill(
  assetIds: string[],
  deps: BackfillDeps,
  opts: { idle?: (fn: () => void) => void; onError?: (e: unknown) => void } = {},
): { cancel(): void; finished: Promise<void> } {
  let cancelled = false;
  const idle =
    opts.idle ??
    ((fn: () => void) => {
      if (typeof requestIdleCallback === "function") requestIdleCallback(() => fn(), { timeout: 2000 });
      else setTimeout(fn, 200);
    });
  const finished = (async () => {
    for (const id of assetIds) {
      await new Promise<void>((resolve) => idle(resolve));
      if (cancelled) return;
      try {
        await ensureVariants(id, deps);
      } catch (e) {
        opts.onError?.(e);
      }
    }
  })();
  return { cancel: () => void (cancelled = true), finished };
}
