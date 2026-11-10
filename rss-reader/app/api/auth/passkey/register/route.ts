import { NextRequest, NextResponse } from "next/server";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import {
  CHALLENGE_COOKIE,
  PasskeyError,
  listPasskeys,
  openChallenge,
  register,
  registrationOptions,
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

// Adding a passkey, while signed in (the middleware sees to that). GET starts it: what the
// device must sign. POST finishes it: the device's answer, checked and saved.

export async function GET(request: NextRequest) {
  try {
    const options = await registrationOptions(request);
    const response = NextResponse.json(options);
    response.cookies.set(CHALLENGE_COOKIE, await sealChallenge(options.challenge), cookie);
    return response;
  } catch (error) {
    if (error instanceof PasskeyError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    await reportProblem("GET /api/auth/passkey/register", error);
    return NextResponse.json({ error: "Couldn't start" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { response, name } = await readJson<{
      response?: RegistrationResponseJSON;
      name?: unknown;
    }>(request);
    const challenge = await openChallenge(request.cookies.get(CHALLENGE_COOKIE)?.value);
    if (!response || !challenge) {
      return NextResponse.json({ error: "That took too long. Try again." }, { status: 400 });
    }
    await register(request, response, challenge, typeof name === "string" ? name : "");
    const done = NextResponse.json({ passkeys: await listPasskeys() });
    done.cookies.set(CHALLENGE_COOKIE, "", { ...cookie, maxAge: 0 });
    return done;
  } catch (error) {
    if (error instanceof BadRequest) return badRequest(error);
    if (error instanceof PasskeyError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    await reportProblem("POST /api/auth/passkey/register", error);
    return NextResponse.json({ error: "Couldn't add the passkey" }, { status: 500 });
  }
}
