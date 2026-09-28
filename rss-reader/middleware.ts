import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, isAuthConfigured, safeEqual, verifySessionToken } from "@/lib/auth";

const PUBLIC_PATHS = ["/login", "/api/auth/login"];

function isApi(pathname: string) {
  return pathname.startsWith("/api/");
}

async function isCronRequest(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!secret || !header) return false;
  return safeEqual(header, `Bearer ${secret}`);
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (!isAuthConfigured()) {
    if (process.env.NODE_ENV === "production") {
      return new NextResponse("APP_PASSWORD is not configured on the server.", { status: 503 });
    }
    return NextResponse.next();
  }

  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();

  if (pathname === "/api/refresh" && (await isCronRequest(request))) {
    return NextResponse.next();
  }

  if (await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }

  if (isApi(pathname)) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  if (pathname !== "/") loginUrl.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // .well-known/ holds assetlinks.json, which Android must read without logging in.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|sw.js|\\.well-known/).*)",
  ],
};
