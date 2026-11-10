import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "@/lib/supabase/env";
import { isPublicPath } from "@/lib/supabase/session";

/*
 * No login screen: Stash is a personal app. Each device gets a silent anonymous
 * Supabase identity, and row-level security keeps every row private to it.
 *
 * The identity is created on the phone, by JavaScript (components/shell/NativeBoot
 * → ensureSession), never here: Phase 0–3 created one on any GET, so link previews
 * and crawlers made dozens of empty users. This proxy only keeps an existing
 * session's cookie fresh.
 */

export async function proxy(request: NextRequest) {
  if (isPublicPath(request.nextUrl.pathname) || !isSupabaseConfigured) return NextResponse.next();
  // Nothing to refresh without a session cookie: skip the round trip.
  if (!request.cookies.getAll().some((c) => c.name.startsWith("sb-"))) return NextResponse.next();

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
  await supabase.auth.getClaims();
  return response;
}

export const config = {
  // Static files, PWA files and /.well-known (assetlinks.json) never go through the proxy.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|sw.js|offline.html|\\.well-known/|robots.txt).*)",
  ],
};
