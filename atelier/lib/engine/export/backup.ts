// `.atelier` backups: a ZIP holding the board's Yjs state, a manifest and the original of every picture and video. Importing
// one always makes a NEW board; nothing that exists is overwritten. The archive is treated as hostile on the way in: entry
// names are checked against a whitelist pattern before anything is read, counts and sizes are capped from the central
// directory, and every entry is inflated through a stream that stops at the size the directory declared.
import * as Y from "yjs";
import { z } from "zod";
import { DERIVED_ORIGIN, type BoardDoc } from "@/lib/engine/doc/board-doc";
import { docFromState } from "@/lib/engine/doc/from-state";
import { migrateBoard, SCHEMA_VERSION } from "@/lib/engine/model/migrate";
import type { PaletteColor, Provenance } from "@/lib/engine/model/types";
import { validateObject } from "@/lib/engine/model/validate";
import { newAssetId } from "@/lib/assets/asset-id";
import { abortError, emptySummary, type ExportSummary } from "./protocol";
import type { JobDeps } from "./raster";
import { readCentralDirectory, readEntry, ZipError, type ZipEntry } from "./zip-reader";
import { ZipWriter } from "./zip-writer";

export const ATELIER_FORMAT_VERSION = 1;

export interface AtelierManifestAsset {
  id: string;
  /** `assets/{id}/original.{ext}` */
  file: string;
  kind: "image" | "video" | "gif";
  mime: string;
  width: number;
  height: number;
  bytes: number;
  palette: PaletteColor[] | null;
  phash: string | null;
  title: string;
  provenance: Provenance | null;
}

export interface AtelierManifest {
  format: "atelier";
  version: 1;
  schemaVersion: number;
  boardTitle: string;
  createdAt: string;
  assets: AtelierManifestAsset[];
}

export const ENTRY_NAME = /^(manifest\.json|board\.ydoc|assets\/[A-Za-z0-9_-]{1,40}\/[A-Za-z0-9._-]{1,100})$/;

export const IMPORT_LIMITS = {
  manifestBytes: 1_000_000,
  ydocBytes: 50_000_000,
  entries: 20_000,
  totalUncompressedBytes: 4_000_000_000,
  /** Largest allowed ratio of declared size to stored size for a compressed entry. */
  maxRatio: 200,
} as const;

/** Limits on what a backup is made of (a file the browser could not hold is refused with an explanation). */
export const BACKUP_LIMITS = { perAssetBytes: 500 * 1024 * 1024, totalBytes: 2 * 1024 * 1024 * 1024 } as const;

export type ImportErrorCode = "not-atelier" | "newer-version" | "bad-entry-name" | "too-large" | "zip-bomb" | "corrupt";

export class ImportError extends Error {
  constructor(
    readonly code: ImportErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ImportError";
  }
}

// ---- writing ----------------------------------------------------------------------------------------------------------

/** What the worker needs to write a backup: plain data, no document. */
export interface BackupPlan {
  title: string;
  schemaVersion: number;
  /** `Y.encodeStateAsUpdate` of the board. */
  state: Uint8Array;
  assets: Omit<AtelierManifestAsset, "file" | "mime">[];
}

const assetIdsOf = (doc: BoardDoc): string[] => {
  const ids = new Set<string>();
  const add = (v: unknown) => {
    if (typeof v === "string" && v !== "") ids.add(v);
  };
  for (const o of doc.all()) {
    if (o.type === "image") add(o.assetId);
    else if (o.type === "video") {
      add(o.assetId);
      add(o.posterAssetId);
    } else if (o.type === "link") add(o.imageAssetId);
  }
  return [...ids];
};

export interface AssetInfo {
  kind: "image" | "video" | "gif";
  width: number;
  height: number;
  bytes: number;
  palette: PaletteColor[] | null;
  phash: string | null;
  title: string;
  provenance: Provenance | null;
}

/** The plan of a backup of `doc`: its state and what the asset metadata knows about each picture it uses. */
export function planBackup(doc: BoardDoc, meta: { get(id: string): AssetInfo | undefined }): BackupPlan {
  const assets = assetIdsOf(doc).map((id) => {
    const m = meta.get(id);
    return { id, kind: m?.kind ?? "image", width: m?.width ?? 1, height: m?.height ?? 1, bytes: m?.bytes ?? 0, palette: m?.palette ?? null, phash: m?.phash ?? null, title: m?.title ?? "", provenance: m?.provenance ?? null };
  });
  return { title: doc.meta.title, schemaVersion: doc.meta.schemaVersion, state: Y.encodeStateAsUpdate(doc.ydoc), assets };
}

