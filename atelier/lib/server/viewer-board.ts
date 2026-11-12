import * as Y from "yjs";
import { isAssetId } from "@/lib/assets/asset-id";
import { isVariantName, type VariantName } from "@/lib/assets/variants";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { fragmentToBlocks, type RichBlock } from "@/lib/engine/export/text-layout";
import { boundsOf } from "@/lib/engine/geometry/rect";
import { isAllowedEmbedUrl } from "@/lib/engine/links/embed";
import { compareByIndex } from "@/lib/engine/model/index-order";
import type { ArrowObj, CanvasObject, FrameObj } from "@/lib/engine/model/types";
import { creditLine, sanitizeSourceUrl } from "@/lib/engine/provenance/validate";
import type { LinkRow } from "@/lib/share/link";
import { requireVisitor, type GuardDeps } from "@/lib/share/guard";
import type { Round, RoundDiff } from "@/lib/share/round-types";
import type { ViewerAsset, ViewerBlock, ViewerBoard, ViewerObject, ViewerRun, ViewerSlide } from "@/lib/viewer/viewer-types";
import { jsonResponse } from "./http";
import { getShareStore, type ShareStore, type ViewerAssetRow, type Visitor } from "./share-store";

/*
 * The board a visitor sees. The server reads the board's state (a round's frozen snapshot, or the live merged state), decodes
 * it, and writes out a plain JSON `ViewerBoard`: only what the viewer draws, nothing that identifies the owner, nothing from
 * outside the link's scope, no Yjs. See lib/viewer/viewer-types.ts for the redaction rules; the ones that matter most:
 *   - presenter notes never leave the server; provenance, credits and source links only when the link shows credits;
 *   - a frames link exposes the listed frames and what is parented INSIDE them (never what merely overlaps them), plus arrows
 *     whose ends are both exposed; everything else, its text, ids and assets, is absent from the JSON;
 *   - only assets the exposed objects use are listed; embeds and links are re-checked; rich text is runs of plain text.
 */

export const MAX_VIEWER_OBJECTS = 20_000;
/** Vercel answers up to 4.5 MB; leave room for headers. */
export const MAX_VIEWER_JSON_BYTES = 4_000_000;
const MAX_TEXT_CHARS = 20_000;
const MAX_RUNS_PER_OBJECT = 2_000;
const MAX_DEPTH = 64;

export class ViewerBoardTooLargeError extends Error {
  constructor(public readonly count: number) {
    super(`Board has ${count} objects; the viewer limit is ${MAX_VIEWER_OBJECTS}`);
    this.name = "ViewerBoardTooLargeError";
  }
}

// ---- helpers --------------------------------------------------------------------------------------------------------

const r2 = (v: number): number => Math.round(v * 100) / 100;

function isWebUrl(v: unknown, protocols: readonly string[]): boolean {
  if (typeof v !== "string" || v.length === 0 || v.length > 2048) return false;
  try {
    return protocols.includes(new URL(v).protocol);
  } catch {
    return false;
  }
}

function cleanBlocks(blocks: RichBlock[]): ViewerBlock[] {
  const out: ViewerBlock[] = [];
  let chars = 0;
  let runCount = 0;
  for (const b of blocks) {
    const runs: ViewerRun[] = [];
    for (const r of b.runs) {
      if (chars >= MAX_TEXT_CHARS || runCount >= MAX_RUNS_PER_OBJECT) break;
      const text = r.text.slice(0, MAX_TEXT_CHARS - chars);
      chars += text.length;
      runCount++;
      const run: ViewerRun = { text, marks: [...r.marks] };
      if (r.href !== undefined && isWebUrl(r.href, ["http:", "https:", "mailto:"])) run.href = r.href;
      if (r.size !== undefined) run.size = r.size;
      runs.push(run);
    }
    const block: ViewerBlock = { kind: b.kind, runs };
    if (b.listType) block.listType = b.listType;
    if (b.index !== undefined) block.index = b.index;
    if (b.align) block.align = b.align;
    if (b.lineHeight !== undefined) block.lineHeight = b.lineHeight;
    out.push(block);
    if (chars >= MAX_TEXT_CHARS) break;
  }
  return out;
}

