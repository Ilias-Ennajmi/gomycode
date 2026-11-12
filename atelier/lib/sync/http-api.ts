import { base64ToBytes } from "./bytes";
import type { SyncApi } from "./sync-client";

/** A non-2xx answer from the sync routes. A thrown TypeError (no status) means the network failed instead. */
export class SyncHttpError extends Error {
  readonly status: number;
  constructor(status: number, message?: string) {
    super(message ?? `Sync request failed (${status})`);
    this.name = "SyncHttpError";
    this.status = status;
  }
}

type PullBody = {
  snapshot?: { state: string; uptoSeq: number };
  updates?: { seq: number; update: string }[];
  more?: boolean;
};

/** SyncApi over the Atelier routes (`/api/boards/:id/updates`). */
export function createHttpSyncApi(fetchFn: typeof fetch = (...a) => globalThis.fetch(...a), base = "/api"): SyncApi {
  return {
    async push(boardId, update, deviceId) {
      const res = await fetchFn(`${base}/boards/${encodeURIComponent(boardId)}/updates`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream", "x-atelier-device": deviceId },
        body: update as BodyInit,
        keepalive: update.byteLength < 60_000, // lets a last save survive the tab closing
      });
      if (!res.ok) throw new SyncHttpError(res.status);
      const { seq } = (await res.json()) as { seq: number };
      return { seq };
    },

    async pull(boardId, afterSeq) {
      const res = await fetchFn(`${base}/boards/${encodeURIComponent(boardId)}/updates?after=${afterSeq}`, { cache: "no-store" });
      if (!res.ok) throw new SyncHttpError(res.status);
      const body = (await res.json()) as PullBody;
      return {
        updates: (body.updates ?? []).map((u) => ({ seq: u.seq, update: base64ToBytes(u.update) })),
        ...(body.snapshot ? { snapshot: { state: base64ToBytes(body.snapshot.state), uptoSeq: body.snapshot.uptoSeq } } : {}),
        more: body.more === true,
      };
    },
  };
}
