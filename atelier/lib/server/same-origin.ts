/**
 * CSRF guard for the visitor API (cookies are SameSite=Lax, this is the second layer). Safe methods always pass. Anything else
 * must come from the app's own origin: a matching `Origin` header, or, when the browser sent none, `Sec-Fetch-Site` of
 * "same-origin" or "none". A request with neither header (not a browser) or with a foreign Origin is refused.
 * Throws a 403 Response, like requireOwner, so a handler can `try { ... } catch (e) { return responseFromError(e) }`.
 */

function forbidden(): Response {
  return Response.json({ error: "forbidden" }, { status: 403, headers: { "cache-control": "no-store" } });
}

function originOf(appOrigin: string): string | null {
  try {
    const url = new URL(appOrigin);
    return url.origin === "null" ? null : url.origin;
  } catch {
    return null;
  }
}

export function assertSameOrigin(req: Request, appOrigin: string): void {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD") return;

  const expected = originOf(appOrigin);
  if (!expected) throw forbidden(); // misconfigured: fail closed

  const origin = req.headers.get("origin");
  if (origin !== null) {
    if (origin === expected) return;
    throw forbidden();
  }
  const site = req.headers.get("sec-fetch-site");
  if (site === "same-origin" || site === "none") return;
  throw forbidden();
}
