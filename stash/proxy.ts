import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "@/lib/supabase/env";

/*
 * No login screen: Stash is a personal app. The first time a device opens a
 * page, it silently gets an anonymous Supabase identity (kept in a cookie), and
 * row-level security keeps every row private to that identity. A stranger who
 * opens the URL gets their own empty space, never the owner's saves.
 */

// Pages that never need an identity.
const PUBLIC_PREFIXES = ["/design", "/offline"];

function isPublic(pathname: string) {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Only real page loads create an identity, so parallel prefetches can't create several. */
function isDocumentRequest(request: NextRequest) {
  const h = request.headers;
  return (
    request.method === "GET" &&
    !h.has("rsc") &&
    !h.has("next-router-prefetch") &&
    h.get("purpose") !== "prefetch" &&
    h.get("sec-purpose")?.includes("prefetch") !== true
  );
}

export async function proxy(request: NextRequest) {
  if (isPublic(request.nextUrl.pathname) || !isSupabaseConfigured) return NextResponse.next();

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

  // Verifies the session JWT locally and refreshes the cookie when it's close to expiry.
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims && isDocumentRequest(request)) {
    // If anonymous sign-ins are switched off in Supabase this fails quietly:
    // the app still works, it just can't sync until they're on.
    await supabase.auth.signInAnonymously();
  }
  return response;
}

export const config = {
  // Static files, PWA files and /.well-known (assetlinks.json) never go through the proxy.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|sw.js|offline.html|\\.well-known/|robots.txt).*)",
  ],
};
