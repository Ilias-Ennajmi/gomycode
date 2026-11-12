import { handleSession } from "@/lib/server/visitor-session";

type Ctx = { params: Promise<{ token: string }> };

export async function POST(req: Request, { params }: Ctx): Promise<Response> {
  return handleSession(req, (await params).token);
}
