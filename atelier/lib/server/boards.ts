import { z } from "zod";
import type { AtelierServerClient } from "@/lib/supabase/server";
import type { BoardRow, FolderRow } from "@/lib/supabase/types";
import { TEMPLATE_IDS } from "@/lib/engine/model/templates";
import { TRASH_DAYS, splitBoards, type BoardList, type BoardSummary, type Folder } from "@/lib/sync/board-list-cache";

export type { BoardList, BoardSummary, Folder };

/*
 * Board and folder logic behind /api/boards and /api/folders. Every query names the owner
 * explicitly on top of row-level security (two locks on one door), and nothing here trusts the
 * client for ids, clocks or ownership of a folder it wants to file a board in.
 */

type Db = AtelierServerClient;

export type Failure = { ok: false; status: number; error: string };
export type Result<T> = { ok: true; value: T } | Failure;

const fail = (status: number, error: string): Failure => ({ ok: false, status, error });
const done = <T>(value: T): Result<T> => ({ ok: true, value });
const DB_ERROR = fail(500, "database-error");

export function json(status: number, body: unknown): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

export function failureResponse(f: Failure): Response {
  return json(f.status, { error: f.error });
}

/** Reads a JSON body; null when it is missing or malformed. */
export async function readJson(request: Request): Promise<unknown | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

const guid = z.guid();
export const isGuid = (v: string) => guid.safeParse(v).success;

// ---- shapes ---------------------------------------------------------------------------------------------

export function toSummary(row: BoardRow): BoardSummary {
  return {
    id: row.id,
    title: row.title,
    folderId: row.folder_id,
    starred: row.starred,
    updatedAt: row.updated_at,
    lastOpenedAt: row.last_opened_at,
    deletedAt: row.deleted_at,
    preview: Array.isArray(row.preview) ? row.preview.filter((v): v is string => typeof v === "string").slice(0, 4) : [],
  };
}

export function toFolder(row: FolderRow): Folder {
  return { id: row.id, name: row.name, parentId: row.parent_id, sort: row.sort };
}

// ---- boards ---------------------------------------------------------------------------------------------

export async function listLibrary(db: Db, userId: string, now: number = Date.now()): Promise<Result<BoardList>> {
  const [boards, folders] = await Promise.all([
    db.from("boards").select("*").eq("owner_id", userId),
    db.from("folders").select("*").eq("owner_id", userId),
  ]);
  if (boards.error || folders.error) return DB_ERROR;
  return done({
    ...splitBoards((boards.data ?? []).map(toSummary), now),
    folders: (folders.data ?? []).map(toFolder),
  });
}

const title = z.string().trim().min(1).max(300);

export const createBoardBody = z.strictObject({
  title: title.optional(),
  folderId: guid.nullable().optional(),
  templateId: z.enum(TEMPLATE_IDS).optional(),
});

export const patchBoardBody = z
  .strictObject({
    title,
    folderId: guid.nullable(),
    starred: z.boolean(),
    /** null restores; a timestamp trashes (the server's own clock is what gets stored). */
    deletedAt: z.iso.datetime().nullable(),
    /** Any timestamp means "opened now". */
    lastOpenedAt: z.iso.datetime(),
    /** Up to four image asset ids for the card mosaic. */
    preview: z.array(guid).max(4),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "nothing to change");

async function ownsFolder(db: Db, userId: string, folderId: string): Promise<boolean | null> {
  const { data, error } = await db.from("folders").select("id").eq("id", folderId).eq("owner_id", userId).maybeSingle();
  return error ? null : data !== null;
}

export async function createBoard(db: Db, userId: string, input: z.infer<typeof createBoardBody>): Promise<Result<{ id: string }>> {
  if (input.folderId) {
    const owns = await ownsFolder(db, userId, input.folderId);
    if (owns === null) return DB_ERROR;
    if (!owns) return fail(404, "folder-not-found");
  }
  const { data, error } = await db
    .from("boards")
    .insert({ owner_id: userId, title: input.title ?? "Untitled", folder_id: input.folderId ?? null })
    .select("id")
    .single();
  if (error || !data) return DB_ERROR;
  return done({ id: data.id });
}

export async function updateBoard(
  db: Db,
  userId: string,
  id: string,
  input: z.infer<typeof patchBoardBody>,
  now: number = Date.now(),
): Promise<Result<BoardSummary>> {
  if (!isGuid(id)) return fail(404, "not-found");

  const current = await db.from("boards").select("*").eq("id", id).eq("owner_id", userId).maybeSingle();
  if (current.error) return DB_ERROR;
  if (!current.data) return fail(404, "not-found");

  if (input.folderId) {
    const owns = await ownsFolder(db, userId, input.folderId);
    if (owns === null) return DB_ERROR;
    if (!owns) return fail(404, "folder-not-found");
  }

  const patch: Partial<BoardRow> = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.folderId !== undefined) patch.folder_id = input.folderId;
  if (input.starred !== undefined) patch.starred = input.starred;
  if (input.preview !== undefined) patch.preview = input.preview;
  if (input.lastOpenedAt !== undefined) patch.last_opened_at = new Date(now).toISOString();
  if (input.deletedAt === null) {
    // Restoring: only while the board is still in the trash (30 days).
    if (current.data.deleted_at && now - Date.parse(current.data.deleted_at) > TRASH_DAYS * 86_400_000) {
      return fail(410, "expired");
    }
    patch.deleted_at = null;
  } else if (typeof input.deletedAt === "string" && !current.data.deleted_at) {
    patch.deleted_at = new Date(now).toISOString(); // deleting twice keeps the first time
  }

  if (Object.keys(patch).length === 0) return done(toSummary(current.data));
  const { data, error } = await db.from("boards").update(patch).eq("id", id).eq("owner_id", userId).select("*").single();
  if (error || !data) return DB_ERROR;
  return done(toSummary(data));
}

