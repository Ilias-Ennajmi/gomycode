import { handleMeta } from "@/lib/server/visitor-session";

type Ctx = { params: Promise<{ token: string }> };

// GET /api/s/:token/meta (no guard) -> { status: "ok" | "gone", needsPassword, hasSession, visitorName, studioName, title?, permission?, welcomeNote? }
// A dead link of any kind (unknown, revoked, expired, board gone) is exactly { status: "gone" }.
export async function GET(req: Request, { params }: Ctx): Promise<Response> {
  return handleMeta(req, (await params).token);
}
