// The browser's side of the rounds and history routes. Every method takes a fetch (default: the page's) so tests need no network.
import * as Y from "yjs";
import { PublishError, type RoundsApi } from "@/lib/engine/export/preview";
import type { Round } from "@/lib/share/round-types";

export interface HistoryVersion {
  /** The snapshot id: what GET /api/boards/[id]/snapshots/[sid] serves and the compare page takes as `a` / `b`. */
  id: string;
  kind: "compaction" | "round";
  label: string | null;
  roundNumber: number | null;
  createdAt: string;
  uptoSeq: number;
}

/** A call that did not succeed: the HTTP status and the server's short code (`local-only`, `not-configured`, `not-found`, ...). */
export class RoundsRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(`Request failed (${status} ${code})`);
    this.name = "RoundsRequestError";
  }
}

type Fetch = typeof fetch;
const board = (id: string) => `/api/boards/${encodeURIComponent(id)}`;

async function failure(res: Response): Promise<RoundsRequestError> {
  let code = "error";
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body.error === "string") code = body.error;
  } catch {
    /* no JSON body */
  }
  return new RoundsRequestError(res.status, code);
}

export interface RoundsClient extends RoundsApi {
  listRounds(boardId: string): Promise<Round[]>;
  listHistory(boardId: string): Promise<HistoryVersion[]>;
  fetchSnapshot(boardId: string, snapshotId: string): Promise<Uint8Array>;
  /** A server snapshot of the board's current state (a labelled version); resolves with its id. */
  createSnapshot(boardId: string, label: string): Promise<string>;
}

function publishError(status: number): PublishError {
  if (status === 429) return new PublishError("rate-limited", "You're publishing too fast. Wait a minute and try again.");
  if (status === 413) return new PublishError("too-large", "This board is too large to publish as a round.");
  if (status === 503) return new PublishError("needs-server", "Publishing needs the server, and it isn't available right now.");
  if (status === 401 || status === 403) return new PublishError("server", "You're signed out. Sign in again and retry.");
  return new PublishError("server", "The round could not be published. Try again.");
}

export function createRoundsClient(fetchFn: Fetch = (...a) => globalThis.fetch(...a)): RoundsClient {
  const post = (url: string, body: unknown) => fetchFn(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return {
    async prepare(boardId, frames) {
      const res = await post(`${board(boardId)}/rounds/prepare`, { frames });
      if (!res.ok) throw await failure(res);
      return (await res.json()) as Awaited<ReturnType<RoundsApi["prepare"]>>;
    },

    async create(boardId, body) {
      let res: Response;
      try {
        res = await post(`${board(boardId)}/rounds`, body);
      } catch {
        throw new PublishError("server", "The round could not be published: no connection.");
      }
      if (!res.ok) throw publishError(res.status);
      return (await res.json()) as Round;
    },

    async listRounds(boardId) {
      const res = await fetchFn(`${board(boardId)}/rounds`, { cache: "no-store" });
      if (!res.ok) throw await failure(res);
      return ((await res.json()) as { rounds: Round[] }).rounds;
    },

    async listHistory(boardId) {
      const res = await fetchFn(`${board(boardId)}/history`, { cache: "no-store" });
      if (!res.ok) throw await failure(res);
      return ((await res.json()) as { versions: HistoryVersion[] }).versions;
    },

    async fetchSnapshot(boardId, snapshotId) {
      const res = await fetchFn(`${board(boardId)}/snapshots/${encodeURIComponent(snapshotId)}`, { cache: "no-store" });
      if (!res.ok) throw await failure(res);
      return new Uint8Array(await res.arrayBuffer());
    },

    async createSnapshot(boardId, label) {
      const res = await post(`${board(boardId)}/snapshots`, { label });
      if (!res.ok) throw await failure(res);
      return ((await res.json()) as { id: string }).id;
    },
  };
}

/**
 * Local-only mode (development and end-to-end tests) has no sync: the server sees a board only when the browser hands it
 * over. Pushes the board's whole current state; never throws (the round would then simply be of an older state).
 */
export async function pushLocalState(boardId: string, ydoc: Y.Doc, title: string, fetchFn: Fetch = (...a) => globalThis.fetch(...a)): Promise<void> {
  try {
    await fetchFn(`${board(boardId)}/local-state`, {
      method: "PUT",
      headers: { "content-type": "application/octet-stream", "x-atelier-title": encodeURIComponent(title.slice(0, 300)) },
      body: Y.encodeStateAsUpdate(ydoc) as BodyInit,
    });
  } catch {
    /* best effort */
  }
}
