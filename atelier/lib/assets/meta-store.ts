import type { PaletteColor, Provenance } from "@/lib/engine/model/types";
import { idbDone, idbOpen, idbRequest } from "@/lib/sync/idb-util";
import { isVariantName, type VariantName } from "./variants";

/** What the client knows about one asset (cached in IndexedDB; the server's `assets` row is the source of truth). */
export interface AssetMeta {
  id: string;
  kind: "image" | "video" | "gif";
  width: number;
  height: number;
  bytes: number;
  variants: VariantName[];
  palette: PaletteColor[] | null;
  phash: string | null;
  title: string;
  provenance: Provenance | null;
  analysisVersion: number;
}

const DB_NAME = "atelier-assets";
const STORE = "assets";

const finitePositive = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;

/** A stored row, or null when it is not usable (a stale or damaged cache entry is dropped, never trusted). */
function normalise(row: unknown): AssetMeta | null {
  if (typeof row !== "object" || row === null) return null;
  const r = row as Record<string, unknown>;
  if (typeof r.id !== "string" || r.id === "") return null;
  if (r.kind !== "image" && r.kind !== "video" && r.kind !== "gif") return null;
  if (!finitePositive(r.width) || !finitePositive(r.height)) return null;
  return {
    id: r.id,
    kind: r.kind,
    width: r.width,
    height: r.height,
    bytes: typeof r.bytes === "number" && Number.isFinite(r.bytes) && r.bytes >= 0 ? r.bytes : 0,
    variants: Array.isArray(r.variants) ? r.variants.filter(isVariantName) : [],
    palette: Array.isArray(r.palette) ? (r.palette as PaletteColor[]) : null,
    phash: typeof r.phash === "string" ? r.phash : null,
    title: typeof r.title === "string" ? r.title : "",
    provenance: typeof r.provenance === "object" && r.provenance !== null ? (r.provenance as Provenance) : null,
    analysisVersion: typeof r.analysisVersion === "number" && Number.isFinite(r.analysisVersion) ? r.analysisVersion : 0,
  };
}

/**
 * In-memory map of asset metadata, mirrored to IndexedDB (`atelier-assets`) so a returning visit knows every asset's
 * size and variants before any network call. Writes never block and never throw: without IndexedDB it is memory only.
 */
export class AssetMetaStore {
  private readonly map = new Map<string, AssetMeta>();
  private readonly listeners = new Set<(ids: string[]) => void>();
  private readonly persist: boolean;
  private readonly dbName: string;
  private db: Promise<IDBDatabase | null> | null = null;
  private readonly dirty = new Set<string>();
  private writing: Promise<void> = Promise.resolve();

  constructor(opts: { dbName?: string; persist?: boolean } = {}) {
    this.dbName = opts.dbName ?? DB_NAME;
    this.persist = opts.persist ?? true;
  }

  get(id: string): AssetMeta | undefined {
    return this.map.get(id);
  }

  getMany(ids: string[]): Map<string, AssetMeta> {
    const out = new Map<string, AssetMeta>();
    for (const id of ids) {
      const m = this.map.get(id);
      if (m) out.set(id, m);
    }
    return out;
  }

  /** Store (or replace) one asset's metadata. Subscribers are told only when something actually changed. */
  put(m: AssetMeta): void {
    const prev = this.map.get(m.id);
    if (prev && JSON.stringify(prev) === JSON.stringify(m)) return;
    this.map.set(m.id, m);
    if (this.persist) {
      this.dirty.add(m.id);
      this.writing = this.writing.then(() => this.writeDirty());
    }
    for (const cb of [...this.listeners]) cb([m.id]);
  }

  /** Called with the ids whose metadata changed. Returns the unsubscribe function. */
  subscribe(cb: (ids: string[]) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  /** Load what IndexedDB holds. Entries already in memory win (they are newer). Never rejects. */
  async hydrate(): Promise<void> {
    if (!this.persist) return;
    const db = await this.open();
    if (!db) return;
    try {
      const rows = (await idbRequest(db.transaction(STORE, "readonly").objectStore(STORE).getAll())) as unknown[];
      const loaded: string[] = [];
      for (const row of rows) {
        const m = normalise(row);
        if (!m || this.map.has(m.id)) continue;
        this.map.set(m.id, m);
        loaded.push(m.id);
      }
      if (loaded.length) for (const cb of [...this.listeners]) cb(loaded);
    } catch {
      /* unreadable cache: start empty */
    }
  }

  /** Resolves when every write so far has reached IndexedDB (tests, before unload). Never rejects. */
  async flush(): Promise<void> {
    await this.writing;
  }

  private open(): Promise<IDBDatabase | null> {
    this.db ??= idbOpen(this.dbName, (db) => {
      db.createObjectStore(STORE, { keyPath: "id" });
    }).catch(() => null);
    return this.db;
  }

  private async writeDirty(): Promise<void> {
    if (this.dirty.size === 0) return;
    const ids = [...this.dirty];
    this.dirty.clear();
    const db = await this.open();
    if (!db) return;
    try {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      for (const id of ids) {
        const m = this.map.get(id);
        if (m) store.put(m);
      }
      await idbDone(tx);
    } catch {
      /* quota or private mode: memory still has it */
    }
  }
}

let shared: AssetMetaStore | null = null;
/** The one metadata store the whole app shares. */
export function getAssetMetaStore(): AssetMetaStore {
  return (shared ??= new AssetMetaStore());
}
