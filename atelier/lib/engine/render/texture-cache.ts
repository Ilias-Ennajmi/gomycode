// LRU cache of GPU textures under a byte budget. Generic over the texture type so it can be tested without a GPU.

type Entry<T> = { texture: T; bytes: number };

export class TextureCache<T = unknown> {
  private readonly entries = new Map<string, Entry<T>>(); // insertion order = recency (oldest first)
  private inUse: ReadonlySet<string> = new Set();
  private total = 0;

  /** `onEvict` is told about every texture that leaves the cache (destroy it there). */
  constructor(
    private readonly budgetBytes: number,
    private readonly onEvict?: (key: string, texture: T) => void,
  ) {}

  /** The texture, marked as most recently used. */
  get(key: string): T | undefined {
    const e = this.entries.get(key);
    if (!e) return undefined;
    this.entries.delete(key);
    this.entries.set(key, e);
    return e.texture;
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  set(key: string, texture: T, bytes: number): void {
    const prev = this.entries.get(key);
    if (prev) {
      this.total -= prev.bytes;
      this.entries.delete(key);
      if (prev.texture !== texture) this.onEvict?.(key, prev.texture);
    }
    const b = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
    this.entries.set(key, { texture, bytes: b });
    this.total += b;
  }

  /** Keys that must survive `evict()` (what is on screen). Replaces the previous set. */
  markInUse(keys: ReadonlySet<string>): void {
    this.inUse = keys;
  }

  /** Drop least recently used textures that are not in use until the total fits the budget. Returns the dropped keys. */
  evict(): string[] {
    const dropped: string[] = [];
    if (this.total <= this.budgetBytes) return dropped;
    for (const [key, e] of [...this.entries]) {
      if (this.total <= this.budgetBytes) break;
      if (this.inUse.has(key)) continue;
      this.entries.delete(key);
      this.total -= e.bytes;
      dropped.push(key);
      this.onEvict?.(key, e.texture);
    }
    return dropped;
  }

  /** Remove everything (context loss, destroy). */
  clear(): void {
    for (const [key, e] of this.entries) this.onEvict?.(key, e.texture);
    this.entries.clear();
    this.total = 0;
  }

  get bytes(): number {
    return this.total;
  }

  get size(): number {
    return this.entries.size;
  }
}
