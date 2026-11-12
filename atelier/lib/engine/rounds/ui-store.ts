// "Open the publish dialog / the compare view" requests, from commands and menus to the component that renders them. A tiny
// external store (like the link retry store) so a command needs no React context and the editor provider stays untouched.
export type RoundsRequest = { kind: "publish" } | { kind: "compare"; a?: string; b?: string };

type Listener = () => void;

class RoundsUi {
  private value: RoundsRequest | null = null;
  private readonly listeners = new Set<Listener>();

  get current(): RoundsRequest | null {
    return this.value;
  }
  open(request: RoundsRequest): void {
    this.value = request;
    this.emit();
  }
  close(): void {
    if (this.value === null) return;
    this.value = null;
    this.emit();
  }
  subscribe = (cb: Listener): (() => void) => {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  };
  private emit(): void {
    for (const cb of [...this.listeners]) cb();
  }
}

export const roundsUi = new RoundsUi();
