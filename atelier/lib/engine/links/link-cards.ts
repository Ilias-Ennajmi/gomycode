import type { AssetUploader } from "@/lib/assets/upload-queue";
import { createLimiter } from "@/lib/assets/limiter";
import type { LinkPreview } from "@/lib/server/open-graph";
import { DERIVED_ORIGIN, type BoardDoc } from "../doc/board-doc";
import { defaultsFor } from "../model/defaults";
import type { ClassifiedUrl } from "./classify";
import { hostnameOf, parseHttpUrl } from "./url";
import type { LinkObj, Point } from "../model/types";

/** Size of a fresh link card, and of a finished one that has no picture. */
export const LINK_CARD_W = 320;
export const LINK_CARD_H = 240;
export const LINK_CARD_PLAIN_H = 128;
/** Width of a fresh embed. */
export const EMBED_W = 480;

/** At most this many page previews are fetched at once (the server allows 30 a minute, so a paste of many URLs queues). */
export const PREVIEW_CONCURRENCY = 2;

/** The preview cannot be made at all here (local-only mode, no server): the card stays a plain card with the domain. */
export class LinkPreviewUnavailable extends Error {
  constructor(message = "link previews are unavailable") {
    super(message);
    this.name = "LinkPreviewUnavailable";
  }
}

export type LinkCardDeps = {
  /** POST /api/link-preview. Rejects with LinkPreviewUnavailable when there is no server; any other rejection is a failure. */
  fetchPreview: (url: string) => Promise<LinkPreview>;
  /** The og:image bytes, fetched through the same-origin proxy (never directly from the third-party host). */
  fetchImage: (url: string) => Promise<Blob>;
  uploader: Pick<AssetUploader, "addAssetOnly">;
  online: () => boolean;
  /** Calls `cb` when the browser is online again; returns a canceller. Default: the window "online" event. */
  whenOnline?: (cb: () => void) => () => void;
};

const limit = createLimiter(PREVIEW_CONCURRENCY);
const pending = new WeakMap<BoardDoc, Map<string, Promise<void>>>();

function pendingOf(doc: BoardDoc): Map<string, Promise<void>> {
  let m = pending.get(doc);
  if (!m) pending.set(doc, (m = new Map()));
  return m;
}

/** Whether a preview fetch for this card is running (or waiting for the network) in this session. */
export function isPreviewPending(doc: BoardDoc, id: string): boolean {
  return pending.get(doc)?.has(id) ?? false;
}

/** Resolves when the card's preview work is over (also when none is running). For tests and callers that must wait. */
export function previewSettled(doc: BoardDoc, id: string): Promise<void> {
  return pending.get(doc)?.get(id) ?? Promise.resolve();
}

function defaultWhenOnline(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("online", cb, { once: true });
  return () => window.removeEventListener("online", cb);
}

function waitOnline(deps: LinkCardDeps): Promise<void> {
  if (deps.online()) return Promise.resolve();
  return new Promise((resolve) => (deps.whenOnline ?? defaultWhenOnline)(resolve));
}

/** Derived data: filling in a card never creates an undo step. */
function write(doc: BoardDoc, id: string, patch: Partial<LinkObj>): LinkObj | null {
  const cur = doc.get(id);
  if (!cur || cur.type !== "link") return null;
  doc.transactAs(DERIVED_ORIGIN, () => doc.update(id, patch));
  return doc.get(id) as LinkObj;
}

/** Shrink a finished card that has no picture, unless the owner already resized it. */
const plainSize = (o: LinkObj): Partial<LinkObj> => (o.h === LINK_CARD_H ? { h: LINK_CARD_PLAIN_H } : {});

