// Counts pictures that are still loading in a live layer, so the layer can be shown (and the preview underneath it dropped)
// only when nothing is left to pop in. A timeout stops a stuck request from keeping the preview on screen for ever.
export class LoadTracker {
  private pending = 0;
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private forced = false;

  constructor(private readonly timeoutMs = 2500) {}

  start(): void {
    this.pending++;
    this.arm();
  }
  done(): void {
    this.pending = Math.max(0, this.pending - 1);
    this.emit();
  }
  /** True when nothing is loading (or the timeout passed). */
  get idle(): boolean {
    return this.pending === 0 || this.forced;
  }
  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  };
  getSnapshot = (): boolean => this.idle;

  private arm(): void {
    if (this.timer !== null) return;
    this.timer = setTimeout(() => {
      this.forced = true;
      this.timer = null;
      this.emit();
    }, this.timeoutMs);
  }
  private emit(): void {
    if (this.pending === 0 && this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    for (const l of [...this.listeners]) l();
  }
  dispose(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.listeners.clear();
  }
}
