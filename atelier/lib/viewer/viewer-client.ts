// The visitor's browser talking to /api/s/{token}/*. Every call goes through one place so "the link died" (404 / 410) is
// noticed on any of them and the viewer can swap to the unavailable screen at once, and a lost connection is told apart
// from a refusal.
import type { ViewerBoard } from "./viewer-types";

export class GoneError extends Error {
  constructor() {
    super("gone");
    this.name = "GoneError";
  }
}
export class NetworkError extends Error {
  constructor() {
    super("network");
    this.name = "NetworkError";
  }
}
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly retryAfter = 0,
  ) {
    super(code);
    this.name = "ApiError";
  }
}

export type UnlockResult = { ok: true } | { ok: false; reason: "wrong" | "locked" | "gone" | "busy" | "error"; retryAfter: number };
export type SessionResult = { ok: true; name: string | null } | { ok: false; reason: "password" | "gone" | "busy" | "error" };

export interface ViewerApi {
  session(): Promise<SessionResult>;
  unlock(password: string): Promise<UnlockResult>;
  join(name: string): Promise<{ name: string }>;
  board(): Promise<ViewerBoard>;
  /** A JSON call for the review routes; throws GoneError, NetworkError or ApiError. */
  json<T>(method: "GET" | "POST" | "PUT" | "DELETE", path: string, body?: unknown): Promise<T>;
}

export function createViewerApi(token: string, fetcher: typeof fetch = (...a) => fetch(...a)): ViewerApi {
  const base = `/api/s/${encodeURIComponent(token)}`;

  async function raw(method: string, path: string, body?: unknown): Promise<Response> {
    try {
      return await fetcher(`${base}${path}`, {
        method,
        credentials: "same-origin",
        headers: body === undefined ? undefined : { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: "no-store",
      });
    } catch {
      throw new NetworkError();
    }
  }
  const readError = async (res: Response) => {
    let code = "error";
    try {
      const j = (await res.json()) as { error?: unknown; retryAfter?: unknown };
      if (typeof j.error === "string") code = j.error;
      return new ApiError(res.status, code, typeof j.retryAfter === "number" ? j.retryAfter : Number(res.headers.get("retry-after")) || 0);
    } catch {
      return new ApiError(res.status, code, Number(res.headers.get("retry-after")) || 0);
    }
  };

  return {
    async session() {
      const res = await raw("POST", "/session", {});
      if (res.ok) return { ok: true, name: ((await res.json()) as { name?: string | null }).name ?? null };
      if (res.status === 404 || res.status === 410) return { ok: false, reason: "gone" };
      if (res.status === 401) return { ok: false, reason: "password" };
      if (res.status === 429) return { ok: false, reason: "busy" };
      return { ok: false, reason: "error" };
    },
    async unlock(password) {
      const res = await raw("POST", "/unlock", { password });
      if (res.status === 204 || res.ok) return { ok: true };
      if (res.status === 404 || res.status === 410) return { ok: false, reason: "gone", retryAfter: 0 };
      const err = await readError(res);
      if (res.status === 401) return { ok: false, reason: "wrong", retryAfter: err.retryAfter };
      if (res.status === 429) return { ok: false, reason: err.code === "locked" ? "locked" : "busy", retryAfter: err.retryAfter };
      return { ok: false, reason: "error", retryAfter: 0 };
    },
    async join(name) {
      const res = await raw("POST", "/join", { name });
      if (res.status === 404 || res.status === 410) throw new GoneError();
      if (!res.ok) throw await readError(res);
      return (await res.json()) as { name: string };
    },
    async board() {
      const res = await raw("GET", "/board");
      if (res.status === 404 || res.status === 410) throw new GoneError();
      if (!res.ok) throw await readError(res);
      return (await res.json()) as ViewerBoard;
    },
    async json<T>(method: "GET" | "POST" | "PUT" | "DELETE", path: string, body?: unknown) {
      const res = await raw(method, path, body);
      if (res.status === 404 || res.status === 410) {
        // The guard answers a dead link with 404 { error: "not-found" } or 410; a review route answers "that object is not in this
        // link" with 404 { error: "unknown-target" }, which is not the end of the link.
        const err = await readError(res);
        if (res.status === 410 || err.code === "not-found" || err.code === "gone") throw new GoneError();
        throw err;
      }
      if (!res.ok) throw await readError(res);
      return (res.status === 204 ? undefined : await res.json()) as T;
    },
  };
}
