import { DERIVED_ORIGIN, type BoardDoc } from "@/lib/engine/doc/board-doc";
import { defaultsFor } from "@/lib/engine/model/defaults";
import type { PaletteColor, Point, Provenance } from "@/lib/engine/model/types";
import { newId } from "@/lib/ids";
import { backoffDelay } from "@/lib/sync/backoff";
import { idbDone, idbOpen, idbRequest } from "@/lib/sync/idb-util";
import { newAssetId } from "./asset-id";
import { createLimiter } from "./limiter";
import { fitWithin, type ProcessedImage } from "./pipeline-core";
import type { AssetResolverImpl, LocalInfo } from "./resolver";
import { isVariantName, VARIANT_NAMES, type VariantName } from "./variants";

export type { ProcessedImage } from "./pipeline-core";

const DB_NAME = "atelier-uploads";
const META = "uploads";
const BLOBS = "blobs";
/** Longest side of a freshly placed image on the canvas, in canvas units. */
export const DEFAULT_DISPLAY_SIDE = 320;
/** At most this many images are decoded and resized at once. */
export const PROCESS_CONCURRENCY = 3;
/** At most this many uploads (each: ask, PUT the files, complete) run at once. */
export const UPLOAD_CONCURRENCY = 4;

/** Statuses that will not get better by trying again: the request itself is wrong. */
const PERMANENT = new Set([400, 404, 409, 413, 415, 422]);

type AssetKind = "image" | "gif";
type Meta = {
  assetId: string;
  /** The canvas object created for it; null for an asset added without one (replace image, link card, Inbox). */
  objectId: string | null;
  name: string;
  mime: string;
  bytes: number;
  width: number;
  height: number;
  /** Absent in entries queued by Phase 1: one image, with a w1024 variant. */
  kind?: AssetKind;
  variants?: VariantName[];
  phash?: string | null;
  /** Colour analysis from the pipeline (an empty list = analysed, nothing to find); absent = not analysed. Sent on complete. */
  palette?: PaletteColor[] | null;
  /** The perceptual hash, always (unlike `phash`, which only canvas images send to look for a duplicate). Sent on complete. */
  hash?: string | null;
  provenance?: Provenance | null;
  createdAt: number;
};
type StoredVariant = { data: ArrayBuffer; type: string };
type StoredBlobs = {
  original: ArrayBuffer;
  originalType: string;
  variants?: Partial<Record<VariantName, StoredVariant>>;
  /** Phase 1 entries kept only the 1024 px variant, in these two fields. */
  w1024?: ArrayBuffer;
  w1024Type?: string;
};
type Blobs = { original: Blob; variants: Partial<Record<VariantName, Blob>> };

export type UploadState = "queued" | "uploading" | "failed";
export type UploadItem = { assetId: string; objectId: string | null; name: string; state: UploadState; attempts: number; error?: string };

class HttpError extends Error {
  constructor(readonly status: number, what: string) {
    super(`${what} failed (${status})`);
  }
}

type Item = UploadItem & {
  meta: Meta;
  /** Files already PUT ("original", "w256", ...): a retry skips them. */
  done: Set<string>;
  /** Waiting out a backoff: still pending, but not picked up yet. */
  waiting: boolean;
};

export type AssetUploaderOptions = {
  doc: BoardDoc;
  resolver: Pick<AssetResolverImpl, "registerLocal"> & Partial<Pick<AssetResolverImpl, "remember">>;
  /** Decode + variants. Defaults to the worker pipeline. */
  process?: (file: Blob) => Promise<ProcessedImage>;
  fetch?: typeof fetch;
  /** Waits between retries. Defaults to a timer that an `online` event cuts short. */
  delay?: (ms: number) => Promise<void>;
  dbName?: string;
  /** Longest side of the image object created for a new image. */
  displaySide?: number;
  /** Images decoded at once (default PROCESS_CONCURRENCY). */
  processConcurrency?: number;
  /** Uploads in flight at once (default UPLOAD_CONCURRENCY). */
  uploadConcurrency?: number;
  /**
   * Local-only mode (no server, no R2): images are kept as blobs in IndexedDB and shown from there; nothing is queued and
   * `/api/assets` is never called.
   */
  localOnly?: boolean;
};

/** Info for the resolver (and the metadata cache) from what the queue holds for an asset. */
function localInfo(meta: Meta, variants: VariantName[]): LocalInfo {
  return {
    kind: meta.kind ?? "image",
    width: meta.width,
    height: meta.height,
    bytes: meta.bytes,
    variants,
    mime: meta.mime,
    title: "",
    provenance: meta.provenance ?? null,
    phash: meta.hash ?? meta.phash ?? null,
    palette: meta.palette ?? null,
    analysisVersion: meta.palette ? 1 : 0,
  };
}

