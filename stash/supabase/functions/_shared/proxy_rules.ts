// What the worker may reach through stash-worker-proxy (contract 0007 §4.1). Pure functions, so
// the allowlist is tested without a network. Anything not listed here is refused.

export const TABLES: ReadonlySet<string> = new Set([
  "saves", "insights", "transcripts", "embeddings", "places", "states", "cards", "reviews", "syntheses",
  "reminders", "jobs", "exports", "usage", "settings", "spaces", "media_trash", "galaxy_points",
  "galaxy_clusters", "galaxy_layouts", "asks", "highlights", "backups", "daily_queues", "imports",
]);
export const RPCS: ReadonlySet<string> = new Set(["claim_jobs", "ask_context", "evict_videos"]);
export const BUCKETS: ReadonlySet<string> = new Set(["stash-video", "stash-thumbs", "stash-exports", "stash-voice"]);
export const METHODS: ReadonlySet<string> = new Set(["GET", "POST", "PATCH", "DELETE"]);
export const FORWARDED_HEADERS = ["prefer", "range", "content-type"];
export const MAX_BODY = 1024 * 1024;

const PATH_RE = /^[0-9a-f]{8}-[0-9a-f-]{27}\/[A-Za-z0-9._/-]{1,200}$/;
const NOT_FILTERS = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);

export type Verdict = { ok: true } | { ok: false; status: number; code: string };
const no = (status: number, code: string): Verdict => ({ ok: false, status, code });

/** The part of the path after the function's name: "/rest/saves", "/config", … ("" when it is not ours). */
export function routeOf(pathname: string, fn = "stash-worker-proxy"): string {
  const marker = `/${fn}`;
  const at = pathname.indexOf(marker);
  if (at < 0) return "";
  const rest = pathname.slice(at + marker.length);
  return rest === "" || rest.startsWith("/") ? rest.replace(/\/+$/, "") : "";
}

/**
 * Every table named in a PostgREST `select` as an embedded resource ("insights(...)",
 * "x:states!inner(...)") must be on the allowlist too; otherwise `select=*,config(*)` would read
 * past it. Anything else in front of a parenthesis (an aggregate, say) is refused as well.
 */
export function selectOk(select: string | null): boolean {
  if (select === null) return true;
  // A quoted name ("config"(*)) would slip past the pattern below, and no worker query needs one.
  if (select.length > 2000 || select.includes('"')) return false;
  for (const m of select.matchAll(/([A-Za-z_][\w]*)((?:![\w]+)*)\s*\(/g)) {
    if (!TABLES.has(m[1])) return false;
  }
  return true;
}

/** True when the query string narrows the rows: a column filter or a logical group. */
export function hasFilter(params: URLSearchParams): boolean {
  for (const [key, value] of params) {
    if (NOT_FILTERS.has(key) || value === "") continue;
    if (key === "and" || key === "or" || key === "not.and" || key === "not.or") return true;
    if (/^[A-Za-z_][\w]*$/.test(key) && /^(not\.)?[a-z]+(\([a-z]+\))?\./.test(value)) return true;
  }
  return false;
}

/** `/rest/<target>`: a listed table, or one of the three RPCs (POST only). */
export function restVerdict(target: string, method: string, params: URLSearchParams): Verdict {
  if (!METHODS.has(method)) return no(405, "method_not_allowed");
  if (target.startsWith("rpc/")) {
    if (!RPCS.has(target.slice(4))) return no(403, "forbidden");
    return method === "POST" ? { ok: true } : no(405, "method_not_allowed");
  }
  if (!TABLES.has(target)) return no(403, "forbidden");
  for (const select of params.getAll("select")) {
    if (!selectOk(select)) return no(403, "forbidden");
  }
  if ((method === "PATCH" || method === "DELETE") && !hasFilter(params)) return no(400, "filter_required");
  return { ok: true };
}

/** Storage: one of our four buckets and a path inside a user's own folder, with no way out of it. */
export function storageVerdict(bucket: unknown, path: unknown): Verdict {
  if (typeof bucket !== "string" || !BUCKETS.has(bucket)) return no(403, "forbidden");
  if (typeof path !== "string" || !PATH_RE.test(path) || path.includes("..") || path.includes("//")) {
    return no(403, "forbidden");
  }
  return { ok: true };
}