export type FetchOriginal = (assetId: string) => Promise<{ blob: Blob; ext: string } | null>;

const safeExt = (ext: string): string => ext.replace(/[^A-Za-z0-9]/g, "").slice(0, 8) || "bin";
const MIME_BY_EXT: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", mp4: "video/mp4", webm: "video/webm" };

/** Write a backup. A picture whose original cannot be fetched is skipped and listed in `failedAssets`, not fatal. */
export async function writeBackup(
  plan: BackupPlan,
  d: JobDeps & { fetchOriginal: FetchOriginal; sink?: WritableStream<Uint8Array>; now?: () => Date },
): Promise<{ blob: Blob | null; summary: ExportSummary; fileCount: number }> {
  const check = () => {
    if (d.signal.aborted) throw abortError();
  };
  check();
  const zip = new ZipWriter({ sink: d.sink });
  const summary = emptySummary();
  const manifestAssets: AtelierManifestAsset[] = [];
  let total = 0;
  try {
    const n = plan.assets.length;
    for (let i = 0; i < n; i++) {
      check();
      const a = plan.assets[i];
      d.onProgress((i / Math.max(n, 1)) * 0.9, `Asset ${i + 1} of ${n}`);
      let got: Awaited<ReturnType<FetchOriginal>> = null;
      try {
        got = await d.fetchOriginal(a.id);
      } catch {
        got = null;
      }
      if (!got) {
        summary.failedAssets.push(a.id);
        continue;
      }
      if (got.blob.size > BACKUP_LIMITS.perAssetBytes || total + got.blob.size > BACKUP_LIMITS.totalBytes) {
        summary.failedAssets.push(a.id);
        summary.warnings.push(`A file was left out because the backup would be too large for this browser (${Math.round(got.blob.size / 1e6)} MB).`);
        continue;
      }
      const ext = safeExt(got.ext);
      const file = `assets/${a.id.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 40)}/original.${ext}`;
      await zip.addBlob(file, got.blob, { store: true, signal: d.signal });
      total += got.blob.size;
      manifestAssets.push({ ...a, file, mime: got.blob.type || MIME_BY_EXT[ext] || "application/octet-stream", bytes: got.blob.size });
    }
    check();
    const manifest: AtelierManifest = {
      format: "atelier",
      version: ATELIER_FORMAT_VERSION,
      schemaVersion: plan.schemaVersion,
      boardTitle: plan.title,
      createdAt: (d.now?.() ?? new Date()).toISOString(),
      assets: manifestAssets,
    };
    await zip.addBytes("manifest.json", JSON.stringify(manifest, null, 2), { signal: d.signal });
    await zip.addBytes("board.ydoc", plan.state, { signal: d.signal });
    d.onProgress(0.97, "Finishing");
    const blob = await zip.finish();
    d.onProgress(1, "Done");
    if (summary.failedAssets.length) summary.warnings.push(`${summary.failedAssets.length} file(s) could not be downloaded and are not in the backup.`);
    return { blob, summary, fileCount: manifestAssets.length };
  } catch (e) {
    await zip.abort();
    throw e;
  }
}

/** Plan and write a backup of a document in one call (tests; the app plans on the main thread and writes in the worker). */
export async function buildBackup(
  doc: BoardDoc,
  meta: { get(id: string): AssetInfo | undefined },
  d: JobDeps & { fetchOriginal: FetchOriginal },
): Promise<{ blob: Blob; summary: ExportSummary }> {
  const r = await writeBackup(planBackup(doc, meta), d);
  return { blob: r.blob!, summary: r.summary };
}

// ---- reading ----------------------------------------------------------------------------------------------------------

const point = z.object({ hex: z.string().max(9), weight: z.number() });
const manifestSchema = z.object({
  format: z.literal("atelier"),
  version: z.number().int().min(1),
  schemaVersion: z.number().int().min(1).max(1000),
  boardTitle: z.string().max(300),
  createdAt: z.string().max(64),
  assets: z
    .array(
      z.object({
        id: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/),
        file: z.string().max(200),
        kind: z.enum(["image", "video", "gif"]),
        mime: z.string().max(100),
        width: z.number().finite().positive(),
        height: z.number().finite().positive(),
        bytes: z.number().finite().nonnegative(),
        palette: z.array(point).max(64).nullable().catch(null),
        phash: z.string().max(200).nullable().catch(null),
        title: z.string().max(500).catch(""),
        provenance: z
          .object({
            sourceUrl: z.string().max(2048).nullable().catch(null),
            credit: z.string().max(500).catch(""),
            licence: z.string().max(300).catch(""),
            capturedAt: z.string().max(40).nullable().catch(null),
          })
          .nullable()
          .catch(null),
      }),
    )
    .max(IMPORT_LIMITS.entries),
});

