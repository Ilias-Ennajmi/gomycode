import type { AssetUploader } from "./upload-queue";
import type { AssetResolverImpl } from "./resolver";
import { VARIANT_NAMES, variantPlan, type VariantName } from "./variants";
import type { Analysis, ProcessedImage } from "./pipeline-core";
import type { AssetMetaStore } from "./meta-store";
import type { AssetResolver } from "./resolver-types";

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

// ---- colour analysis of assets that have none ----------------------------------------------------------------------------

export type AnalysisDeps = {
  /** Where the image comes from: the 256 px variant when there is one, else w1024, else the original. */
  resolver: Pick<AssetResolver, "url">;
  /** Read for what is known about the asset, updated with the result (subscribers are told). */
  meta: AssetMetaStore;
  /** Defaults to the global fetch. */
  fetch?: typeof fetch;
  /** Decode + analyse. Defaults to the pipeline (worker). */
  analyse?: (file: Blob) => Promise<Analysis>;
  /** Aborts the download in flight (scheduleAnalysis().cancel()). */
  signal?: AbortSignal;
};

// One analysis at a time, across every caller (it decodes an image).
let analysisTail: Promise<unknown> = Promise.resolve();

/**
 * Ids (in the order given, each once) of the images whose colour analysis has not been done: palette and perceptual hash
 * are missing (`analysisVersion` 0). Videos and assets the metadata store knows nothing about are left out.
 */
export function pendingAnalysisIds(meta: AssetMetaStore, assetIds: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of assetIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const m = meta.get(id);
    if (m && m.kind !== "video" && m.analysisVersion < 1) out.push(id);
  }
  return out;
}

/**
 * An image uploaded before Phase 2 (or whose upload could not analyse it) has no palette or hash: fetch its small variant,
 * analyse it (in the worker), record the result with PATCH /api/assets/:id and in the metadata store.
 * A no-op when the metadata is unknown, the asset is a video or already analysed (analysisVersion 1), or the browser is
 * offline. Calls are serialised. Throws when the image cannot be fetched or analysed, or the PATCH fails; the colours found
 * are kept locally in that last case, so a retry only repeats the PATCH. Local-only mode (the route answers 503) has no
 * server to tell, so the result counts as done; a 404 means the server does not know the asset (yet).
 */
export function ensureAnalysis(assetId: string, deps: AnalysisDeps): Promise<void> {
  const run = analysisTail.then(() => analyseWork(assetId, deps));
  analysisTail = run.catch(() => {});
  return run;
}

async function analyseWork(assetId: string, deps: AnalysisDeps): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  if (deps.signal?.aborted) return;
  const stored = deps.meta.get(assetId);
  if (!stored || stored.kind === "video" || stored.analysisVersion >= 1) return;

  let found: Analysis | null = stored.palette && stored.phash ? { palette: stored.palette, phash: stored.phash } : null;
  if (!found) {
    const url = deps.resolver.url(assetId, "w256");
    if (!url) return;
    const f = deps.fetch ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a));
    const res = await f(url, { signal: deps.signal });
    if (!res.ok) throw new Error(`Fetching the image failed (${res.status})`);
    const blob = await res.blob();
    if (deps.signal?.aborted) return;
    const analyse = deps.analyse ?? (await import("./pipeline")).analyseImage;
    found = await analyse(blob);
    if (deps.signal?.aborted) return;
    // Keep what was found even if the server cannot be told right now.
    deps.meta.put({ ...(deps.meta.get(assetId) ?? stored), palette: found.palette, phash: found.phash });
  }

  const f = deps.fetch ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a));
  const patched = await f(`/api/assets/${encodeURIComponent(assetId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ palette: found.palette, phash: found.phash, analysisVersion: 1 }),
    signal: deps.signal,
  });
  const current = deps.meta.get(assetId) ?? stored;
  if (patched.ok || patched.status === 503) {
    deps.meta.put({ ...current, palette: found.palette, phash: found.phash, analysisVersion: 1 });
    return;
  }
  if (patched.status === 404) return; // the server has not seen this asset (its upload is still pending)
  throw new Error(`Recording the colours failed (${patched.status})`);
}

/**
 * Analyse `assetIds` one after another, each when the browser is idle (requestIdleCallback with a 2 s timeout, or a short
 * timer where that does not exist). Failures go to `onError` and the next asset still runs. `cancel()` stops after the
 * current step and aborts a download in flight; a cancelled job reports no error.
 */
export function scheduleAnalysis(
  assetIds: string[],
  deps: Omit<AnalysisDeps, "signal">,
  opts: { idle?: (fn: () => void) => void; onError?: (e: unknown) => void } = {},
): { cancel(): void; finished: Promise<void> } {
  const controller = new AbortController();
  const idle = opts.idle ?? defaultIdle;
  const finished = (async () => {
    for (const id of assetIds) {
      await new Promise<void>((resolve) => idle(resolve));
      if (controller.signal.aborted) return;
      try {
        await ensureAnalysis(id, { ...deps, signal: controller.signal });
      } catch (e) {
        if (controller.signal.aborted) return;
        opts.onError?.(e);
      }
    }
  })();
  return { cancel: () => controller.abort(), finished };
}

function defaultIdle(fn: () => void): void {
  if (typeof requestIdleCallback === "function") requestIdleCallback(() => fn(), { timeout: 2000 });
  else setTimeout(fn, 200);
}