const orderedVariants = (v: Partial<Record<VariantName, unknown>>): VariantName[] => VARIANT_NAMES.filter((n) => v[n] !== undefined);

/**
 * Adds images to a board and uploads them in the background.
 *
 * add() decodes the file (at most PROCESS_CONCURRENCY at a time), makes the 256 / 1024 / 2048 px variants that are
 * smaller than the source, stores the bytes in IndexedDB (so a reload cannot lose them), puts the image on the canvas
 * straight away (its blob URL comes from the resolver) and queues the upload: ask the server for presigned URLs, PUT
 * the original and each variant to R2, then tell the server it is complete. Up to UPLOAD_CONCURRENCY uploads run at
 * once. Failures retry with exponential backoff (1 s up to 60 s); a request the server refuses outright (too large,
 * bad type) is marked failed and waits for retry().
 *
 * The asset id is made on the client, so the image object never needs rewriting when the upload finishes. (One
 * exception: the server may answer "this is a duplicate of asset X" when the file's perceptual hash and size match an
 * asset the owner already has; the image object is then pointed at X and nothing is uploaded.)
 */
export class AssetUploader {
  /** Resolves once the queue has been reloaded from IndexedDB. */
  readonly ready: Promise<void>;

  private readonly o: AssetUploaderOptions;
  private readonly queue = new Map<string, Item>();
  private readonly blobs = new Map<string, Blobs>();
  private readonly listeners = new Set<() => void>();
  private readonly limitProcessing: ReturnType<typeof createLimiter>;
  private readonly concurrency: number;
  private db: Promise<IDBDatabase | null>;
  private inFlight = 0;
  private disposed = false;
  private readonly wakers = new Set<() => void>();
  private readonly onOnline = () => {
    for (const w of [...this.wakers]) w();
  };

  constructor(opts: AssetUploaderOptions) {
    this.o = opts;
    this.limitProcessing = createLimiter(opts.processConcurrency ?? PROCESS_CONCURRENCY);
    this.concurrency = Math.max(1, Math.floor(opts.uploadConcurrency ?? UPLOAD_CONCURRENCY));
    this.db = idbOpen(opts.dbName ?? DB_NAME, (db) => {
      db.createObjectStore(META, { keyPath: "assetId" });
      db.createObjectStore(BLOBS);
    }).catch(() => null);
    if (typeof window !== "undefined") window.addEventListener("online", this.onOnline);
    this.ready = this.load();
  }

  /** Items not yet uploaded: waiting, in flight, or failed. */
  pending(): number {
    return this.queue.size;
  }