export interface ParsedBackup {
  manifest: AtelierManifest;
  state: Uint8Array;
  /** Lazy readers of the asset files, by archive name. */
  entries: Map<string, () => Promise<Blob>>;
}

function validateDirectory(list: ZipEntry[]): void {
  if (list.length > IMPORT_LIMITS.entries) throw new ImportError("too-large", "That backup has too many files");
  const seen = new Set<string>();
  let total = 0;
  for (const e of list) {
    if (e.name.endsWith("/")) continue; // a folder entry carries nothing
    if (e.name.includes("..") || e.name.startsWith("/") || e.name.includes("\\") || e.name.includes("\u0000") || !ENTRY_NAME.test(e.name)) {
      throw new ImportError("bad-entry-name", "This file contains an entry that is not allowed, so it was not opened.");
    }
    if (seen.has(e.name)) throw new ImportError("bad-entry-name", "This file contains the same entry twice, so it was not opened.");
    seen.add(e.name);
    total += e.size;
    if (total > IMPORT_LIMITS.totalUncompressedBytes) throw new ImportError("zip-bomb", "This backup would unpack to far more data than it should, so it was not opened.");
    if (e.method === 8 && e.size > 0 && e.size / Math.max(e.compSize, 1) > IMPORT_LIMITS.maxRatio) throw new ImportError("zip-bomb", "This backup is compressed in a way that looks unsafe, so it was not opened.");
    if (e.name === "manifest.json" && e.size > IMPORT_LIMITS.manifestBytes) throw new ImportError("too-large", "The backup's manifest is too large.");
    if (e.name === "board.ydoc" && e.size > IMPORT_LIMITS.ydocBytes) throw new ImportError("too-large", "The backup's board data is too large.");
  }
}

function mapZip(e: unknown): never {
  if (e instanceof ImportError) throw e;
  if (e instanceof ZipError) {
    const code: ImportErrorCode = e.code === "not-zip" ? "not-atelier" : e.code === "truncated" ? "corrupt" : e.code;
    throw new ImportError(code, e.code === "not-zip" ? "That file is not an Atelier backup." : e.message);
  }
  throw e;
}

/**
 * Open a backup and check it. Nothing but the manifest and the board data is read; the asset files stay in the archive until
 * asked for. Throws ImportError with a code: not-atelier, newer-version, bad-entry-name, too-large, zip-bomb, corrupt.
 */
export async function parseBackup(file: Blob, d: { signal?: AbortSignal } = {}): Promise<ParsedBackup> {
  let list: ZipEntry[];
  try {
    list = await readCentralDirectory(file, { maxEntries: IMPORT_LIMITS.entries });
    validateDirectory(list);
  } catch (e) {
    mapZip(e);
  }
  const byName = new Map(list.map((e) => [e.name, e]));
  const read = async (name: string): Promise<Blob> => {
    const e = byName.get(name);
    if (!e) throw new ImportError("not-atelier", "That file is not an Atelier backup.");
    try {
      return await readEntry(file, e, { signal: d.signal });
    } catch (err) {
      return mapZip(err);
    }
  };
  if (!byName.has("manifest.json")) throw new ImportError("not-atelier", "That file is not an Atelier backup.");
  let raw: unknown;
  try {
    raw = JSON.parse(await (await read("manifest.json")).text());
  } catch (e) {
    if (e instanceof ImportError) throw e;
    throw new ImportError("not-atelier", "That file is not an Atelier backup.");
  }
  if (typeof raw === "object" && raw !== null && (raw as { format?: unknown }).format === "atelier" && typeof (raw as { version?: unknown }).version === "number" && (raw as { version: number }).version > ATELIER_FORMAT_VERSION) {
    throw new ImportError("newer-version", "Made by a newer version of Atelier. Update the app to open this backup.");
  }
  const parsed = manifestSchema.safeParse(raw);
  if (!parsed.success) throw new ImportError("not-atelier", "That file is not an Atelier backup.");
  const manifest = parsed.data as AtelierManifest;
  if (!byName.has("board.ydoc")) throw new ImportError("corrupt", "The backup has no board data.");
  const state = new Uint8Array(await (await read("board.ydoc")).arrayBuffer());
  const entries = new Map<string, () => Promise<Blob>>();
  for (const a of manifest.assets) {
    if (!ENTRY_NAME.test(a.file) || !a.file.startsWith("assets/") || !byName.has(a.file)) continue;
    entries.set(a.file, () => read(a.file));
  }
  return { manifest, state, entries };
}

