import { isAssetId } from "@/lib/assets/asset-id";
import { isVariantName, type VariantName } from "@/lib/assets/variants";
import { similarMap } from "@/lib/assets/library-cluster";
import { filterAndSort, type LibraryFilter } from "@/lib/assets/library-query";
import type { LibraryAsset } from "@/lib/assets/library-types";
import type { AssetMeta } from "@/lib/assets/meta-store";
import type { AtelierServerClient } from "@/lib/supabase/server";

/*
 * The asset library: what the owner has collected, where it is used, and which pictures are near-copies of each other.
 * Everything runs as the owner (RLS) with an explicit owner filter on top. PostgREST answers at most 1,000 rows per
 * request, so lists are read in pages; a personal library (a few thousand assets) costs a handful of round trips.
 */

type Db = AtelierServerClient;

const PAGE = 1000;
/** A hard stop on paging so a runaway table cannot hold a request open: 50,000 rows per list. */
const MAX_PAGES = 50;
/** Ids per `in (...)` filter: keeps the request URL short. */
const ID_CHUNK = 100;

export { clusterByHash, DUPLICATE_DISTANCE, similarMap, type HashItem } from "@/lib/assets/library-cluster";
export type { LibraryAsset } from "@/lib/assets/library-types";

type Row = Record<string, unknown>;
type Page = PromiseLike<{ data: unknown; error: unknown }>;

/** Reads every page of a query; null when any page fails. */
async function pageAll(build: (from: number, to: number) => Page): Promise<Row[] | null> {
  const out: Row[] = [];
  for (let p = 0; p < MAX_PAGES; p++) {
    const { data, error } = await build(p * PAGE, p * PAGE + PAGE - 1);
    if (error || !Array.isArray(data)) return null;
    out.push(...(data as Row[]));
    if (data.length < PAGE) return out;
  }
  return out;
}

const ASSET_COLUMNS = "id,kind,mime,width,height,bytes,variants,palette,phash,title,credit,source_url,licence,captured_at,created_at,analysis_version";

/** All of the owner's visible (not hidden) assets, newest first. */
export function readAssetRows(db: Db, userId: string): Promise<Row[] | null> {
  return pageAll((from, to) =>
    db.from("assets").select(ASSET_COLUMNS).eq("owner_id", userId).neq("hidden", true).order("created_at", { ascending: false }).order("id").range(from, to),
  );
}

export async function readAssetRow(db: Db, userId: string, id: string): Promise<{ row: Row | null; error: boolean }> {
  const { data, error } = await db.from("assets").select(ASSET_COLUMNS).eq("id", id).eq("owner_id", userId).maybeSingle();
  if (error) return { row: null, error: true };
  return { row: (data as Row | null) ?? null, error: false };
}

export type Usage = {
  /** asset id -> ids of every board that has a row for it (trashed boards included). */
  byAsset: Map<string, string[]>;
  /** board id -> title and whether it is in the trash. */
  boards: Map<string, { title: string; trashed: boolean }>;
};

/** Which boards use which assets. `assetIds` narrows it (a single asset, or a page); omitted reads everything of the owner. */
export async function readUsage(db: Db, userId: string, assetIds?: string[]): Promise<Usage | null> {
  const rows: Row[] = [];
  const chunks = assetIds ? chunk(assetIds, ID_CHUNK) : [null];
  for (const ids of chunks) {
    const part = await pageAll((from, to) => {
      let q = db.from("asset_usages").select("asset_id,board_id");
      if (ids) q = q.in("asset_id", ids);
      return q.order("asset_id").order("board_id").range(from, to);
    });
    if (!part) return null;
    rows.push(...part);
  }

  // Titles and trash state of the boards involved: all of the owner's boards for the whole library, only the ones named for a narrower question.
  const boardRows: Row[] = [];
  const boardIds = assetIds ? [...new Set(rows.map((r) => String(r.board_id)))] : null;
  for (const ids of boardIds ? chunk(boardIds, ID_CHUNK) : [null]) {
    const part = await pageAll((from, to) => {
      let q = db.from("boards").select("id,title,deleted_at").eq("owner_id", userId);
      if (ids) q = q.in("id", ids);
      return q.order("id").range(from, to);
    });
    if (!part) return null;
    boardRows.push(...part);
  }
  const boards = new Map<string, { title: string; trashed: boolean }>();
  for (const b of boardRows) {
    if (typeof b.id === "string") boards.set(b.id, { title: typeof b.title === "string" ? b.title : "Untitled", trashed: b.deleted_at != null });
  }

  const byAsset = new Map<string, string[]>();
  for (const r of rows) {
    if (typeof r.asset_id !== "string" || typeof r.board_id !== "string" || !boards.has(r.board_id)) continue; // not the owner's board
    const list = byAsset.get(r.asset_id);
    if (list) list.push(r.board_id);
    else byAsset.set(r.asset_id, [r.board_id]);
  }
  return { byAsset, boards };
}

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Live-board usage of one asset. */
export function usageOf(usage: Usage, assetId: string): { live: { id: string; title: string }[]; trashed: number } {
  const live: { id: string; title: string }[] = [];
  let trashed = 0;
  for (const boardId of usage.byAsset.get(assetId) ?? []) {
    const b = usage.boards.get(boardId);
    if (!b) continue;
    if (b.trashed) trashed++;
    else live.push({ id: boardId, title: b.title });
  }
  return { live, trashed };
}

