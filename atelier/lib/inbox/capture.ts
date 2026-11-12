import { isVideoFile } from "@/lib/assets/video";
import { MAX_ASSET_BYTES, MAX_VIDEO_BYTES, ALLOWED_IMAGE_MIMES, ALLOWED_VIDEO_MIMES } from "@/lib/assets/asset-schema";
import { extractProvenance } from "@/lib/engine/provenance/extract";
import { emptyProvenance } from "@/lib/engine/provenance/validate";
import type { Provenance } from "@/lib/engine/model/types";
import type { SharedPayload } from "./share-queue";
import { MAX_INBOX_TEXT, MAX_INBOX_TITLE, MAX_INBOX_URL, webUrl, type NewInboxItem } from "./types";

/*
 * Turning what a person hands the Inbox (typed or pasted text, picked or dropped files, a share from the phone) into
 * Inbox items. Pure of the DOM: the page, the Quick capture dialog and the share hand-over all go through here.
 */

type Adder = { add(item: NewInboxItem): Promise<void> };
type AssetStore = { addAssetOnly(file: Blob, opts?: { name?: string; provenance?: Provenance }): Promise<string> };

export const MAX_FILES_AT_ONCE = 10;
const mb = (n: number) => `${Math.round(n / (1024 * 1024))} MB`;

export type TextResult = { ok: true; kind: "url" | "text" } | { ok: false; reason: "empty" | "too-long"; message: string };

/** A lone http(s) address becomes a link item, anything else a note. Over-long input is refused, never cut. */
export async function captureText(client: Adder, raw: string): Promise<TextResult> {
  const text = raw.trim();
  if (!text) return { ok: false, reason: "empty", message: "There's nothing to add yet." };
  const lone = !/\s/.test(text) && /^[a-z][a-z0-9+.-]*:/i.test(text);
  if (lone && /^https?:/i.test(text)) {
    const url = webUrl(text);
    if (!url) return { ok: false, reason: "too-long", message: `That link is longer than ${MAX_INBOX_URL.toLocaleString("en-US")} characters.` };
    await client.add({ kind: "url", assetId: null, url, text: null, title: null, sourceUrl: url, credit: null });
    return { ok: true, kind: "url" };
  }
  if (text.length > MAX_INBOX_TEXT) return { ok: false, reason: "too-long", message: `That note is longer than ${MAX_INBOX_TEXT.toLocaleString("en-US")} characters.` };
  await client.add({ kind: "text", assetId: null, url: null, text, title: null, sourceUrl: null, credit: null });
  return { ok: true, kind: "text" };
}

export type FilesResult = { added: number; failed: { name: string; message: string }[] };

function refusal(file: File): string | null {
  const type = file.type;
  const video = (ALLOWED_VIDEO_MIMES as readonly string[]).includes(type) || (!type && isVideoFile(file));
  const image = (ALLOWED_IMAGE_MIMES as readonly string[]).includes(type);
  if (!video && !image) return type === "image/svg+xml" ? "SVG pictures aren't accepted because they can carry scripts." : "that type isn't supported (JPEG, PNG, WebP, GIF, AVIF, MP4 and WebM are).";
  if (video && file.size > MAX_VIDEO_BYTES) return `too large (${mb(file.size)}; the limit for videos is ${mb(MAX_VIDEO_BYTES)})`;
  if (image && file.size > MAX_ASSET_BYTES) return `too large (${mb(file.size)}; the limit for pictures is ${mb(MAX_ASSET_BYTES)})`;
  return null;
}

function provenanceFrom(pageUrl: string | undefined, now: Date | undefined): Provenance | undefined {
  if (!pageUrl) return undefined;
  const found = extractProvenance({ url: pageUrl, now });
  return found.sourceUrl ? { ...emptyProvenance(), ...found } : undefined;
}

/**
 * Pictures and videos: each goes through the asset pipeline (so it gets its variants and, signed in, uploads like any
 * other), then an Inbox item points at the asset. A file that cannot be used is named and skipped; the rest carry on.
 */
export async function captureFiles(client: Adder, store: AssetStore, files: File[], opts: { pageUrl?: string; now?: Date } = {}): Promise<FilesResult> {
  const result: FilesResult = { added: 0, failed: [] };
  const provenance = provenanceFrom(opts.pageUrl, opts.now);
  let taken = 0;
  for (const file of files) {
    if (taken >= MAX_FILES_AT_ONCE) {
      result.failed.push({ name: file.name, message: `Only ${MAX_FILES_AT_ONCE} files can be added at once.` });
      continue;
    }
    const why = refusal(file);
    if (why) {
      result.failed.push({ name: file.name, message: why });
      continue;
    }
    taken++;
    try {
      const assetId = await store.addAssetOnly(file, { name: file.name, ...(provenance ? { provenance } : {}) });
      await client.add({
        kind: isVideoFile(file) ? "video" : "image",
        assetId,
        url: null,
        text: null,
        title: file.name.slice(0, MAX_INBOX_TITLE) || null,
        sourceUrl: provenance?.sourceUrl ?? null,
        credit: null,
      });
      result.added++;
    } catch (e) {
      result.failed.push({ name: file.name, message: e instanceof Error ? e.message : "it couldn't be read" });
    }
  }
  return result;
}

export type ShareResult = FilesResult & { skipped: number };

/** One share from the phone's share sheet (see lib/inbox/share-queue.ts): the page, the words, the pictures. */
export async function ingestShare(payload: SharedPayload, client: Adder, store: AssetStore): Promise<ShareResult> {
  let added = 0;
  const failed: FilesResult["failed"] = [];
  const now = new Date(payload.receivedAt);
  const url = webUrl(payload.url);
  const title = payload.title.trim().slice(0, MAX_INBOX_TITLE) || null;

  if (url) {
    await client.add({ kind: "url", assetId: null, url, text: null, title, sourceUrl: url, credit: null });
    added++;
  }
  const words = payload.text.trim();
  if (words) {
    await client.add({ kind: "text", assetId: null, url: null, text: words.slice(0, MAX_INBOX_TEXT), title: url ? null : title, sourceUrl: null, credit: null });
    added++;
  }
  if (payload.files.length) {
    const files = payload.files.map((f) => (f.blob instanceof File ? f.blob : new File([f.blob], f.name, { type: f.type })));
    const r = await captureFiles(client, store, files, { pageUrl: url ?? undefined, now });
    added += r.added;
    failed.push(...r.failed);
  }
  return { added, failed, skipped: payload.skipped };
}
