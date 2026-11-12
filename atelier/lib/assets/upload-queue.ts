import type { BoardDoc } from "@/lib/engine/doc/board-doc";
import { defaultsFor } from "@/lib/engine/model/defaults";
import type { Point } from "@/lib/engine/model/types";
import { newId } from "@/lib/ids";
import { backoffDelay } from "@/lib/sync/backoff";
import { idbDone, idbOpen, idbRequest } from "@/lib/sync/idb-util";
import { newAssetId } from "./asset-id";
import { fitWithin, type ProcessedImage } from "./pipeline-core";
import type { AssetResolverImpl } from "./resolver";

export type { ProcessedImage } from "./pipeline-core";

const DB_NAME = "atelier-uploads";
const META = "uploads";
const BLOBS = "blobs";
/** Longest side of a freshly placed image on the canvas, in canvas units. */
export const DEFAULT_DISPLAY_SIDE = 320;

/** Statuses that will not get better by trying again: the request itself is wrong. */
const PERMANENT = new Set([400, 404, 409, 413, 415, 422]);

type Meta = {
  assetId: string;
  objectId: string;
  name: string;
  mime: string;
  bytes: number;
  width: number;
  height: number;
  createdAt: number;
};
type StoredBlobs = { original: ArrayBuffer; originalType: string; w1024: ArrayBuffer; w1024Type: string };
type Blobs = { original: Blob; w1024: Blob };

export type UploadState = "queued" | "uploading" | "failed";
export type UploadItem = { assetId: string; objectId: string; name: string; state: UploadState; attempts: number; error?: string };

class HttpError extends Error {
  constructor(readonly status: number, what: string) {
    super(`${what} failed (${status})`);
  }
}

type Item = UploadItem & { meta: Meta; putOriginal: boolean; putVariant: boolean };

export type AssetUploaderOptions = {
  doc: BoardDoc;
  resolver: Pick<AssetResolverImpl, "registerLocal">;
  /** Decode + variants. Defaults to the worker pipeline. */
  process?: (file: Blob) => Promise<ProcessedImage>;
  fetch?: typeof fetch;
  /** Waits between retries. Defaults to a timer that an `online` event cuts short. */
  delay?: (ms: number) => Promise<void>;
  dbName?: string;
  /** Longest side of the image object created for a new image. */
  displaySide?: number;
};

/**
 * Adds images to a board and uploads them in the background.
 *
 * add() decodes the file, stores the bytes in IndexedDB (so a reload cannot lose them), puts the image on the canvas
 * straight away (its blob URL comes from the resolver) and queues the upload: ask the server for presigned URLs,
 * PUT the original and the 1024 px variant to R2, then tell the server it is complete. Failures retry with exponential
 * backoff (1 s up to 60 s); a request the server refuses outright (too large, bad type) is marked failed and waits for retry().
 *
 * The asset id is made on the client, so the image object never needs rewriting when the upload finishes.
 */
export class AssetUploader {
  /** Resolves once the queue has been reloaded from IndexedDB. */
  readonly ready: Promise<void>;

  private readonly o: AssetUploaderOptions;
  private readonly queue = new Map<string, Item>();
  private readonly blobs = new Map<string, Blobs>();
  private readonly listeners = new Set<() => void>();
  private db: Promise<IDBDatabase | null>;
  private draining = false;
  private disposed = false;
  private wake: (() => void) | null = null;
  private readonly onOnline = () => this.wake?.();

