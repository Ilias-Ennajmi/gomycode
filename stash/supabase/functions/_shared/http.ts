// Small HTTP helpers shared by the three Stash functions. Nothing here logs a header or a body.

export const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

export function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra },
  });
}

/** Errors are always `{"error": "<code>"}`. */
export function fail(status: number, code: string, extra: Record<string, string> = {}): Response {
  return json({ error: code }, status, extra);
}

export class HttpError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}

/** The raw body, refused (413) when it is larger than `maxBytes`. */
export async function readBody(req: Request, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) throw new HttpError(413, "too_large");
  if (!req.body) return new Uint8Array();
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new HttpError(413, "too_large");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

/** A JSON object body (400 `bad_request` for anything else). */
export async function readJson(req: Request, maxBytes: number): Promise<Record<string, unknown>> {
  const raw = await readBody(req, maxBytes);
  if (raw.byteLength === 0) return {};
  try {
    const value = JSON.parse(new TextDecoder().decode(raw));
    if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  } catch {
    // falls through
  }
  throw new HttpError(400, "bad_request");
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function bearer(req: Request): string {
  const header = req.headers.get("authorization") ?? "";
  return /^Bearer\s+\S+$/i.test(header) ? header.replace(/^Bearer\s+/i, "") : "";
}

/** Logs the kind of failure only: never a message that could hold a token, a key or user text. */
export function logFailure(where: string, e: unknown): void {
  console.error(where, e instanceof HttpError ? e.code : e instanceof Error ? e.name : "error");
}
