import { PlaybackBudget } from "./playback-budget";

export type PlaybackState = "off" | "paused" | "playing";

/**
 * Which videos / GIFs on the open board are "live" (showing the real media instead of the poster) and whether they play.
 * At most `max` are live at a time (PlaybackBudget): activating another one sends the least recently used back to its
 * poster. Nothing starts by itself: a video becomes live only through activate() / toggle(), which come from a key press
 * or a button. Views read it with useSyncExternalStore (see VideoView); the selection bridge keeps `selected` in step.
 */
export class PlaybackStore {
  readonly budget: PlaybackBudget;
  private readonly states = new Map<string, "paused" | "playing">();
  private readonly elements = new Map<string, HTMLVideoElement>();
  private selected: ReadonlySet<string> = new Set();
  private readonly listeners = new Set<() => void>();
  private version = 0;

  constructor(max = 3) {
    this.budget = new PlaybackBudget(max, (id) => {
      this.states.delete(id);
      this.elements.delete(id);
    });
  }

  state(id: string): PlaybackState {
    return this.states.get(id) ?? "off";
  }

  /** Ids that are live, least recently used first. */
  activeIds(): string[] {
    return this.budget.active();
  }

  /** Make `id` live (a slot is taken, the oldest live one is evicted when full). */
  activate(id: string, opts: { play?: boolean } = {}): void {
    this.budget.request(id);
    this.states.set(id, opts.play === false ? "paused" : "playing");
    this.emit();
  }

  /** Back to the poster. */
  deactivate(id: string): void {
    this.budget.release(id);
    this.states.delete(id);
    this.elements.delete(id);
    this.emit();
  }

  deactivateAll(): void {
    for (const id of this.budget.active()) this.deactivate(id);
  }

  /** Enter / the Play button: start, then pause and resume. */
  toggle(id: string): void {
    const cur = this.state(id);
    if (cur === "off") this.activate(id);
    else this.setPlaying(id, cur !== "playing");
  }

  setPlaying(id: string, playing: boolean): void {
    if (!this.states.has(id)) return;
    const next = playing ? "playing" : "paused";
    if (this.states.get(id) === next) return;
    this.states.set(id, next);
    this.budget.request(id);
    this.emit();
  }

  setSelected(ids: Iterable<string>): void {
    this.selected = new Set(ids);
    this.emit();
  }

  isSelected(id: string): boolean {
    return this.selected.has(id);
  }

  /** The live <video> element of `id` (null when it shows its poster), for frame grabs. */
  attach(id: string, el: HTMLVideoElement | null): void {
    if (el) this.elements.set(id, el);
    else this.elements.delete(id);
  }

  element(id: string): HTMLVideoElement | null {
    return this.elements.get(id) ?? null;
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  /** Changes on every update; a snapshot for useSyncExternalStore of things that depend on several ids. */
  snapshot(): number {
    return this.version;
  }

  private emit(): void {
    this.version++;
    for (const cb of [...this.listeners]) cb();
  }
}

let shared: PlaybackStore | null = null;
/** The one store of the page. */
export function getPlaybackStore(): PlaybackStore {
  return (shared ??= new PlaybackStore(3));
}

/** Test hook. */
export function resetPlaybackStore(): void {
  shared = null;
}

/** Enter on a selected video: play, pause, resume. Returns true (the key was used). */
export function toggleVideoPlayback(id: string): boolean {
  const store = getPlaybackStore();
  // With "reduce motion" on, going live shows the poster paused: playing is then an explicit second step (Play button).
  if (store.state(id) === "off") store.activate(id, { play: !prefersReducedMotion() });
  else store.toggle(id);
  return true;
}

function prefersReducedMotion(): boolean {
  try {
    return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}
