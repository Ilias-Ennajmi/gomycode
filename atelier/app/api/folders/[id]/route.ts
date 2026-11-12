import { requireOwner, responseFromError } from "@/lib/server/owner";
import { deleteFolder, failureResponse, json, patchFolderBody, readJson, updateFolder } from "@/lib/server/boards";

// PATCH  /api/folders/:id { name?, parentId?, sort? } -> Folder   (400 when it would nest a folder inside itself)
// DELETE /api/folders/:id -> { id }   sub-folders move up a level, boards become unfiled

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Ctx): Promise<Response> {
  try {
    const { userId, supabase } = await requireOwner();
    const parsed = patchFolderBody.safeParse(await readJson(request));
    if (!parsed.success) return json(400, { error: "invalid-body" });
    const { id } = await params;
    const res = await updateFolder(supabase, userId, id, parsed.data);
    return res.ok ? json(200, res.value) : failureResponse(res);
  } catch (e) {
    return responseFromError(e);
  }
}

export async function DELETE(_request: Request, { params }: Ctx): Promise<Response> {
  try {
    const { userId, supabase } = await requireOwner();
    const { id } = await params;
    const res = await deleteFolder(supabase, userId, id);
    return res.ok ? json(200, res.value) : failureResponse(res);
  } catch (e) {
    return responseFromError(e);
  }
}