/** Soft delete: the row stays, with deleted_at = now, for 30 days. */
export function trashBoard(db: Db, userId: string, id: string, now: number = Date.now()): Promise<Result<BoardSummary>> {
  return updateBoard(db, userId, id, { deletedAt: new Date(now).toISOString() }, now);
}

// ---- folders --------------------------------------------------------------------------------------------

const folderName = z.string().trim().min(1).max(200);

export const createFolderBody = z.strictObject({ name: folderName, parentId: guid.nullable().optional() });
export const patchFolderBody = z
  .strictObject({ name: folderName, parentId: guid.nullable(), sort: z.number().finite() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "nothing to change");

export async function createFolder(db: Db, userId: string, input: z.infer<typeof createFolderBody>): Promise<Result<Folder>> {
  if (input.parentId) {
    const owns = await ownsFolder(db, userId, input.parentId);
    if (owns === null) return DB_ERROR;
    if (!owns) return fail(404, "folder-not-found");
  }
  const { data, error } = await db
    .from("folders")
    .insert({ owner_id: userId, name: input.name, parent_id: input.parentId ?? null })
    .select("*")
    .single();
  if (error || !data) return DB_ERROR;
  return done(toFolder(data));
}

export async function updateFolder(db: Db, userId: string, id: string, input: z.infer<typeof patchFolderBody>): Promise<Result<Folder>> {
  if (!isGuid(id)) return fail(404, "not-found");
  const all = await db.from("folders").select("*").eq("owner_id", userId);
  if (all.error) return DB_ERROR;
  const folders = all.data ?? [];
  const byId = new Map(folders.map((f) => [f.id, f]));
  if (!byId.has(id)) return fail(404, "not-found");

  const patch: Partial<FolderRow> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.sort !== undefined) patch.sort = input.sort;
  if (input.parentId !== undefined) {
    if (input.parentId !== null) {
      if (!byId.has(input.parentId)) return fail(404, "folder-not-found");
      // A folder cannot go inside itself or anything below it.
      const seen = new Set<string>();
      for (let cur: string | null = input.parentId; cur && !seen.has(cur); cur = byId.get(cur)?.parent_id ?? null) {
        if (cur === id) return fail(400, "cycle");
        seen.add(cur);
      }
    }
    patch.parent_id = input.parentId;
  }
  const { data, error } = await db.from("folders").update(patch).eq("id", id).eq("owner_id", userId).select("*").single();
  if (error || !data) return DB_ERROR;
  return done(toFolder(data));
}

/** Deletes a folder. Its sub-folders move up one level; its boards go back to the top level (foreign key). */
export async function deleteFolder(db: Db, userId: string, id: string): Promise<Result<{ id: string }>> {
  if (!isGuid(id)) return fail(404, "not-found");
  const found = await db.from("folders").select("*").eq("id", id).eq("owner_id", userId).maybeSingle();
  if (found.error) return DB_ERROR;
  if (!found.data) return fail(404, "not-found");
  const lift = await db.from("folders").update({ parent_id: found.data.parent_id }).eq("parent_id", id).eq("owner_id", userId);
  if (lift.error) return DB_ERROR;
  const { error } = await db.from("folders").delete().eq("id", id).eq("owner_id", userId);
  if (error) return DB_ERROR;
  return done({ id });
}
