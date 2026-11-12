import { handleUnlock } from "@/lib/server/visitor-session";

type Ctx = { params: Promise<{ token: string }> };

export async function POST(req: Request, { params }: Ctx): Promise<Response> {
  return handleUnlock(req, (await params).token);
}