/** Presentation order: by `order`, then z-index, then id; frames without an order go last (the same rule as lib/engine/present/slides.ts). */
function compareSlides(a: FrameObj, b: FrameObj): number {
  const oa = a.order.trim() !== "";
  const ob = b.order.trim() !== "";
  if (oa !== ob) return oa ? -1 : 1;
  if (oa && a.order !== b.order) return a.order < b.order ? -1 : 1;
  return compareByIndex(a, b);
}

/** Variant names of an assets row: the stored jsonb is `{ w256: true, ... }` (an array of names is read too). */
function variantsOf(v: unknown): VariantName[] {
  const names = Array.isArray(v) ? v : v && typeof v === "object" ? Object.entries(v as Record<string, unknown>).filter(([, on]) => on).map(([k]) => k) : [];
  return (names.filter(isVariantName) as VariantName[]).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
}

const PREVIEW_KEY = /^p\/[A-Za-z0-9_-]{1,64}\/[A-Za-z0-9_-]{1,40}-w(?:480|1280)\.webp$/;

// ---- the view of a state through a link -----------------------------------------------------------------------------

interface View {
  /** Paint order. */
  objects: ViewerObject[];
  slides: { frame: FrameObj; id: string; name: string }[];
  /** For every exposed object: the frame it is in as far as this link is concerned (null = in none). */
  frameOf: Map<string, string | null>;
  assetIds: Set<string>;
}

const EMPTY_VIEW: View = { objects: [], slides: [], frameOf: new Map(), assetIds: new Set() };

type ScopeKey = Pick<LinkRow, "scope" | "frameIds" | "showCredits">;
const keyOf = (l: ScopeKey) => `${l.scope}|${[...l.frameIds].sort().join(",")}|${l.showCredits ? 1 : 0}`;
const viewCache = new WeakMap<Uint8Array, Map<string, View>>();

function usable(o: CanvasObject): boolean {
  if (o.type === "embed") return isWebUrl(o.url, ["http:", "https:"]) && isAllowedEmbedUrl(o.embedUrl);
  if (o.type === "link") return isWebUrl(o.url, ["http:", "https:"]);
  return true;
}

function boundIds(a: ArrowObj): string[] {
  return [a.start, a.end].flatMap((t) => (t.kind === "bound" ? [t.id] : []));
}

function computeView(state: Uint8Array, link: ScopeKey): View {
  const ydoc = new Y.Doc();
  let doc: BoardDoc | null = null;
  try {
    try {
      Y.applyUpdate(ydoc, state);
    } catch {
      return EMPTY_VIEW; // an unreadable state shows an empty board rather than failing the whole page
    }
    doc = new BoardDoc(ydoc);
    return computeViewOf(doc, link);
  } finally {
    doc?.destroy();
    ydoc.destroy();
  }
}

