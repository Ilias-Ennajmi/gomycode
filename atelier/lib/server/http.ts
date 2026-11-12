import { createHmac } from "node:crypto";

/*
 * Small HTTP helpers for the public share routes: JSON answers that are never cached, a body reader with a hard size cap,
 * and the visitor's IP as a keyed hash. Nothing here logs a body, a cookie or an address.
 */

export type JsonOptions = {
  /** A complete Set-Cookie header value to send with the answer. */
  cookie?: string | null;
  headers?: Record<string, string>;
};

/** A JSON answer. `Cache-Control: private, no-store` on every one: a share URL carries its token. 204 has no body. */
export function jsonResponse(status: number, body: unknown, opts: JsonOptions = {}): Response {
  const headers = new Headers({ "cache-control": "private, no-store" });
  if (status !== 204) headers.set("content-type", "application/json; charset=utf-8");
  if (opts.cookie) headers.append("set-cookie", opts.cookie);
  for (const [k, v] of Object.entries(opts.headers ?? {})) headers.set(k, v);
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers });
}

const bad = (status: number, error: string) => jsonResponse(status, { error });

/**
 * The JSON body of a request, or THROWS a Response: 413 over `maxBytes` (decided from Content-Length first, then from the
 * bytes actually received, so a client that lies about its length is cut off after `maxBytes` and the rest is never read),
 * 415 when the content type is not application/json, 400 for an empty or malformed body. `allowEmpty` turns an empty body
 * into `{}` (for routes that need no input).
 */
export async function readJsonLimited<T = unknown>(req: Request, maxBytes: number, opts: { allowEmpty?: boolean } = {}): Promise<T> {
  const declared = req.headers.get("content-length");
  if (declared !== null) {
    const n = Number(declared);
    if (Number.isFinite(n) && n > maxBytes) throw bad(413, "too-large");
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  if (req.body) {
    const reader = req.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel().catch(() => undefined);
          throw bad(413, "too-large");
        }
        chunks.push(value);
      }
    } catch (e) {
      if (e instanceof Response) throw e;
      throw bad(400, "invalid-body");
    }
  }

  if (total === 0) {
    if (opts.allowEmpty) return {} as T;
    throw bad(400, "invalid-body");
  }

  const type = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (type !== "application/json") throw bad(415, "unsupported-media-type");

  const bytes = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as T;
  } catch {
    throw bad(400, "invalid-body");
  }
}

const IP_SHAPE = /^[0-9A-Fa-f:.]{2,64}$/;

/**
 * The caller's address as the platform reports it: Vercel's own header, else the first hop of X-Forwarded-For. Anything that
 * is not shaped like an address becomes "0.0.0.0" (so one hostile header value cannot create unlimited distinct keys).
 */
export function clientIp(req: Request): string {
  const platform = req.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  for (const candidate of [platform, forwarded]) {
    if (candidate && IP_SHAPE.test(candidate)) return candidate;
  }
  return "0.0.0.0";
}

/** HMAC-SHA256 of the address, hex. For abuse limits only: it is stored (visitors, attempts) but never shown or returned. */
export function ipHash(ip: string, secret: string): string {
  return createHmac("sha256", secret).update(`ip\n${ip}`, "utf8").digest("hex");
}
