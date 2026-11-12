import { SafeFetchError } from "./safe-fetch";

/** JSON error response for the link-preview routes. Never cached. */
export function errorResponse(status: number, error: string, extra?: HeadersInit): Response {
  return Response.json({ error }, { status, headers: { "cache-control": "no-store", ...extra } });
}

export function rateLimited(retryAfterSec: number): Response {
  return errorResponse(429, "rate-limited", { "retry-after": String(retryAfterSec) });
}

/**
 * Maps a failed fetch to a response. Every bad-url / blocked-address case is the same "blocked" answer, so a caller
 * cannot tell an internal address from a malformed one. Resolver and socket failures (plain errors, whose messages may
 * name hosts or addresses) are reported only as "unreachable".
 */
export function fetchErrorResponse(e: unknown, opts: { badContentType?: Response; tooLarge?: Response } = {}): Response {
  if (e instanceof SafeFetchError) {
    switch (e.code) {
      case "bad-url":
      case "blocked-address":
        return errorResponse(400, "blocked");
      case "timeout":
        return errorResponse(504, "timeout");
      case "bad-content-type":
        if (opts.badContentType) return opts.badContentType;
        return errorResponse(502, "unreachable");
      case "too-large":
        return opts.tooLarge ?? errorResponse(502, "unreachable");
      default:
        return errorResponse(502, "unreachable");
    }
  }
  return errorResponse(502, "unreachable");
}