const isoOrNull = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

export function toLibraryAsset(r: Row, usage: Usage, similarTo: string[]): LibraryAsset | null {
  const width = r.width;
  const height = r.height;
  if (typeof r.id !== "string" || typeof width !== "number" || typeof height !== "number" || !(width > 0) || !(height > 0)) return null;
  if (r.kind !== "image" && r.kind !== "video" && r.kind !== "gif") return null;
  const stored = r.variants && typeof r.variants === "object" && !Array.isArray(r.variants) ? (r.variants as Record<string, unknown>) : {};
  const variants = (Object.keys(stored).filter((k) => isVariantName(k) && stored[k]) as VariantName[]).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  const { live } = usageOf(usage, r.id);
  const credit = typeof r.credit === "string" ? r.credit : "";
  const licence = typeof r.licence === "string" ? r.licence : "";
  const sourceUrl = isoOrNull(r.source_url);
  const capturedAt = isoOrNull(r.captured_at);
  return {
    id: r.id,
    kind: r.kind,
    width,
    height,
    bytes: typeof r.bytes === "number" ? r.bytes : Number(r.bytes) || 0,
    variants,
    palette: Array.isArray(r.palette) ? (r.palette as AssetMeta["palette"]) : null,
    phash: typeof r.phash === "string" ? r.phash : null,
    title: typeof r.title === "string" ? r.title : "",
    provenance: sourceUrl || credit || licence || capturedAt ? { sourceUrl, credit, licence, capturedAt: capturedAt ? capturedAt.slice(0, 10) : null } : null,
    analysisVersion: typeof r.analysis_version === "number" ? r.analysis_version : 0,
    usedIn: live.length,
    boards: live.slice(0, 5),
    createdAt: typeof r.created_at === "string" ? r.created_at : "",
    similarTo,
  };
}

// ---- list query -----------------------------------------------------------------------------------------

export type LibraryQuery = LibraryFilter & { limit: number; before: string | null };

export type ParsedQuery = { ok: true; q: LibraryQuery } | { ok: false };

/** Parses the query string of GET /api/assets (the list form). Anything unrecognised is a 400, not a guess. */
export function parseLibraryQuery(params: URLSearchParams): ParsedQuery {
  const sort = params.get("sort") ?? "recent";
  if (sort !== "recent" && sort !== "used" && sort !== "size") return { ok: false };
  const kind = params.get("kind");
  if (kind !== null && kind !== "" && kind !== "image" && kind !== "video" && kind !== "gif") return { ok: false };
  const rawLimit = params.get("limit");
  let limit = 100;
  if (rawLimit !== null) {
    if (!/^\d{1,4}$/.test(rawLimit)) return { ok: false };
    limit = Number(rawLimit);
    if (limit < 1 || limit > 200) return { ok: false };
  }
  const before = params.get("before");
  if (before !== null && before !== "" && !Number.isFinite(Date.parse(before))) return { ok: false };
  return {
    ok: true,
    q: { query: (params.get("query") ?? "").trim().slice(0, 200), kind: kind ? (kind as LibraryFilter["kind"]) : null, sort, unused: params.get("unused") === "1", limit, before: before || null },
  };
}

/** The list the library page shows: filtered, sorted and cut to `limit`. `before` pages the recent sort by creation time. */
export async function listLibrary(db: Db, userId: string, q: LibraryQuery): Promise<LibraryAsset[] | null> {
  const rows = await readAssetRows(db, userId);
  if (!rows) return null;
  const usage = await readUsage(db, userId);
  if (!usage) return null;
  const similar = similarMap(rows.map((r) => ({ id: String(r.id), phash: typeof r.phash === "string" ? r.phash : null })));
  const all: LibraryAsset[] = [];
  for (const r of rows) {
    const a = toLibraryAsset(r, usage, similar.get(String(r.id)) ?? []);
    if (a) all.push(a);
  }
  let assets = filterAndSort(all, q);
  if (q.sort === "recent" && q.before) {
    const cut = Date.parse(q.before);
    assets = assets.filter((a) => Date.parse(a.createdAt) < cut);
  }
  return assets.slice(0, q.limit);
}

export const isAssetIdList = (v: unknown): v is string[] => Array.isArray(v) && v.every(isAssetId);