  /** Queue contents for an "Uploads" sheet. */
  items(): UploadItem[] {
    return [...this.queue.values()].map(({ assetId, objectId, name, state, attempts, error }) => ({ assetId, objectId, name, state, attempts, error }));
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  /** Resolves when nothing is waiting or in flight (failed uploads do not count). */
  whenIdle(): Promise<void> {
    if (this.active() === 0) return Promise.resolve();
    return new Promise((resolve) => {
      const off = this.subscribe(() => {
        if (this.active() === 0) {
          off();
          resolve();
        }
      });
    });
  }

  /** Put a failed upload (or all of them) back in the queue. */
  retry(assetId?: string): void {
    for (const it of this.queue.values()) {
      if (it.state === "failed" && (!assetId || it.assetId === assetId)) {
        it.state = "queued";
        it.attempts = 0;
        it.error = undefined;
        it.waiting = false;
      }
    }
    this.emit();
    this.pump();
  }

  /** Add an image file at a canvas point. Resolves with the new image object's id; rejects with ImageError for files we will not add. */
  async add(file: File, at: Point): Promise<string> {
    const { objectId } = await this.ingest(file, { name: file.name, at });
    return objectId as string;
  }

  /**
   * Add a file as an asset only: same pipeline, limits and queue as add(), but nothing is placed on the canvas (replace
   * image, link-card images, the Inbox). Resolves with the asset id as soon as the bytes are safe on this device.
   */
  async addAssetOnly(file: Blob, opts: { name?: string; provenance?: Provenance } = {}): Promise<string> {
    const { assetId } = await this.ingest(file, { name: opts.name ?? (file as File).name, provenance: opts.provenance });
    return assetId;
  }

  /**
   * Upload extra variants for an asset that is already complete on the server (the backfill of Phase 1 images). Asks for
   * upload URLs, PUTs each variant, then records them with PATCH /api/assets/:id. Throws on any failure.
   */
  async uploadVariants(
    assetId: string,
    info: { mime: string; bytes: number; width: number; height: number; kind?: "image" | "gif" },
    variants: Partial<Record<VariantName, Blob>>,
  ): Promise<void> {
    const names = orderedVariants(variants);
    if (names.length === 0) return;
    const f = this.fetcher();
    const created = await f("/api/assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetId, mime: info.mime, bytes: info.bytes, width: info.width, height: info.height, kind: info.kind ?? "image", variants: names }),
    });
    if (!created.ok) throw new HttpError(created.status, "Starting the upload");
    const { uploads } = (await created.json()) as { uploads?: Partial<Record<string, string>> };
    for (const name of names) {
      const url = uploads?.[name];
      if (typeof url !== "string") throw new HttpError(502, "Starting the upload");
      const r = await f(url, { method: "PUT", headers: { "Content-Type": "image/webp" }, body: variants[name] });
      if (!r.ok) throw new HttpError(r.status, `Uploading ${name}`);
    }
    const patched = await f(`/api/assets/${encodeURIComponent(assetId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ variants: Object.fromEntries(names.map((n) => [n, true])) }),
    });
    if (!patched.ok) throw new HttpError(patched.status, "Recording the variants");
  }

  /** Stop timers and listeners (tests, unmount). Queued items stay in IndexedDB for the next uploader. */
  dispose(): void {
    this.disposed = true;
    if (typeof window !== "undefined") window.removeEventListener("online", this.onOnline);
    for (const w of [...this.wakers]) w();
    this.listeners.clear();
  }

  // ---- internals -------------------------------------------------------------------------------------------

  private fetcher(): typeof fetch {
    return this.o.fetch ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a));
  }

  private async ingest(
    file: Blob,
    o: { name?: string; at?: Point; provenance?: Provenance },
  ): Promise<{ assetId: string; objectId: string | null }> {
    await this.ready;
    const process = this.o.process ?? (await import("./pipeline")).processImage;
    const processed = await this.limitProcessing(() => process(file));

    const assetId = newAssetId();
    const objectId = o.at ? newId() : null;
    const variants = orderedVariants(processed.variants);
    const meta: Meta = {
      assetId,
      objectId,
      name: o.name || "image",
      mime: processed.mime,
      bytes: processed.original.size,
      width: processed.width,
      height: processed.height,
      kind: processed.animated ? "gif" : "image",
      variants,
      // Only canvas images can be re-pointed at a duplicate, so only they send the hash.
      phash: objectId && processed.phash ? processed.phash : null,
      palette: processed.palette ?? null,
      hash: processed.phash ?? null,
      provenance: o.provenance ?? null,
      createdAt: Date.now(),
    };
    const blobs: Blobs = { original: processed.original, variants: processed.variants };

    // Durable first (best effort: a browser without IndexedDB still uploads from memory), then visible, then queued.
    await this.persist(meta, blobs);
    this.o.resolver.registerLocal(assetId, { ...blobs.variants, original: blobs.original }, localInfo(meta, variants));
    if (objectId && o.at) {
      const size = fitWithin(processed.width, processed.height, this.o.displaySide ?? DEFAULT_DISPLAY_SIDE);
      try {
        this.o.doc.create({
          ...defaultsFor("image"),
          id: objectId,
          assetId,
          x: o.at.x - size.w / 2,
          y: o.at.y - size.h / 2,
          w: size.w,
          h: size.h,
          provenance: o.provenance ?? null,
        });
      } catch (e) {
        await this.remove(assetId);
        throw e;
      }
    }
    if (this.o.localOnly) return { assetId, objectId }; // the blob in IndexedDB is the only copy; there is nothing to upload
    this.blobs.set(assetId, blobs);
    this.queue.set(assetId, { assetId, objectId, name: meta.name, state: "queued", attempts: 0, meta, done: new Set(), waiting: false });
    this.emit();
    this.pump();
    return { assetId, objectId };
  }

  private active(): number {
    let n = 0;
    for (const it of this.queue.values()) if (it.state !== "failed") n++;
    return n;
  }

  private emit(): void {
    for (const cb of [...this.listeners]) cb();
  }

  private async load(): Promise<void> {
    const db = await this.db;
    if (!db) return;
    try {
      const tx = db.transaction(META, "readonly");
      const metas = (await idbRequest(tx.objectStore(META).getAll())) as Meta[];
      metas.sort((a, b) => a.createdAt - b.createdAt);
      for (const meta of metas) {
        const blobs = await this.readBlobs(meta.assetId);
        // Entries queued by Phase 1 carry no variant list: whatever is stored is what there is.
        if (!meta.variants) meta.variants = blobs ? orderedVariants(blobs.variants) : [];
        if (!this.o.localOnly) {
          this.queue.set(meta.assetId, { assetId: meta.assetId, objectId: meta.objectId ?? null, name: meta.name, state: "queued", attempts: 0, meta, done: new Set(), waiting: false });
        }
        if (blobs) this.o.resolver.registerLocal(meta.assetId, { ...blobs.variants, original: blobs.original }, localInfo(meta, meta.variants));
      }
    } catch {
      /* unreadable queue: carry on with what we have */
    }
    if (this.queue.size) {
      this.emit();
      this.pump();
    }
  }

  private async persist(meta: Meta, blobs: Blobs): Promise<void> {
    const db = await this.db;
    if (!db) return;
    try {
      const stored: StoredBlobs = { original: await blobs.original.arrayBuffer(), originalType: blobs.original.type, variants: {} };
      for (const name of orderedVariants(blobs.variants)) {
        const b = blobs.variants[name]!;
        stored.variants![name] = { data: await b.arrayBuffer(), type: b.type };
      }
      const tx = db.transaction([META, BLOBS], "readwrite");
      tx.objectStore(META).put(meta);
      tx.objectStore(BLOBS).put(stored, meta.assetId);
      await idbDone(tx);
    } catch {
      /* quota or private mode: the upload still runs from memory */
    }
  }

  private async readBlobs(assetId: string): Promise<Blobs | null> {
    const cached = this.blobs.get(assetId);
    if (cached) return cached;
    const db = await this.db;
    if (!db) return null;
    try {
      const stored = (await idbRequest(db.transaction(BLOBS, "readonly").objectStore(BLOBS).get(assetId))) as StoredBlobs | undefined;
      if (!stored) return null;
      const blobs = blobsFromStored(stored);
      this.blobs.set(assetId, blobs);
      return blobs;
    } catch {
      return null;
    }
  }

  private async remove(assetId: string): Promise<void> {
    this.queue.delete(assetId);
    this.blobs.delete(assetId);
    const db = await this.db;
    if (!db) return;
    try {
      const tx = db.transaction([META, BLOBS], "readwrite");
      tx.objectStore(META).delete(assetId);
      tx.objectStore(BLOBS).delete(assetId);
      await idbDone(tx);
    } catch {
      /* the record will be retried (and found complete) after a reload */
    }
  }

  private sleep(ms: number): Promise<void> {
    if (this.o.delay) return this.o.delay(ms);
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(t);
        this.wakers.delete(done);
        resolve();
      };
      const t = setTimeout(done, ms);
      this.wakers.add(done);
    });
  }

  /** Start queued uploads until UPLOAD_CONCURRENCY are in flight. */
  private pump(): void {
    if (this.disposed) return;
    while (this.inFlight < this.concurrency) {
      const next = [...this.queue.values()].find((i) => i.state === "queued" && !i.waiting);
      if (!next) return;
      this.inFlight++;
      void this.attempt(next).finally(() => {
        this.inFlight--;
        this.pump();
      });
    }
  }

  private async attempt(it: Item): Promise<void> {
    it.state = "uploading";
    this.emit();
    try {
      await this.upload(it);
      await this.remove(it.assetId);
      this.emit();
    } catch (e) {
      if (this.disposed) return;
      const status = e instanceof HttpError ? e.status : undefined;
      it.error = e instanceof Error ? e.message : "upload failed";
      it.attempts++;
      if (status !== undefined && PERMANENT.has(status)) {
        it.state = "failed";
        this.emit();
        return;
      }
      it.state = "queued";
      it.waiting = true;
      this.emit();
      // Back off without holding an upload slot: other items keep going.
      void this.sleep(backoffDelay(it.attempts - 1)).then(() => {
        it.waiting = false;
        this.pump();
      });
    }
  }

  private async upload(it: Item): Promise<void> {
    const f = this.fetcher();
    const { meta } = it;
    const blobs = await this.readBlobs(it.assetId);
    if (!blobs) throw new HttpError(404, "Reading the stored image");
    const variants = meta.variants ?? orderedVariants(blobs.variants);
    const kind = meta.kind ?? "image";

    const created = await f("/api/assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assetId: meta.assetId,
        mime: meta.mime,
        bytes: meta.bytes,
        width: meta.width,
        height: meta.height,
        kind,
        variants,
        ...(meta.phash ? { phash: meta.phash } : {}),
      }),
    });
    if (!created.ok) throw new HttpError(created.status, "Starting the upload");
    const answer = (await created.json()) as { uploads?: Partial<Record<string, string>>; duplicateOf?: string | null };
    if (typeof answer.duplicateOf === "string" && answer.duplicateOf) {
      this.adoptDuplicate(it, answer.duplicateOf, variants);
      return;
    }
    const uploads = answer.uploads;
    if (typeof uploads?.original !== "string" || variants.some((v) => typeof uploads[v] !== "string")) {
      throw new HttpError(502, "Starting the upload");
    }

    if (!it.done.has("original")) {
      const r = await f(uploads.original, { method: "PUT", headers: { "Content-Type": meta.mime }, body: blobs.original });
      if (!r.ok) throw new HttpError(r.status, "Uploading the original");
      it.done.add("original");
    }
    for (const v of variants) {
      if (it.done.has(v)) continue;
      const r = await f(uploads[v] as string, { method: "PUT", headers: { "Content-Type": "image/webp" }, body: blobs.variants[v] });
      if (!r.ok) throw new HttpError(r.status, "Uploading the preview");
      it.done.add(v);
    }

    const done = await f(`/api/assets/${encodeURIComponent(meta.assetId)}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mime: meta.mime,
        bytes: meta.bytes,
        width: meta.width,
        height: meta.height,
        kind,
        variants,
        ...(meta.hash || meta.phash ? { phash: meta.hash ?? meta.phash } : {}),
        ...(meta.palette ? { palette: meta.palette } : {}),
      }),
    });
    if (!done.ok) throw new HttpError(done.status, "Finishing the upload");
  }

  /** The server already holds this file: point the image at it and drop our copy. */
  private adoptDuplicate(it: Item, existingId: string, variants: VariantName[]): void {
    const { doc } = this.o;
    const id = it.meta.objectId;
    const obj = id ? doc.get(id) : undefined;
    if (id && obj && obj.type === "image" && obj.assetId === it.assetId) {
      doc.transactAs(DERIVED_ORIGIN, () => doc.update(id, { assetId: existingId }));
    }
    // The duplicate has the same pixels, so it has the same variants; tell the resolver in case it knows nothing of it.
    this.o.resolver.remember?.({
      id: existingId,
      kind: it.meta.kind ?? "image",
      width: it.meta.width,
      height: it.meta.height,
      bytes: it.meta.bytes,
      variants,
      palette: it.meta.palette ?? null,
      phash: it.meta.hash ?? it.meta.phash ?? null,
      title: "",
      provenance: it.meta.provenance ?? null,
      analysisVersion: it.meta.palette ? 1 : 0,
    });
  }
}

