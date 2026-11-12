import { assertSameOrigin } from "./same-origin";

/**
 * The origin share URLs are built on and mutating requests are compared against: NEXT_PUBLIC_SITE_URL (the public address of
 * the deployment; NEXT_PUBLIC_APP_URL is read as an older name), else the origin of the request itself. Only a valid http(s)
 * origin counts; a path or query on it is dropped, and in production a plain-http value is ignored (a share link must not
 * be issued on a scheme that sends the token in the clear).
 */
export function siteOrigin(req: Request, env: Record<string, string | undefined> = process.env): string {
  const configured = env.NEXT_PUBLIC_SITE_URL || env.NEXT_PUBLIC_APP_URL || "";
  if (configured) {
    try {
      const url = new URL(configured);
      const secureEnough = url.protocol === "https:" || (url.protocol === "http:" && env.VERCEL_ENV !== "production");
      if (secureEnough && url.origin !== "null") return url.origin;
    } catch {
      /* malformed: fall through to the request's origin */
    }
  }
  return new URL(req.url).origin;
}

/**
 * CSRF check for mutating routes: the request must come from this app. The browser's Origin header may match the configured
 * public address or the address this very request was served on (a preview deployment answers on its own host while the
 * configured one is the production site); either proves "same origin", and a foreign page cannot forge an Origin header.
 */
export function assertAppOrigin(req: Request, env: Record<string, string | undefined> = process.env): void {
  const own = new URL(req.url).origin;
  const configured = siteOrigin(req, env);
  try {
    assertSameOrigin(req, configured);
  } catch (first) {
    if (configured === own) throw first;
    assertSameOrigin(req, own);
  }
}
