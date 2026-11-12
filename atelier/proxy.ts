import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { checkSecondFactor } from "@/lib/server/mfa";
import { claimsAreOwner, isLocalOnly, type OwnerClaims } from "@/lib/server/owner";

/*
 * Atelier is one person's private app, so every page and API call is closed unless the request
 * carries a session for ATELIER_OWNER_ID. There is no anonymous sign-in and no public page except
 * the login screens and the files the browser needs before it can show them.
 *
 *   no session          -> pages redirect to /login?next=..., API calls get 401 JSON
 *   someone else        -> signed out here, /login?error=not-owner (API: 403 JSON)
 *   the owner           -> through, once the second step is done if two-step verification is on
 *                          (pages go to /login/verify, API calls get 401 mfa-required)
 *
 * Local-only mode (ATELIER_LOCAL_ONLY=1, development and end-to-end tests) skips all of it and is
 * refused in production by isLocalOnly().
 */

const OPEN_PATHS = new Set([
  "/favicon.ico",
  "/manifest.webmanifest",
  "/offline.html",
  "/robots.txt",
  "/sw.js",
  "/sw-share.js",
  // Web Share Target: the service worker answers the share POST on the device. A request that reaches the server has no
  // service worker behind it; app/share-target/route.ts only redirects (it never reads the body), so being open here
  // gives nothing away and avoids a 307 that would re-post the shared files to the login page.
  "/share-target",
  "/api/health",
]);
// Share links (Phase 3): a client opens /s/{token} and calls /api/s/{token}/* with no Atelier account. These are the only
// public app routes. They expose no owner data: every /api/s/ handler except `meta` and the session routes goes through
// requireVisitor (lib/share/guard.ts), which re-checks the link, the signed cookie, the permission and the scope on every call.
// A prefix match on the normalised pathname: "/s", "/sx/..." and "/api/share-links/..." are NOT open.
const OPEN_PREFIXES = ["/_next/", "/brand/", "/icons/", "/.well-known/", "/s/", "/api/s/"];

function isOpenPath(pathname: string) {
  return OPEN_PATHS.has(pathname) || OPEN_PREFIXES.some((p) => pathname.startsWith(p));
}

function isLoginPath(pathname: string) {
  return pathname === "/login" || pathname.startsWith("/login/");
}

function isApiPath(pathname: string) {
  return pathname === "/api" || pathname.startsWith("/api/");
}

export async function proxy(request: NextRequest) {
  // Throws in production, so a misconfigured deploy fails loudly instead of opening up.
  if (isLocalOnly()) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  if (isOpenPath(pathname)) return NextResponse.next();

  const env = getSupabaseEnv();
  if (!env) {
    // Closed rather than open when the server is not set up.
    return new NextResponse("Atelier is not configured on this server.", {
      status: 503,
      headers: { "cache-control": "no-store", "content-type": "text/plain; charset=utf-8" },
    });
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list, headers) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });

  /** A redirect or JSON answer that keeps any cookies Supabase just set (refresh or sign-out). */
  const answer = (make: () => NextResponse) => {
    const res = make();
    response.cookies.getAll().forEach((c) => res.cookies.set(c));
    res.headers.set("cache-control", "no-store");
    return res;
  };
  const redirectTo = (path: string) =>
    answer(() => NextResponse.redirect(new URL(path, request.url)));
  const jsonError = (status: number, error: string) =>
    answer(() => NextResponse.json({ error }, { status }));

  // Verifies the token signature and expiry, and refreshes the cookie when it is close to expiry.
  const { data, error } = await supabase.auth.getClaims();
  const claims = error ? undefined : (data?.claims as OwnerClaims | undefined);

  if (!claims?.sub) {
    if (isApiPath(pathname)) return jsonError(401, "unauthorized");
    // The login page must render to let someone sign in; /login/verify needs a session.
    if (pathname === "/login") return response;
    if (isLoginPath(pathname)) return redirectTo("/login");
    return redirectTo(`/login?next=${encodeURIComponent(pathname + search)}`);
  }

  if (!claimsAreOwner(claims)) {
    // Another Supabase identity (a Stash anonymous user, a stranger with an account): end this
    // browser's session only ("local": never sign out their other devices) and turn them away.
    await supabase.auth.signOut({ scope: "local" });
    if (isApiPath(pathname)) return jsonError(403, "forbidden");
    if (isLoginPath(pathname)) return response;
    return redirectTo("/login?error=not-owner");
  }

  // The login pages decide for themselves (/login/verify is where the second step happens).
  if (isLoginPath(pathname)) return response;

  // Two-step verification: a session that has not used its second factor is only half signed in.
  // The token already says aal2 when it has, which saves the check; otherwise read the levels.
  if (claims.aal !== "aal2") {
    const second = await checkSecondFactor(supabase);
    if (second === "needed") {
      if (isApiPath(pathname)) return jsonError(401, "mfa-required");
      return redirectTo(`/login/verify?next=${encodeURIComponent(pathname + search)}`);
    }
    if (second === "error") {
      return answer(
        () =>
          new NextResponse("Couldn't check your sign-in. Reload to try again.", {
            status: 503,
            headers: { "content-type": "text/plain; charset=utf-8" },
          }),
      );
    }
  }

  return response;
}

export const config = {
  // Static files, PWA files and /.well-known never go through the proxy.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|brand/|icons/|manifest.webmanifest|sw.js|sw-share.js|offline.html|\\.well-known/|robots.txt).*)",
  ],
};
