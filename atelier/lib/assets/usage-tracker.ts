import type { BoardDoc } from "@/lib/engine/doc/board-doc";
import { isAssetId } from "./asset-id";

/**
 * The unique asset ids a board uses: an image's asset, a video's asset and its chosen poster, a link card's picture.
 * Ids that are not asset ids (empty, null, malformed) are left out: the server would refuse the whole list for one.
 */
export function collectAssetIds(doc: BoardDoc): string[] {
  const out = new Set<string>();
  const add = (v: unknown) => {
    if (isAssetId(v)) out.add(v);
  };
  for (const o of doc.all()) {
    if (o.type === "image") add(o.assetId);
    else if (o.type === "video") {
      add(o.assetId);
      add(o.posterAssetId);
    } else if (o.type === "link") add(o.imageAssetId);
  }
  return [...out];
}

export type UsageTrackerDeps = {
  doc: BoardDoc;
  boardId: string;
  api: { putUsage(boardId: string, assetIds: string[]): Promise<void> };
  /** Quiet time after the last change before the set is sent. Default 5000. */
  debounceMs?: number;
};

const key = (ids: readonly string[]) => [...ids].sort().join(",");

/**
 * Keeps the server's `asset_usages` rows for one board in step with the board: it sends the set of asset ids once the
 * board has been quiet for `debounceMs` after opening and after changes, and only when that set differs from the last set
 * the server accepted. A rejected send is owed: it is repeated after the next change or when the browser goes online.
 * Never throws, never runs two sends at once, and sends nothing after stop().
 */
export class UsageTracker {
  private readonly deps: UsageTrackerDeps;
  private readonly wait: number;
  private lastSent: string | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private off: (() => void) | null = null;
  private running = false;
  private inFlight: Promise<void> | null = null;
  private again = false;

  private readonly onOnline = () => this.schedule();

  constructor(deps: UsageTrackerDeps) {
    this.deps = deps;
    this.wait = deps.debounceMs ?? 5000;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.off = this.deps.doc.onChange(() => this.schedule());
    if (typeof window !== "undefined") window.addEventListener("online", this.onOnline);
    this.schedule();
  }

  stop(): void {
    this.running = false;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.off?.();
    this.off = null;
    if (typeof window !== "undefined") window.removeEventListener("online", this.onOnline);
  }

  /** Send now when the set differs from the last one sent. Resolves when that send (if any) has finished; never rejects. */
  flush(): Promise<void> {
    clearTimeout(this.timer);
    this.timer = undefined;
    return this.send();
  }

  private schedule(): void {
    if (!this.running) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.send();
    }, this.wait);
  }

  private send(): Promise<void> {
    if (this.inFlight) {
      this.again = true;
      return this.inFlight;
    }
    const ids = collectAssetIds(this.deps.doc);
    const k = key(ids);
    if (k === this.lastSent) return Promise.resolve();
    const run = (async () => {
      try {
        await this.deps.api.putUsage(this.deps.boardId, ids);
        this.lastSent = k;
      } catch {
        /* offline or refused: lastSent stays, so the next change or `online` tries again */
      }
    })();
    this.inFlight = run.finally(() => {
      this.inFlight = null;
      if (this.again) {
        this.again = false;
        if (this.running) this.schedule();
      }
    });
    return this.inFlight;
  }
}

/** The browser's side of PUT /api/boards/:id/assets. Rejects on any non-2xx answer so the tracker keeps the send owed. */
export function createUsageApi(fetchFn?: typeof fetch): UsageTrackerDeps["api"] {
  const f = fetchFn ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a));
  return {
    async putUsage(boardId, assetIds) {
      const res = await f(`/api/boards/${encodeURIComponent(boardId)}/assets`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assetIds }),
        keepalive: JSON.stringify(assetIds).length < 60_000,
      });
      if (!res.ok) throw new Error(`usage ${res.status}`);
    },
  };
}
