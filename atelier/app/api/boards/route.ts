import { requireOwner, responseFromError } from "@/lib/server/owner";
import { createBoard, createBoardBody, failureResponse, json, listLibrary, readJson } from "@/lib/server/boards";

// GET  /api/boards -> { boards, trash, folders }   the owner's library (trash = deleted within 30 days)
// POST /api/boards { title?, folderId?, templateId? } -> { id }
//      The template's objects are built by the browser into the new board's local document and
//      pushed by the board's first sync, so the server only records the board.

export async function GET(): Promise<Response> {
  try {
    const { userId, supabase } = await requireOwner();
    const list = await listLibrary(supabase, userId);
    return list.ok ? json(200, list.value) : failureResponse(list);
  } catch (e) {
    return responseFromError(e);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const { userId, supabase } = await requireOwner();
    const parsed = createBoardBody.safeParse(await readJson(request));
    if (!parsed.success) return json(400, { error: "invalid-body" });
    const made = await createBoard(supabase, userId, parsed.data);
    return made.ok ? json(201, made.value) : failureResponse(made);
  } catch (e) {
    return responseFromError(e);
  }
}