function blobsFromStored(stored: StoredBlobs): Blobs {
  const variants: Partial<Record<VariantName, Blob>> = {};
  for (const [name, v] of Object.entries(stored.variants ?? {})) {
    if (isVariantName(name) && v) variants[name] = new Blob([v.data], { type: v.type });
  }
  if (stored.w1024 && !variants.w1024) variants.w1024 = new Blob([stored.w1024], { type: stored.w1024Type });
  return { original: new Blob([stored.original], { type: stored.originalType }), variants };
}

/**
 * Local-only home screen: makes the stored preview blobs of these assets available through the resolver, so board
 * cards can show their image mosaic after a reload (the editor registers them while a board is open, nothing else does).
 * Resolves with how many were found; never rejects.
 */
export async function registerStoredAssets(resolver: Pick<AssetResolverImpl, "registerLocal">, assetIds: string[], dbName: string = DB_NAME): Promise<number> {
  if (assetIds.length === 0) return 0;
  const db = await idbOpen(dbName, (d) => {
    d.createObjectStore(META, { keyPath: "assetId" });
    d.createObjectStore(BLOBS);
  }).catch(() => null);
  if (!db) return 0;
  let found = 0;
  try {
    for (const id of assetIds) {
      const stored = (await idbRequest(db.transaction(BLOBS, "readonly").objectStore(BLOBS).get(id))) as StoredBlobs | undefined;
      if (!stored) continue;
      const blobs = blobsFromStored(stored);
      // Previews are small; the original is only registered for an image with nothing bigger than a thumbnail.
      const hasPreview = blobs.variants.w1024 || blobs.variants.w2048;
      resolver.registerLocal(id, hasPreview ? { ...blobs.variants } : { ...blobs.variants, original: blobs.original });
      found++;
    }
  } catch {
    /* unreadable: the cards keep their paper tile */
  } finally {
    db.close();
  }
  return found;
}
