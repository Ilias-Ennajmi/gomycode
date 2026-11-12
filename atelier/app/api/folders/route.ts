import { requireOwner, responseFromError } from "@/lib/server/owner";
import { createFolder, createFolderBody, failureResponse, json, listLibrary, readJson } from "@/lib/server/boards";

// GET  /api/folders -> { folders }
// POST /api/folders { name, parentId? } -> Folder

export async function GET(): Promise<Response> {
  try {
    const { userId, supabase } = await requireOwner();
    const list = await listLibrary(supabase, userId);
    return list.ok ? json(200, { folders: list.value.folders }) : failureResponse(list);
  } catch (e) {
    return responseFromError(e);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const { userId, supabase } = await requireOwner();
    const parsed = createFolderBody.safeParse(await readJson(request));
    if (!parsed.success) return json(400, { error: "invalid-body" });
    const made = await createFolder(supabase, userId, parsed.data);
    return made.ok ? json(201, made.value) : failureResponse(made);
  } catch (e) {
    return responseFromError(e);
  }
}