  constructor(opts: AssetUploaderOptions) {
    this.o = opts;
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
      }
    }
    this.emit();
    void this.drain();
  }

  /** Add an image file at a canvas point. Resolves with the new image object's id; rejects with ImageError for files we will not add. */
  async add(file: File, at: Point): Promise<string> {
    await this.ready;
    const processed = await (this.o.process ?? (await import("./pipeline")).processImage)(file);

    const assetId = newAssetId();
    const objectId = newId();
    const meta: Meta = {
      assetId,
      objectId,
      name: file.name || "image",
      mime: processed.mime,
      bytes: processed.original.size,
      width: processed.width,
      height: processed.height,
      createdAt: Date.now(),
    };
    const blobs: Blobs = { original: processed.original, w1024: processed.variants.w1024 };

    // Durable first (best effort: a browser without IndexedDB still uploads from memory), then visible, then queued.
    await this.persist(meta, blobs);
    this.o.resolver.registerLocal(assetId, blobs);
    const size = fitWithin(processed.width, processed.height, this.o.displaySide ?? DEFAULT_DISPLAY_SIDE);
    try {
      this.o.doc.create({
        ...defaultsFor("image"),
        id: objectId,
        assetId,
        x: at.x - size.w / 2,
        y: at.y - size.h / 2,
        w: size.w,
        h: size.h,
      });
    } catch (e) {
      await this.remove(assetId);
      throw e;
    }
    this.blobs.set(assetId, blobs);
    this.queue.set(assetId, { assetId, objectId, name: meta.name, state: "queued", attempts: 0, meta, putOriginal: false, putVariant: false });
    this.emit();
    void this.drain();
    return objectId;
  }

  /** Stop timers and listeners (tests, unmount). Queued items stay in IndexedDB for the next uploader. */
  dispose(): void {
    this.disposed = true;
    if (typeof window !== "undefined") window.removeEventListener("online", this.onOnline);
    this.wake?.();
    this.listeners.clear();
  }

  // ---- internals -------------------------------------------------------------------------------------------

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
        this.queue.set(meta.assetId, { assetId: meta.assetId, objectId: meta.objectId, name: meta.name, state: "queued", attempts: 0, meta, putOriginal: false, putVariant: false });
        const blobs = await this.readBlobs(meta.assetId);
        if (blobs) this.o.resolver.registerLocal(meta.assetId, blobs);
      }
    } catch {
      /* unreadable queue: carry on with what we have */
    }
    if (this.queue.size) {
      this.emit();
      void this.drain();
    }
  }

  private async persist(meta: Meta, blobs: Blobs): Promise<void> {
    const db = await this.db;
    if (!db) return;
    try {
      const stored: StoredBlobs = {
        original: await blobs.original.arrayBuffer(),
        originalType: blobs.original.type,
        w1024: await blobs.w1024.arrayBuffer(),
        w1024Type: blobs.w1024.type,
      };
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
      const blobs = {
        original: new Blob([stored.original], { type: stored.originalType }),
        w1024: new Blob([stored.w1024], { type: stored.w1024Type }),
      };
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
        this.wake = null;
        resolve();
      };
      const t = setTimeout(done, ms);
      this.wake = done;
    });
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      for (;;) {
        if (this.disposed) return;
        const next = [...this.queue.values()].find((i) => i.state === "queued");
        if (!next) return;
        await this.attempt(next);
      }
    } finally {
      this.draining = false;
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
      this.emit();
      await this.sleep(backoffDelay(it.attempts - 1));
    }
  }

  private async upload(it: Item): Promise<void> {
    const f = this.o.fetch ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a));
    const { meta } = it;
    const blobs = await this.readBlobs(it.assetId);
    if (!blobs) throw new HttpError(404, "Reading the stored image");

    const created = await f("/api/assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetId: meta.assetId, mime: meta.mime, bytes: meta.bytes, width: meta.width, height: meta.height }),
    });
    if (!created.ok) throw new HttpError(created.status, "Starting the upload");
    const { uploads } = (await created.json()) as { uploads?: { original?: string; w1024?: string } };
    if (typeof uploads?.original !== "string" || typeof uploads.w1024 !== "string") throw new HttpError(502, "Starting the upload");

    if (!it.putOriginal) {
      const r = await f(uploads.original, { method: "PUT", headers: { "Content-Type": meta.mime }, body: blobs.original });
      if (!r.ok) throw new HttpError(r.status, "Uploading the original");
      it.putOriginal = true;
    }
    if (!it.putVariant) {
      const r = await f(uploads.w1024, { method: "PUT", headers: { "Content-Type": "image/webp" }, body: blobs.w1024 });
      if (!r.ok) throw new HttpError(r.status, "Uploading the preview");
      it.putVariant = true;
    }

    const done = await f(`/api/assets/${encodeURIComponent(meta.assetId)}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mime: meta.mime, bytes: meta.bytes, width: meta.width, height: meta.height }),
    });
    if (!done.ok) throw new HttpError(done.status, "Finishing the upload");
  }
}