function computeViewOf(doc: BoardDoc, link: ScopeKey): View {
  const objs = doc.all().filter(usable);
  const byId = new Map(objs.map((o) => [o.id, o]));

  /** Ancestors, nearest first; stops at a missing parent, a cycle or MAX_DEPTH. */
  const ancestors = (o: CanvasObject): CanvasObject[] => {
    const out: CanvasObject[] = [];
    const seen = new Set<string>([o.id]);
    let p = o.parentId === null ? undefined : byId.get(o.parentId);
    while (p && !seen.has(p.id) && out.length < MAX_DEPTH) {
      out.push(p);
      seen.add(p.id);
      p = p.parentId === null ? undefined : byId.get(p.parentId);
    }
    return out;
  };

  // 1. Scope: who is in.
  const frameSet = new Set(link.frameIds);
  const included = new Set<string>();
  if (link.scope === "board") {
    for (const o of objs) included.add(o.id);
  } else {
    for (const o of objs) {
      if (o.type === "frame" && frameSet.has(o.id)) included.add(o.id);
      else if (ancestors(o).some((a) => a.type === "frame" && frameSet.has(a.id))) included.add(o.id);
    }
  }

  // 2. Arrows keep both ends or go. A free arrow (not inside any frame) of a frames link needs BOTH ends bound to exposed objects.
  const dropped = new Set<string>();
  for (const o of objs) {
    if (o.type !== "arrow") continue;
    const ends = boundIds(o);
    if (included.has(o.id)) {
      if (ends.some((id) => !included.has(id))) dropped.add(o.id);
    } else if (link.scope === "frames" && o.parentId === null && ends.length === 2 && ends.every((id) => included.has(id))) {
      included.add(o.id);
    }
  }
  for (const id of dropped) included.delete(id);

  // 3. Parents, paint order (parents before children, siblings by z-order), cycles cut.
  const parentOf = (o: CanvasObject): string | null => (o.parentId !== null && included.has(o.parentId) ? o.parentId : null);
  const kids = new Map<string | null, CanvasObject[]>();
  for (const o of objs) {
    if (!included.has(o.id)) continue;
    const p = parentOf(o);
    (kids.get(p) ?? kids.set(p, []).get(p)!).push(o);
  }
  for (const list of kids.values()) list.sort(compareByIndex);
  type Placed = { o: CanvasObject; parent: string | null };
  const order: Placed[] = [];
  const done = new Set<string>();
  const walk = (first: Placed[]) => {
    const stack = [...first].reverse();
    while (stack.length) {
      const item = stack.pop()!;
      if (done.has(item.o.id)) continue;
      done.add(item.o.id);
      order.push(item);
      const children = kids.get(item.o.id);
      if (children) for (let i = children.length - 1; i >= 0; i--) stack.push({ o: children[i], parent: item.o.id });
    }
  };
  walk((kids.get(null) ?? []).map((o) => ({ o, parent: null })));
  // Whatever is left sits in a parent cycle: it is shown as a root (its parent id is not sent).
  for (const o of objs) if (included.has(o.id) && !done.has(o.id)) walk([{ o, parent: null }]);

  // 4. Redacted objects, the frame of each, the assets they use.
  const frameOf = new Map<string, string | null>();
  const assetIds = new Set<string>();
  const objects: ViewerObject[] = [];
  const noteAsset = (id: unknown) => {
    if (typeof id === "string" && isAssetId(id)) assetIds.add(id);
  };
  for (const { o, parent } of order) {
    const chain = [o, ...ancestors(o)];
    const home = chain.find((c) => c.type === "frame" && (link.scope === "board" || frameSet.has(c.id)));
    frameOf.set(o.id, home ? home.id : null);

    const v = {
      ...o,
      x: r2(o.x),
      y: r2(o.y),
      w: r2(o.w),
      h: r2(o.h),
      rotation: Math.round(o.rotation * 10_000) / 10_000,
      parentId: parent,
      locked: false,
      createdAt: 0,
      updatedAt: 0,
    } as ViewerObject;

    switch (v.type) {
      case "frame":
        v.notes = "";
        break;
      case "image":
        noteAsset(v.assetId);
        if (!link.showCredits) v.provenance = null;
        break;
      case "video":
        noteAsset(v.assetId);
        noteAsset(v.posterAssetId);
        if (!link.showCredits) v.provenance = null;
        break;
      case "link":
        noteAsset(v.imageAssetId);
        break;
      case "typeSpecimen":
        if (!link.showCredits) {
          v.sourceUrl = "";
          v.licenceNote = "";
        }
        break;
      case "text":
      case "sticky":
      case "shape": {
        const frag = doc.content(o.id);
        if (frag) v.blocks = cleanBlocks(fragmentToBlocks(frag));
        break;
      }
      default:
        break;
    }
    objects.push(v);
  }

  // 5. Slides: exposed top-level frames in presentation order.
  const slides = objects
    .filter((o): o is FrameObj & ViewerObject => o.type === "frame" && o.parentId === null)
    .sort(compareSlides)
    .map((f, i) => ({ frame: f as FrameObj, id: f.id, name: f.name.trim() === "" ? `Slide ${i + 1}` : f.name }));

  return { objects, slides, frameOf, assetIds };
}

function viewFor(state: Uint8Array, link: ScopeKey): View {
  let byKey = viewCache.get(state);
  if (!byKey) viewCache.set(state, (byKey = new Map()));
  const key = keyOf(link);
  let v = byKey.get(key);
  if (!v) byKey.set(key, (v = computeView(state, link)));
  return v;
}

/** The asset ids the objects a link exposes use (what to look up before building). */
export function exposedAssetIds(state: Uint8Array, link: ScopeKey): string[] {
  return [...viewFor(state, link).assetIds];
}

