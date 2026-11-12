/**
 * Which embed on the board currently has its player loaded. At most one: activating another returns the first to its
 * facade, so a board of twenty videos never runs twenty players (and never contacts a provider until asked).
 */
type Listener = () => void;

class LiveEmbeds {
  private id: string | null = null;
  private readonly listeners = new Set<Listener>();

  get active(): string | null {
    return this.id;
  }
  activate(id: string): void {
    if (this.id === id) return;
    this.id = id;
    this.emit();
  }
  /** Return `id` to its facade; without an id, whichever embed is live. */
  deactivate(id?: string): void {
    if (this.id === null || (id !== undefined && this.id !== id)) return;
    this.id = null;
    this.emit();
  }
  subscribe = (cb: Listener): (() => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };
  private emit(): void {
    for (const l of [...this.listeners]) l();
  }
}

export const liveEmbeds = new LiveEmbeds();
