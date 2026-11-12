// The browser's side of the owner's share-link API: typed calls that never throw (a failure is a value with a readable
// message), the rounds feature-detect, and the list the dialog shows with optimistic revoke and delete that roll back.
// Plain TypeScript (no React) so it is tested in node. The one-time URL of a new link is handed back to the caller and is not
// kept here: nothing in this file stores, logs or caches it.
import type { ShareLinkSummary } from "./link";
import type { ShareLinkOptions } from "./options";
import type { RoundOption } from "./share-form";

export type Failure = { ok: false; status: number; message: string; fieldErrors?: Record<string, string> };
export type Result<T> = { ok: true; value: T } | Failure;

/** A sentence for the owner for each way the server can say no. Never a status code, a stack or a raw error name. */
export function describeShareFailure(status: number, body: unknown): string {
  const code = typeof (body as { error?: unknown } | null)?.error === "string" ? (body as { error: string }).error : "";
  if (status === 0) return "Can't connect to the server. Check your connection and try again.";
  if (status === 400 && code === "invalid-options") return "Check the options and try again.";
  if (status === 401) return code === "mfa-required" ? "Finish your second step (two-step verification) in Settings, then try again." : "You're signed out. Sign in again, then retry.";
  if (status === 403) return "The server refused that request. Reload the page and try again.";
  if (status === 404) return "That link or board no longer exists.";
  if (status === 409 && code === "too-many-links") return "This board already has 200 links. Delete some you no longer use.";
  if (status === 413) return "That request was too long to send.";
  if (status === 429) return "Too many attempts. Wait a moment and try again.";
  if (status === 503) return code === "local-only" ? "Sharing needs an account; this local server has none." : "Sharing isn't set up on this server yet.";
  return "Something went wrong on the server. Try again.";
}

export interface RoundsAnswer {
  /** False when the rounds API is not there (not built yet, or not usable here): the dialog then offers live links only. */
  available: boolean;
  /** Newest first. */
  rounds: RoundOption[];
}

export interface ShareClient {
  list(boardId: string): Promise<Result<ShareLinkSummary[]>>;
  /** `url` is the only place the token ever appears; the caller shows it once. */
  create(boardId: string, options: ShareLinkOptions): Promise<Result<{ link: ShareLinkSummary; url: string }>>;
  revoke(linkId: string): Promise<Result<ShareLinkSummary>>;
  remove(linkId: string): Promise<Result<void>>;
  rounds(boardId: string): Promise<RoundsAnswer>;
  /** Local-only mode: give the server the board's current state so its links have something to show. Best effort. */
  handOverLocalState(boardId: string, state: Uint8Array, title: string): Promise<void>;
}

type FetchFn = typeof fetch;

