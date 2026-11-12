import { z } from "zod";
import { isAssetId } from "@/lib/assets/asset-id";
import { INBOX_FULL_MESSAGE, INBOX_LIMIT, MAX_INBOX_CREDIT, MAX_INBOX_TEXT, MAX_INBOX_TITLE, webUrl, type InboxItem } from "@/lib/inbox/types";
import type { AtelierServerClient } from "@/lib/supabase/server";
import type { InboxItemRow } from "@/lib/supabase/types";
import { json } from "./boards";

export { INBOX_LIMIT };

type Db = AtelierServerClient;

const optionalText = (max: number) => z.string().max(max).nullable().optional();
const optionalWeb = z
  .string()
  .nullable()
  .optional()
  .refine((v) => v == null || v === "" || webUrl(v) !== null, "http(s) link");

/** The body of POST /api/inbox. Strict: nothing but these fields is accepted (never an owner or a placed time). */
export const newItemSchema = z
  .object({
    kind: z.enum(["image", "video", "url", "text"]),
    assetId: z.string().nullable().optional(),
    url: optionalText(2048),
    text: optionalText(MAX_INBOX_TEXT),
    title: optionalText(MAX_INBOX_TITLE),
    sourceUrl: optionalWeb,
    credit: optionalText(MAX_INBOX_CREDIT),
  })
  .strict();

export type ParsedNewItem = { kind: InboxItem["kind"]; assetId: string | null; url: string | null; text: string | null; title: string | null; sourceUrl: string | null; credit: string | null };

/** Validated, trimmed fields for one new item; null when the body does not describe a valid item. */
export function parseNewItem(raw: unknown): ParsedNewItem | null {
  const parsed = newItemSchema.safeParse(raw);
  if (!parsed.success) return null;
  const d = parsed.data;
  const blank = (v: string | null | undefined) => (v == null || v.trim() === "" ? null : v);
  const item: ParsedNewItem = {
    kind: d.kind,
    assetId: d.assetId ?? null,
    url: d.url == null ? null : webUrl(d.url),
    text: blank(d.text),
    title: blank(d.title?.trim()),
    sourceUrl: blank(d.sourceUrl),
    credit: blank(d.credit?.trim()),
  };
  if (d.kind === "image" || d.kind === "video") {
    if (!isAssetId(item.assetId)) return null;
    return { ...item, url: null, text: null };
  }
  if (item.assetId !== null) return null;
  if (d.kind === "url") return item.url ? { ...item, text: null } : null;
  return item.text ? { ...item, url: null } : null;
}

export function toItem(r: InboxItemRow): InboxItem {
  return {
    id: r.id,
    kind: r.kind,
    assetId: r.asset_id,
    url: r.url,
    text: r.text_body,
    title: r.title,
    sourceUrl: r.source_url,
    credit: r.credit,
    createdAt: r.created_at,
    placedAt: r.placed_at,
  };
}

export const failure = (status: number, error: string, extra: Record<string, unknown> = {}) => json(status, { error, ...extra });
export const serverError = () => failure(500, "database-error");

export const COLUMNS = "id,kind,asset_id,url,text_body,title,source_url,credit,created_at,placed_at";

/** Number of items still waiting (not placed). null when the count could not be read. */
export async function countUnplaced(db: Db, userId: string): Promise<number | null> {
  const { count, error } = await db.from("inbox_items").select("id", { count: "exact", head: true }).eq("owner_id", userId).is("placed_at", null);
  return error || count === null ? null : count;
}

export { INBOX_FULL_MESSAGE };