/**
 * Whether a visitor of `link` can see object `objectId` of `state`, and which frame it counts as being in (the nearest frame
 * around it that this link exposes; null for an object in no frame). null = not visible: out of scope, dropped, unknown.
 * Reactions and comments are accepted only for visible objects.
 */
export function visibleObject(state: Uint8Array, link: ScopeKey, objectId: string): { frameId: string | null } | null {
  const view = viewFor(state, link);
  return view.frameOf.has(objectId) ? { frameId: view.frameOf.get(objectId) ?? null } : null;
}

// ---- building -------------------------------------------------------------------------------------------------------

export interface BuildInput {
  state: Uint8Array;
  link: LinkRow;
  round: Round | null;
  title: string;
  /** Rows of the assets table; only the ones the exposed objects use are read. */
  assets: ViewerAssetRow[];
  visitor: Pick<Visitor, "id" | "displayName">;
  /** The diffs of every round published after the visitor's last one (up to and including this round). */
  diffsSinceLastView: RoundDiff[];
  sinceRound: number | null;
  assetBase: string;
}

export function buildViewerBoard(input: BuildInput, limits: { maxObjects?: number } = {}): ViewerBoard {
  const { link, round } = input;
  const view = viewFor(input.state, link);
  if (view.objects.length > (limits.maxObjects ?? MAX_VIEWER_OBJECTS)) throw new ViewerBoardTooLargeError(view.objects.length);

  const assets: Record<string, ViewerAsset> = {};
  for (const row of input.assets) {
    if (!view.assetIds.has(row.id)) continue;
    const w = Number(row.width);
    const h = Number(row.height);
    if (row.kind !== "image" && row.kind !== "video" && row.kind !== "gif") continue;
    if (!(w > 0) || !(h > 0)) continue;
    const showCredit = link.showCredits;
    const sourceUrl = showCredit ? sanitizeSourceUrl(row.source_url) : null;
    const line = showCredit ? creditLine({ sourceUrl, credit: row.credit ?? "", licence: row.licence ?? "", capturedAt: null }) : "";
    assets[row.id] = { w, h, kind: row.kind, variants: variantsOf(row.variants), credit: line || null, sourceUrl };
  }

  const url = (key: string | undefined): string | null => (key && input.assetBase && PREVIEW_KEY.test(key) ? `${input.assetBase}/${key}` : null);
  const slides: ViewerSlide[] = view.slides.map(({ frame, id, name }) => {
    const box = boundsOf(frame);
    const p = round?.previews[id];
    return { id, name, x: r2(box.x), y: r2(box.y), w: r2(box.w), h: r2(box.h), previewW480: url(p?.w480), previewW1280: url(p?.w1280) };
  });

  let changed: ViewerBoard["changed"] = null;
  if (input.sinceRound !== null && input.diffsSinceLastView.length > 0) {
    const shown = new Set(slides.map((s) => s.id));
    const byFrame: Record<string, { added: number; changed: number }> = {};
    for (const d of input.diffsSinceLastView) {
      for (const [frameId, c] of Object.entries(d.byFrame)) {
        if (!shown.has(frameId)) continue; // never a count for a frame this link does not expose
        const into = (byFrame[frameId] ??= { added: 0, changed: 0 });
        into.added += c.added;
        into.changed += c.changed;
      }
    }
    changed = { sinceRound: input.sinceRound, byFrame };
  }

  return {
    board: { title: input.title, background: null },
    round: round ? { id: round.id, number: round.number, label: round.label, publishedAt: round.publishedAt } : null,
    slides,
    objects: view.objects,
    assets,
    assetBase: input.assetBase,
    options: {
      permission: link.permission,
      allowDownload: link.allowDownload,
      watermark: link.watermark,
      showCredits: link.showCredits,
      blindVotes: link.blindVotes,
      votesRevealed: link.votesRevealed,
      welcomeNote: link.welcomeNote,
    },
    changed,
    visitor: { id: input.visitor.id, name: input.visitor.displayName },
  };
}

// ---- loading --------------------------------------------------------------------------------------------------------

const notFound = () => jsonResponse(404, { error: "not-found" });

