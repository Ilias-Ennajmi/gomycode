import { NextRequest, NextResponse } from "next/server";
import { clearErrorLog, readErrorLog, recordError } from "@/lib/errlog";

export const dynamic = "force-dynamic";

/** The error log, newest first. */
export async function GET() {
  return NextResponse.json({ errors: await readErrorLog() });
}

/** The browser reports a crash (error boundaries) so it shows up on the System page. */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    message?: string;
    detail?: string;
    where?: string;
  };
  if (!body.message) return NextResponse.json({ error: "Nothing to log" }, { status: 400 });
  await recordError(
    `client${body.where ? `:${body.where}` : ""}`,
    String(body.message).slice(0, 300),
    [body.detail, request.headers.get("user-agent")].filter(Boolean).join("\n")
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  await clearErrorLog();
  return NextResponse.json({ ok: true });
}
