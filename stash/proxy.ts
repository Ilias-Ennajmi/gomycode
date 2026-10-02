import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isAllowedEmail, isSupabaseConfigured } from "@/lib/supabase/env";

// Pages anyone can open. /design has no data; /login and /auth/* are the sign-in flow.
const PUBLIC_PREFIXES = ["/login", "/auth/", "/design", "/offline"];

function isPublic(pathname: string) {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p.endsWith("/") ? p : `${p}/`));
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  // Public pages (and assetlinks/PWA files, excluded by the matcher) never wait on auth.
  if (isPublic(pathname)) return NextResponse.next();

  if (!isSupabaseConfigured) {
    // Local dev before setup runs ungated; production must never be open.
    if (process.env.NODE_ENV === "production") {
      return new NextResponse("Sign-in isn't configured on the server.", { status: 503 });
    }
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // Verifies the session JWT locally (no Auth round trip unless it needs refreshing)
  // and refreshes the cookie when it's close to expiry.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  // Redirects keep any cookies Supabase set (refreshed or cleared session).
  const redirect = (url: URL) => {
    const r = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => r.cookies.set(c));
    return r;
  };

  if (!claims) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return redirect(url);
  }

  if (!isAllowedEmail(typeof claims.email === "string" ? claims.email : null)) {
    await supabase.auth.signOut();
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "?error=not_allowed";
    return redirect(url);
  }

  return response;
}

export const config = {
  // Static files, PWA files and /.well-known (assetlinks.json) never go through auth.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|sw.js|offline.html|\\.well-known/|robots.txt).*)",
  ],
};
