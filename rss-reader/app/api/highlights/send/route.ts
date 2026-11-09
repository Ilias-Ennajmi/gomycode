import { NextResponse } from "next/server";
import {
  connect,
  disconnect,
  ExportError,
  exportStatus,
  sendHighlights,
  type ExportService,
} from "@/lib/exports";
import { reportProblem } from "@/lib/errlog";
import { BadRequest, badRequest, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Highlights → Send to Readwise / Notion: status (never the tokens), connect, disconnect,
// send now. See lib/exports.ts.

function service(value: unknown): ExportService | null {
  return value === "readwise" || value === "notion" ? value : null;
}

export async function GET() {
  return NextResponse.json(await exportStatus());
}

/** { service, action: "connect", token, database? } | { service, action: "send", all? } */
export async function POST(request: Request) {
  try {
    const body = await readJson<{
      service?: unknown;
      action?: unknown;
      token?: unknown;
      database?: unknown;
      all?: unknown;
    }>(request);
    const which = service(body.service);
    if (!which) return NextResponse.json({ error: "Unknown service" }, { status: 400 });
    if (body.action === "connect") {
      if (typeof body.token !== "string" || !body.token.trim()) {
        return NextResponse.json({ error: "Paste a token" }, { status: 400 });
      }
      await connect(
        which,
        body.token.trim(),
        typeof body.database === "string" ? body.database : undefined
      );
      return NextResponse.json(await exportStatus());
    }
    if (body.action === "send") {
      const sent = await sendHighlights(which, { all: body.all === true });
      return NextResponse.json({ sent, ...(await exportStatus()) });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    if (error instanceof BadRequest) return badRequest(error);
    if (error instanceof ExportError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    await reportProblem("POST /api/highlights/send", error);
    return NextResponse.json({ error: "Couldn't send highlights" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const which = service(new URL(request.url).searchParams.get("service"));
  if (!which) return NextResponse.json({ error: "Unknown service" }, { status: 400 });
  await disconnect(which);
  return NextResponse.json(await exportStatus());
}
