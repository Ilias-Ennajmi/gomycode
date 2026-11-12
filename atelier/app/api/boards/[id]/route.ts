import { requireOwner, responseFromError } from "@/lib/server/owner";
import { failureResponse, json, patchBoardBody, readJson, trashBoard, updateBoard } from "@/lib/server/boards";

// PATCH  /api/boards/:id { title?, folderId?, starred?, deletedAt?, lastOpenedAt?, preview? } -> BoardSummary
//        deletedAt: null restores a board that is still in the trash (410 after 30 days).
// DELETE /api/boards/:id -> BoardSummary    soft delete: deleted_at = now(), purged after 30 days

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Ctx): Promise<Response> {
  try {
    const { userId, supabase } = await requireOwner();
    const parsed = patchBoardBody.safeParse(await readJson(request));
    if (!parsed.success) return json(400, { error: "invalid-body" });
    const { id } = await params;
    const res = await updateBoard(supabase, userId, id, parsed.data);
    return res.ok ? json(200, res.value) : failureResponse(res);
  } catch (e) {
    return responseFromError(e);
  }
}

export async function DELETE(_request: Request, { params }: Ctx): Promise<Response> {
  try {
    const { userId, supabase } = await requireOwner();
    const { id } = await params;
    const res = await trashBoard(supabase, userId, id);
    return res.ok ? json(200, res.value) : failureResponse(res);
  } catch (e) {
    return responseFromError(e);
  }
}
