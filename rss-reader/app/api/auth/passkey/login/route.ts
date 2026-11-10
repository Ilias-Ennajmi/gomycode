import { NextRequest, NextResponse } from "next/server";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { SESSION_COOKIE, createSessionToken, sessionCookieOptions } from "@/lib/auth";
import {
  CHALLENGE_COOKIE,
  authenticate,
  authenticationOptions,
  hasPasskeys,
  openChallenge,
  sealChallenge,
} from "@/lib/passkeys";
import { reportProblem } from "@/lib/errlog";
import { BadRequest, badRequest, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

const cookie = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/api/auth/passkey",
  maxAge: 300,
};

// Signing in with a passkey (public, like the password sign-in). GET says whether there is
// one and what the device must sign; POST checks the device's answer and opens the session.
// There's nothing to guess here: only a device holding a saved passkey can answer.

export async function GET(request: NextRequest) {
  try {
    if (!(await hasPasskeys())) return NextResponse.json({ available: false });
    const options = await authenticationOptions(request);
    const response = NextResponse.json({ available: true, options });
    response.cookies.set(CHALLENGE_COOKIE, await sealChallenge(options.challenge), cookie);
    return response;
  } catch (error) {
    await reportProblem("GET /api/auth/passkey/login", error);
    return NextResponse.json({ available: false });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { response } = await readJson<{ response?: AuthenticationResponseJSON }>(request);
    const challenge = await openChallenge(request.cookies.get(CHALLENGE_COOKIE)?.value);
    if (!response || !challenge) {
      return NextResponse.json({ error: "That took too long. Try again." }, { status: 400 });
    }
    if (!(await authenticate(request, response, challenge))) {
      return NextResponse.json({ error: "That passkey wasn't recognised" }, { status: 401 });
    }
    const done = NextResponse.json({ ok: true });
    done.cookies.set(SESSION_COOKIE, await createSessionToken(), sessionCookieOptions());
    done.cookies.set(CHALLENGE_COOKIE, "", { ...cookie, maxAge: 0 });
    return done;
  } catch (error) {
    if (error instanceof BadRequest) return badRequest(error);
    await reportProblem("POST /api/auth/passkey/login", error);
    return NextResponse.json({ error: "Couldn't sign in" }, { status: 500 });
  }
}