/**
 * The state a link shows: a round link its round's frozen snapshot, a live link the board's merged current state (an empty
 * state for a board nobody has edited). THROWS a 404 Response when a round link's round is missing or not this board's.
 */
export async function loadLinkState(store: ShareStore, link: LinkRow): Promise<{ state: Uint8Array; round: Round | null }> {
  if (link.mode === "round") {
    const round = link.roundId ? await store.getRound(link.roundId) : null;
    if (!round || round.boardId !== link.boardId) throw notFound();
    const state = await store.getSnapshotState(round.snapshotId, link.boardId);
    if (!state) throw notFound();
    return { state, round };
  }
  const state = await store.getLiveState(link.boardId);
  return { state: state ?? Y.encodeStateAsUpdate(new Y.Doc()), round: null };
}

/** `https://{public R2 host}` from the environment, or "". */
export function assetBaseFromEnv(env: Record<string, string | undefined> = process.env): string {
  const host = (env.NEXT_PUBLIC_R2_PUBLIC_HOST || env.R2_PUBLIC_HOST || "").trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  return /^[A-Za-z0-9.-]+(?::\d{1,5})?$/.test(host) ? `https://${host}` : "";
}

/**
 * Everything the route does after the guard: state, assets, the "what changed" diffs, build, and remember which round this
 * visitor has now seen. Call it once per page view: it moves the visitor's `lastRoundId`.
 */
export async function loadViewerBoard(a: {
  store: ShareStore;
  link: LinkRow;
  visitor: Visitor;
  assetBase: string;
  limits?: { maxObjects?: number };
}): Promise<ViewerBoard> {
  const { store, link, visitor } = a;
  const { state, round } = await loadLinkState(store, link);
  const title = (await store.getBoardTitle(link.boardId)) ?? "Untitled";
  const rows = await store.getAssets(exposedAssetIds(state, link));

  let diffs: RoundDiff[] = [];
  let sinceRound: number | null = null;
  if (round && visitor.lastRoundId) {
    const last = await store.getRound(visitor.lastRoundId);
    if (last && last.boardId === link.boardId && last.number < round.number) {
      sinceRound = last.number;
      diffs = (await store.listRounds(link.boardId)).filter((r) => r.number > last.number && r.number <= round.number).map((r) => r.diff);
    }
  }

  const board = buildViewerBoard({ state, link, round, title, assets: rows, visitor, diffsSinceLastView: diffs, sinceRound, assetBase: a.assetBase }, a.limits);
  if (round) await store.touchVisitor(visitor.id, { lastRoundId: round.id });
  return board;
}

// ---- GET /api/s/[token]/board ---------------------------------------------------------------------------------------

export interface BoardRouteDeps extends GuardDeps {
  assetBase?: string;
  limits?: { maxObjects?: number };
  maxBytes?: number;
}

export async function handleBoard(req: Request, token: string, deps: BoardRouteDeps = {}): Promise<Response> {
  try {
    const g = await requireVisitor(req, token, {}, deps);
    const board = await loadViewerBoard({ store: deps.store ?? getShareStore(), link: g.link, visitor: g.visitor, assetBase: deps.assetBase ?? assetBaseFromEnv(), limits: deps.limits });
    const body = JSON.stringify(board);
    if (new TextEncoder().encode(body).byteLength > (deps.maxBytes ?? MAX_VIEWER_JSON_BYTES)) return jsonResponse(413, { error: "too-large" });
    const headers = new Headers({
      "content-type": "application/json; charset=utf-8",
      // A published round never changes, so a short private cache is safe; a live board must always be fresh.
      "cache-control": g.link.mode === "round" ? "private, max-age=30" : "private, no-store",
    });
    if (g.cookieHeader) headers.append("set-cookie", g.cookieHeader);
    return new Response(body, { status: 200, headers });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof ViewerBoardTooLargeError) return jsonResponse(413, { error: "too-large" });
    throw e;
  }
}

// The viewer's block type must stay interchangeable with the export engine's, or rich text would drift between the two.
type Assert<T extends true> = T;
export type _BlocksMatchExportEngine = [Assert<RichBlock extends ViewerBlock ? true : false>, Assert<ViewerBlock extends RichBlock ? true : false>];
