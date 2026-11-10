import { NextRequest, NextResponse } from "next/server";
import { listPasskeys, removePasskey } from "@/lib/passkeys";

export const dynamic = "force-dynamic";

/** The passkeys that can unlock this reader (names and dates; behind the sign-in). */
export async function GET() {
  return NextResponse.json({ passkeys: await listPasskeys() });
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Which passkey?" }, { status: 400 });
  await removePasskey(id);
  return NextResponse.json({ passkeys: await listPasskeys() });
}
