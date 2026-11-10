// stash-worker-proxy: the only door between the worker (a Vercel function with no secret) and
// Supabase. Contract 0007 §4.1.
//
// Every request shows the wake-up token (header x-stash-worker-token). The database compares its
// SHA-256 with the Vault secret (stash.worker_token_ok), so timing says nothing about the token.
// Then a strict allowlist: schema `stash` only, listed tables and three RPCs, four buckets, paths
// inside a user's folder. Nothing reaches /auth/v1. Files never pass through here: the worker gets
// a signed URL and talks to Storage itself. The token, the service key and bodies are never logged.

import { cleanInputs, embedResponse } from "../_shared/embed.ts";
import { fail, HttpError, json, logFailure, readBody, readJson, sha256Hex } from "../_shared/http.ts";
import { FORWARDED_HEADERS, MAX_BODY, restVerdict, routeOf, storageVerdict } from "../_shared/proxy_rules.ts";

export type Deps = {
  supabaseUrl: string;
  serviceKey: string;
  anonKey: string;
  fetch: typeof fetch;
  signUpload(bucket: string, path: string): Promise<{ url: string; token: string; path: string }>;
  signDownload(bucket: string, path: string, expiresIn: number): Promise<string>;
  remove(bucket: string, paths: string[]): Promise<number>;
  embed(inputs: string[], maxChars: number): Promise<number[][]>;
  now?: () => number;
};

const TOKEN_TTL_MS = 60_000;
const MAX_CACHED = 200;
const POST_ROUTES = new Set(["/config", "/storage/sign-upload", "/storage/sign-download", "/storage/remove", "/embed"]);

export function makeHandler(deps: Deps): (req: Request) => Promise<Response> {
  const now = deps.now ?? Date.now;
  const service = { apikey: deps.serviceKey, Authorization: `Bearer ${deps.serviceKey}` };
  const checked = new Map<string, { ok: boolean; until: number }>(); // keyed by the token's SHA-256

  async function tokenOk(token: string): Promise<boolean> {
    if (token.length < 32 || token.length > 512) return false;
    const key = await sha256Hex(token);
    const hit = checked.get(key);
    if (hit && hit.until > now()) return hit.ok;
    const r = await deps.fetch(`${deps.supabaseUrl}/rest/v1/rpc/worker_token_ok`, {
      method: "POST",
      headers: { ...service, "Content-Type": "application/json", "Content-Profile": "stash" },
      body: JSON.stringify({ p_token: token }),
    });
    if (!r.ok) {
      await r.body?.cancel();
      throw new HttpError(503, "unavailable"); // can't ask the database: say so, cache nothing
    }
    const ok = (await r.json()) === true;
    if (checked.size >= MAX_CACHED) checked.clear();
    checked.set(key, { ok, until: now() + TOKEN_TTL_MS });
    return ok;
  }

  async function rest(req: Request, url: URL, target: string): Promise<Response> {
    const verdict = restVerdict(target, req.method, url.searchParams);
    if (!verdict.ok) return fail(verdict.status, verdict.code);
    const headers: Record<string, string> = { ...service, "Accept-Profile": "stash", "Content-Profile": "stash" };
    for (const name of FORWARDED_HEADERS) {
      const value = req.headers.get(name);
      if (value) headers[name] = value;
    }
    const body = req.method === "GET" ? undefined : await readBody(req, MAX_BODY);
    const upstream = await deps.fetch(`${deps.supabaseUrl}/rest/v1/${target}${url.search}`, {
      method: req.method,
      headers,
      // readBody returns an exactly-sized buffer of its own
      body: body && body.byteLength > 0 ? (body.buffer as ArrayBuffer) : undefined,
    });
    const out = new Headers({ "Cache-Control": "no-store" });
    for (const name of ["content-type", "content-range"]) {
      const value = upstream.headers.get(name);
      if (value) out.set(name, value);
    }
    return new Response(upstream.body, { status: upstream.status, headers: out });
  }

  async function route(req: Request): Promise<Response> {
    if (req.method === "OPTIONS") return new Response(null, { status: 204 }); // not called from a browser: no CORS
    if (!(await tokenOk(req.headers.get("x-stash-worker-token") ?? ""))) return fail(401, "unauthorized");

    const url = new URL(req.url);
    const path = routeOf(url.pathname);
    if (path.startsWith("/rest/")) return await rest(req, url, path.slice("/rest/".length));
    if (!POST_ROUTES.has(path)) return fail(403, "forbidden");
    if (req.method !== "POST") return fail(405, "method_not_allowed");

    switch (path) {
      case "/config": {
        await readBody(req, MAX_BODY);
        const r = await deps.fetch(`${deps.supabaseUrl}/rest/v1/rpc/worker_config`, {
          method: "POST",
          headers: { ...service, "Content-Type": "application/json", "Content-Profile": "stash" },
          body: "{}",
        });
        if (!r.ok) {
          await r.body?.cancel();
          return fail(502, "config_unavailable");
        }
        return json({ ...(await r.json()), supabase_url: deps.supabaseUrl, anon_key: deps.anonKey });
      }
      case "/storage/sign-upload": {
        const body = await readJson(req, MAX_BODY);
        const verdict = storageVerdict(body.bucket, body.path);
        if (!verdict.ok) return fail(verdict.status, verdict.code);
        return json(await deps.signUpload(body.bucket as string, body.path as string));
      }
      case "/storage/sign-download": {
        const body = await readJson(req, MAX_BODY);
        const verdict = storageVerdict(body.bucket, body.path);
        if (!verdict.ok) return fail(verdict.status, verdict.code);
        const wanted = typeof body.expires_in === "number" && Number.isFinite(body.expires_in) ? body.expires_in : 600;
        const expiresIn = Math.min(3600, Math.max(60, Math.floor(wanted)));
        return json({ url: await deps.signDownload(body.bucket as string, body.path as string, expiresIn) });
      }
      case "/storage/remove": {
        const body = await readJson(req, MAX_BODY);
        const paths = body.paths;
        if (!Array.isArray(paths) || paths.length === 0 || paths.length > 100) return fail(400, "bad_request");
        for (const p of paths) {
          const verdict = storageVerdict(body.bucket, p);
          if (!verdict.ok) return fail(verdict.status, verdict.code);
        }
        return json({ removed: await deps.remove(body.bucket as string, paths as string[]) });
      }
      case "/embed": {
        const body = await readJson(req, MAX_BODY);
        const inputs = cleanInputs(body.input, 16, false);
        if (!inputs) return fail(400, "bad_request");
        return json(embedResponse(await deps.embed(inputs, 2000)));
      }
      default:
        return fail(403, "forbidden");
    }
  }

  return async (req: Request): Promise<Response> => {
    try {
      return await route(req);
    } catch (e) {
      logFailure("stash-worker-proxy", e);
      return e instanceof HttpError ? fail(e.status, e.code) : fail(500, "internal");
    }
  };
}
