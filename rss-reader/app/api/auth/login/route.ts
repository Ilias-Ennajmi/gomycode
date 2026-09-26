import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  verifyPassword,
} from "@/lib/auth";

const MAX_FAILURES = 10;
const WINDOW_MS = 15 * 60 * 1000;

interface FailureRecord {
  count: number;
  since: number;
}

function clientIp(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const password = typeof body.password === "string" ? body.password : "";
  const key = `login-failures:${clientIp(request)}`;

  const existing = await prisma.setting.findUnique({ where: { key } });
  const record: FailureRecord | null = existing ? JSON.parse(existing.value) : null;
  const inWindow = record && Date.now() - record.since < WINDOW_MS;

  if (inWindow && record.count >= MAX_FAILURES) {
    const retryAfter = Math.ceil((record.since + WINDOW_MS - Date.now()) / 1000);
    return NextResponse.json(
      { error: "Too many attempts. Try again in a few minutes." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  if (!(await verifyPassword(password))) {
    const next: FailureRecord = inWindow
      ? { count: record.count + 1, since: record.since }
      : { count: 1, since: Date.now() };
    await prisma.setting.upsert({
      where: { key },
      update: { value: JSON.stringify(next) },
      create: { key, value: JSON.stringify(next) },
    });
    await new Promise((resolve) => setTimeout(resolve, 500));
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }

  if (existing) await prisma.setting.delete({ where: { key } });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}