// ---- importing --------------------------------------------------------------------------------------------------------

export interface ImportDeps {
  /** Make a new, empty board and return its id. */
  createBoard(title: string): Promise<string>;
  /** Put the board's state in place of the new board's (an update applied to the new, empty document). */
  writeBoardState(boardId: string, state: Uint8Array, title: string): Promise<void>;
  /** The upload pipeline: the picture gets its variants, palette and hash again, and a new asset id. */
  uploader: { addAssetOnly(file: Blob, opts?: { name?: string; provenance?: Provenance }): Promise<string> };
  /** Remove a board created by an import that failed half-way. Optional. */
  discardBoard?(boardId: string): Promise<void>;
}

export interface ImportResult {
  boardId: string;
  title: string;
  skippedObjects: number;
  failedAssets: string[];
}

const ASSET_FIELDS: Record<string, string[]> = { image: ["assetId"], video: ["assetId", "posterAssetId"], link: ["imageAssetId"] };
const CONCURRENCY = 3;

/**
 * Restore a backup as a new board. Pictures are added through the upload pipeline (new asset ids; the objects are remapped),
 * the board's objects are migrated to the current schema, an object that no longer validates is dropped and counted, and a
 * picture that could not be restored stays on the board as an "image unavailable" placeholder. Nothing existing is touched.
 */
export async function importBackup(file: Blob, deps: ImportDeps, d: Pick<JobDeps, "signal" | "onProgress">): Promise<ImportResult> {
  const check = () => {
    if (d.signal.aborted) throw abortError();
  };
  check();
  d.onProgress(0, "Reading the backup");
  const parsed = await parseBackup(file, { signal: d.signal });
  check();

  // pictures first, so cancelling here leaves no board behind
  const idMap = new Map<string, string>();
  const failed: string[] = [];
  const assets = parsed.manifest.assets;
  let done = 0;
  let next = 0;
  const worker = async () => {
    while (next < assets.length) {
      check();
      const a = assets[next++];
      const open = parsed.entries.get(a.file);
      try {
        if (!open) throw new Error("missing");
        const blob = await open();
        const name = `${a.title || "image"}.${a.file.split(".").pop() ?? "bin"}`.slice(0, 120);
        const typed = new File([blob], name, { type: a.mime });
        const id = await deps.uploader.addAssetOnly(typed, { name, ...(a.provenance ? { provenance: a.provenance } : {}) });
        idMap.set(a.id, id);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") throw e;
        if (d.signal.aborted) throw abortError();
        failed.push(a.id);
      }
      done++;
      d.onProgress(0.05 + (done / Math.max(assets.length, 1)) * 0.8, `Picture ${done} of ${assets.length}`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, assets.length) }, worker));
  check();

  // the board: migrate, validate, remap
  d.onProgress(0.88, "Restoring the board");
  const doc = docFromState(parsed.state);
  let skipped = 0;
  try {
    migrateBoard(doc);
    const objects = doc.ydoc.getMap<Y.Map<unknown>>("objects");
    const invalid: string[] = [];
    objects.forEach((m, id) => {
      if (!(m instanceof Y.Map)) {
        invalid.push(id);
        return;
      }
      const raw: Record<string, unknown> = {};
      m.forEach((v, k) => {
        if (k !== "content") raw[k] = v;
      });
      raw.id = id;
      if (!validateObject(raw)) invalid.push(id);
    });
    skipped = invalid.length;
    doc.transactAs(DERIVED_ORIGIN, () => {
      for (const id of invalid) objects.delete(id);
      objects.forEach((m) => {
        const fields = ASSET_FIELDS[String(m.get("type"))];
        if (!fields) return;
        for (const f of fields) {
          const old = m.get(f);
          if (typeof old !== "string" || old === "") continue;
          // restored, or a fresh unknown id: the picture shows as unavailable instead of pointing at someone else's asset
          m.set(f, idMap.get(old) ?? newAssetId());
        }
      });
    });
    check();
    const title = parsed.manifest.boardTitle.trim() || "Imported board";
    const state = Y.encodeStateAsUpdate(doc.ydoc);
    const boardId = await deps.createBoard(title);
    try {
      check();
      await deps.writeBoardState(boardId, state, title);
    } catch (e) {
      await deps.discardBoard?.(boardId).catch(() => {});
      throw e;
    }
    d.onProgress(1, "Done");
    return { boardId, title, skippedObjects: skipped, failedAssets: failed };
  } finally {
    doc.destroy();
  }
}

export { SCHEMA_VERSION };