export function createShareClient(deps: { fetchFn?: FetchFn } = {}): ShareClient {
  const doFetch: FetchFn = deps.fetchFn ?? ((...a) => globalThis.fetch(...a));

  async function call<T>(url: string, init: RequestInit, ok: (body: unknown, status: number) => T): Promise<Result<T>> {
    let res: Response;
    try {
      res = await doFetch(url, init);
    } catch {
      return { ok: false, status: 0, message: describeShareFailure(0, null) };
    }
    let body: unknown = null;
    if (res.status !== 204) {
      try {
        body = await res.json();
      } catch {
        body = null;
      }
    }
    if (res.ok) return { ok: true, value: ok(body, res.status) };
    const errors = (body as { errors?: unknown } | null)?.errors;
    const fieldErrors = errors && typeof errors === "object" ? (errors as Record<string, string>) : undefined;
    return { ok: false, status: res.status, message: describeShareFailure(res.status, body), ...(fieldErrors ? { fieldErrors } : {}) };
  }

  const json = (method: string, body?: unknown): RequestInit => ({
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  return {
    list: (boardId) => call(`/api/boards/${encodeURIComponent(boardId)}/share-links`, { method: "GET" }, (b) => ((b as { links?: ShareLinkSummary[] })?.links ?? [])),
    create: (boardId, options) =>
      call(`/api/boards/${encodeURIComponent(boardId)}/share-links`, json("POST", options), (b) => b as { link: ShareLinkSummary; url: string }),
    revoke: (id) => call(`/api/share-links/${encodeURIComponent(id)}/revoke`, json("POST"), (b) => b as ShareLinkSummary),
    remove: (id) => call(`/api/share-links/${encodeURIComponent(id)}`, { method: "DELETE" }, () => undefined),

    async rounds(boardId) {
      const none: RoundsAnswer = { available: false, rounds: [] };
      try {
        const res = await doFetch(`/api/boards/${encodeURIComponent(boardId)}/rounds`, { method: "GET" });
        if (!res.ok) return none;
        const body: unknown = await res.json();
        const list = Array.isArray(body) ? body : (body as { rounds?: unknown } | null)?.rounds;
        if (!Array.isArray(list)) return none;
        const rounds: RoundOption[] = [];
        for (const r of list) {
          if (!r || typeof r !== "object") continue;
          const { id, number, label, publishedAt } = r as Record<string, unknown>;
          if (typeof id !== "string" || typeof number !== "number") continue;
          rounds.push({ id, number, label: typeof label === "string" ? label : "", publishedAt: typeof publishedAt === "string" ? publishedAt : "" });
        }
        rounds.sort((a, b) => b.number - a.number);
        return { available: true, rounds };
      } catch {
        return none;
      }
    },

    async handOverLocalState(boardId, state, title) {
      try {
        await doFetch(`/api/boards/${encodeURIComponent(boardId)}/local-state`, {
          method: "PUT",
          headers: { "content-type": "application/octet-stream", "x-atelier-title": encodeURIComponent(title.slice(0, 300)) },
          body: state as BodyInit,
        });
      } catch {
        /* best effort: the dialog still works, the link just has nothing to show until the next hand-over */
      }
    },
  };
}

// ---- the list --------------------------------------------------------------------------------------------------------

export interface LinksSnapshot {
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  links: readonly ShareLinkSummary[];
  /** Ids with a revoke or delete in flight. */
  busy: readonly string[];
}

export type ActionResult = { ok: true } | { ok: false; message: string };

/**
 * The links of one board as the dialog shows them. Revoke flips the row at once and delete removes it at once; when the
 * server says no the row goes back to exactly where and how it was, and the caller gets the message for a toast. Subscribe
 * with `useSyncExternalStore(m.subscribe, m.snapshot)`; `snapshot()` returns the same object until something changes.
 */
export class LinksModel {
  private state: LinksSnapshot = { status: "idle", error: null, links: [], busy: [] };
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly client: ShareClient,
    private readonly boardId: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  snapshot = (): LinksSnapshot => this.state;

  private set(patch: Partial<LinksSnapshot>): void {
    this.state = { ...this.state, ...patch };
    for (const l of [...this.listeners]) l();
  }

  async load(): Promise<void> {
    this.set({ status: "loading", error: null });
    const r = await this.client.list(this.boardId);
    if (r.ok) this.set({ status: "ready", links: r.value });
    else this.set({ status: "error", error: r.message, links: [] });
  }

  /** A link that was just created goes first (the list is newest first). */
  add(link: ShareLinkSummary): void {
    this.set({ links: [link, ...this.state.links.filter((l) => l.id !== link.id)] });
  }

  private replace(id: string, next: ShareLinkSummary): void {
    this.set({ links: this.state.links.map((l) => (l.id === id ? next : l)) });
  }
  private setBusy(id: string, on: boolean): void {
    this.set({ busy: on ? [...this.state.busy, id] : this.state.busy.filter((b) => b !== id) });
  }

  async revoke(id: string): Promise<ActionResult> {
    const before = this.state.links.find((l) => l.id === id);
    if (!before) return { ok: false, message: "That link is not in the list." };
    if (this.state.busy.includes(id)) return { ok: false, message: "Already in progress" };
    this.setBusy(id, true);
    this.replace(id, { ...before, status: "revoked", revokedAt: before.revokedAt ?? this.now().toISOString() });
    const r = await this.client.revoke(id);
    this.setBusy(id, false);
    if (r.ok) {
      this.replace(id, r.value);
      return { ok: true };
    }
    if (r.status === 404) this.set({ links: this.state.links.filter((l) => l.id !== id) });
    else this.replace(id, before);
    return { ok: false, message: r.message };
  }

  async remove(id: string): Promise<ActionResult> {
    const at = this.state.links.findIndex((l) => l.id === id);
    if (at < 0) return { ok: false, message: "That link is not in the list." };
    if (this.state.busy.includes(id)) return { ok: false, message: "Already in progress" };
    const before = this.state.links[at];
    this.setBusy(id, true);
    this.set({ links: this.state.links.filter((l) => l.id !== id) });
    const r = await this.client.remove(id);
    this.setBusy(id, false);
    if (r.ok || r.status === 404) return { ok: true };
    const links = [...this.state.links];
    links.splice(Math.min(at, links.length), 0, before);
    this.set({ links });
    return { ok: false, message: r.message };
  }
}
