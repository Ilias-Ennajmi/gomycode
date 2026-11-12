import { handleBoard } from "@/lib/server/viewer-board";

type Ctx = { params: Promise<{ token: string }> };

// GET /api/s/:token/board -> ViewerBoard (lib/viewer/viewer-types.ts). Guarded by requireVisitor.
// Round links: Cache-Control private, max-age=30 (the snapshot is immutable). Live links: no-store.
export async function GET(req: Request, { params }: Ctx): Promise<Response> {
  return handleBoard(req, (await params).token);
}
