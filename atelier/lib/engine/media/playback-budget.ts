/**
 * How many videos / GIFs may be playing at once. A request when the budget is full evicts the least recently requested
 * id (and says so through `onEvict`, so its view can fall back to the poster); asking again for an id that already
 * holds a slot only refreshes its recency. Pure bookkeeping: nothing here touches the DOM.
 */
export class PlaybackBudget {
  private readonly max: number;
  /** Oldest request first. */
  private order: string[] = [];

  constructor(
    max = 3,
    private readonly onEvict?: (id: string) => void,
  ) {
    this.max = Number.isFinite(max) && max >= 1 ? Math.floor(max) : 1;
  }

  /** Take (or keep) a slot for `id`. Always succeeds: when full, the least recently requested id gives its slot up. */
  request(id: string): boolean {
    const at = this.order.indexOf(id);
    if (at >= 0) this.order.splice(at, 1);
    this.order.push(id);
    while (this.order.length > this.max) {
      const out = this.order.shift()!;
      this.onEvict?.(out);
    }
    return true;
  }

  release(id: string): void {
    const at = this.order.indexOf(id);
    if (at >= 0) this.order.splice(at, 1);
  }

  /** Ids holding a slot, least recently requested first. */
  active(): string[] {
    return [...this.order];
  }
}
