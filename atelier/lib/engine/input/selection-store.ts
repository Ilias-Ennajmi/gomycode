/**
 * The set of selected object ids. `ids` is an immutable snapshot that is replaced on every change, so it can be used
 * directly with useSyncExternalStore. Tools and commands write to it; overlays, the context bar and panels read it.
 */
export class SelectionStore {
  private current: ReadonlySet<string> = new Set();
  private readonly listeners = new Set<() => void>();

  get ids(): ReadonlySet<string> {
    return this.current;
  }

  get size(): number {
    return this.current.size;
  }

  has(id: string): boolean {
    return this.current.has(id);
  }

  /** Replace the selection. Does nothing (and does not notify) when the ids are the same. */
  set(ids: Iterable<string>): void {
    const next = new Set(ids);
    if (next.size === this.current.size && [...next].every((id) => this.current.has(id))) return;
    this.commit(next);
  }

  add(ids: Iterable<string>): void {
    this.set([...this.current, ...ids]);
  }

  toggle(id: string): void {
    const next = new Set(this.current);
    if (!next.delete(id)) next.add(id);
    this.commit(next);
  }

  clear(): void {
    if (this.current.size > 0) this.commit(new Set());
  }

  /** Drop ids that no longer exist (deleted, or removed by a remote edit). */
  prune(exists: (id: string) => boolean): void {
    const next = [...this.current].filter(exists);
    if (next.length !== this.current.size) this.set(next);
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private commit(next: ReadonlySet<string>): void {
    this.current = next;
    for (const cb of [...this.listeners]) cb();
  }
}
