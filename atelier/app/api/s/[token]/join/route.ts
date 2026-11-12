import { handleJoin } from "@/lib/server/visitor-session";

type Ctx = { params: Promise<{ token: string }> };

export async function POST(req: Request, { params }: Ctx): Promise<Response> {
  return handleJoin(req, (await params).token);
}