async function load(doc: BoardDoc, id: string, deps: LinkCardDeps): Promise<void> {
  await waitOnline(deps);
  const start = doc.get(id);
  if (!start || start.type !== "link") return;

  let preview: LinkPreview;
  try {
    preview = await limit(() => deps.fetchPreview(start.url));
  } catch (e) {
    const cur = doc.get(id);
    if (!cur || cur.type !== "link") return;
    // No server: a quiet card with the domain. A real failure: say so and offer a retry.
    if (e instanceof LinkPreviewUnavailable) write(doc, id, { status: "ready", siteName: cur.siteName || hostnameOf(cur.url), ...plainSize(cur) });
    else write(doc, id, { status: "failed", ...plainSize(cur) });
    return;
  }

  const textual = write(doc, id, {
    title: preview.title || hostnameOf(start.url),
    description: preview.description,
    siteName: preview.siteName || hostnameOf(start.url),
  });
  if (!textual) return;

  let imageAssetId: string | null = null;
  if (preview.imageUrl && deps.online()) {
    try {
      const blob = await deps.fetchImage(preview.imageUrl);
      imageAssetId = await deps.uploader.addAssetOnly(blob, { name: "link-preview" });
    } catch {
      imageAssetId = null; // the card is fine without its picture
    }
  }
  const cur = doc.get(id);
  if (!cur || cur.type !== "link") return;
  write(doc, id, imageAssetId ? { status: "ready", imageAssetId } : { status: "ready", ...plainSize(cur) });
}

/** Fetch the preview of a card (once at a time per card). Resolves when it is done; never rejects. */
export function loadLinkPreview(doc: BoardDoc, id: string, deps: LinkCardDeps): Promise<void> {
  const map = pendingOf(doc);
  const running = map.get(id);
  if (running) return running;
  const p = load(doc, id, deps)
    .catch(() => {
      const cur = doc.get(id);
      if (cur && cur.type === "link" && cur.status === "loading") write(doc, id, { status: "failed" });
    })
    .finally(() => map.delete(id));
  map.set(id, p);
  return p;
}

/** The "Retry preview" action: back to loading and fetch again. Does nothing for a card that is already loading here. */
export function retryLinkPreview(doc: BoardDoc, id: string, deps: LinkCardDeps): Promise<void> {
  const cur = doc.get(id);
  if (!cur || cur.type !== "link" || isPreviewPending(doc, id)) return Promise.resolve();
  write(doc, id, { status: "loading" });
  return loadLinkPreview(doc, id, deps);
}

function newCard(doc: BoardDoc, url: string, at: Point, status: LinkObj["status"], h = LINK_CARD_H): string {
  const u = parseHttpUrl(url);
  if (!u) throw new Error("not a web address");
  const d = defaultsFor("link");
  return doc.create({
    ...d,
    x: at.x - LINK_CARD_W / 2,
    y: at.y - h / 2,
    w: LINK_CARD_W,
    h,
    url: u.href,
    title: u.hostname,
    siteName: u.hostname,
    status,
  });
}

/**
 * Put a link card on the board, centred on `at`, and return its id at once. The card starts as "loading" with just the
 * domain; the preview then fills in title, description and site name, the og:image arrives through the same-origin proxy
 * as an asset, and the card becomes "ready" (or "failed", keeping the domain). Offline, it waits for the network and
 * then fetches exactly once. The object is the one undo step; the filling-in is derived and never undoable.
 */
export function createLinkCard(doc: BoardDoc, url: string, at: Point, deps: LinkCardDeps): string {
  const id = newCard(doc, url, at, "loading");
  void loadLinkPreview(doc, id, deps);
  return id;
}

/** A finished card with only the domain: used when nothing can fetch a preview (no deps, no server). */
export function createPlainLinkCard(doc: BoardDoc, url: string, at: Point): string {
  return newCard(doc, url, at, "ready", LINK_CARD_PLAIN_H);
}

/** An embed from a classified URL, centred on `at`: 480 wide (a portrait video is 480 tall), height from the aspect. */
export function createEmbed(doc: BoardDoc, c: Extract<ClassifiedUrl, { kind: "embed" }>, url: string, at: Point): string {
  const portrait = c.aspect < 1;
  const w = portrait ? Math.round(EMBED_W * c.aspect) : EMBED_W;
  const h = portrait ? EMBED_W : Math.round(EMBED_W / c.aspect);
  return doc.create({
    ...defaultsFor("embed"),
    x: at.x - w / 2,
    y: at.y - h / 2,
    w,
    h,
    provider: c.provider,
    url: parseHttpUrl(url)?.href ?? url,
    embedUrl: c.embedUrl,
    title: "",
  });
}
