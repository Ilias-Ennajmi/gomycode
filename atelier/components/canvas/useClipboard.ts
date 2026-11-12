"use client";

import { useEffect, useMemo, useRef } from "react";
import { assertAcceptable, ImageError } from "@/lib/assets/pipeline-core";
import { getAssetResolver } from "@/lib/assets/resolver";
import { assertVideoAcceptable, isVideoFile } from "@/lib/assets/video";
import { createPasteState, insertPaste, parseClipboard, type PasteItem } from "@/lib/engine/clipboard/parse";
import { writeRichContent } from "@/lib/engine/clipboard/rich";
import { serializeSelection } from "@/lib/engine/clipboard/serialize";
import { deleteSelection, oneStep, selectedRoots } from "@/lib/engine/commands/commands";
import type { CommandClipboard, CommandCtx } from "@/lib/engine/commands/registry";
import { isTypingTarget } from "@/lib/engine/commands/shortcuts";
import type { LinkCardDeps } from "@/lib/engine/links/link-cards";
import { boundsOf } from "@/lib/engine/geometry/rect";
import { screenToCanvas } from "@/lib/engine/geometry/camera";
import { defaultsFor } from "@/lib/engine/model/defaults";
import type { Point, Provenance } from "@/lib/engine/model/types";
import type { CanvasHandle } from "./CanvasView";

/** What a paste or a drop brings in, before it is parsed. */
export type ClipboardInput = { html?: string; text?: string; files?: File[]; /** The page the data came from, when known (a share). */ url?: string };

export type UseClipboardOptions = {
  handle: CanvasHandle | null;
  /** The current command context (document, selection, toast). Read at event time, so it may change freely. */
  ctx: () => CommandCtx;
  /** Add an image file centred on a canvas point: `AssetUploader.add`. Rejects with ImageError for files it will not take. */
  addImage?: (file: File, at: Point, provenance?: Provenance) => Promise<unknown>;
  /** Public URL of an asset for the readable fallback in copied HTML. Defaults to the shared resolver (https URLs only). */
  assetUrl?: (assetId: string) => string | null;
  /** What link cards need to fetch their preview. Without it a pasted URL becomes a plain card with just the domain. */
  links?: LinkCardDeps;
};

export type ClipboardApi = CommandClipboard & {
  /** Paste already-extracted clipboard data (also used by drops). `at` is the middle of the pasted content. `asText` keeps URLs as linked text. */
  pasteInput(input: ClipboardInput, at?: Point, opts?: { asText?: boolean }): void;
  /** "Paste as text" (Mod+Shift+V): the clipboard text as a text object, a URL as linked text. */
  pasteAsText(): Promise<void>;
};

/** Lines beyond which pasted text asks before it is split into stickies. */
export const SPLIT_ASK_LINES = 200;
const LIST_MIN_LINES = 3;
const LIST_MAX_LINE_CHARS = 100;
const STICKY_GUTTER = 16;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|bmp|heic|heif|tiff?|svg)$/i;
/** How long after Mod+Shift+V the browser's paste event still counts as "paste as text". */
const PLAIN_PASTE_WINDOW_MS = 1000;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const isImageFile = (f: File) => isVideoFile(f) || (f.type ? f.type.startsWith("image/") : IMAGE_EXT.test(f.name));
const fileName = (f: File) => f.name || "image";

function defaultAssetUrl(id: string): string | null {
  const url = getAssetResolver().url(id, "original");
  return url && /^https:/i.test(url) ? url : null;
}

function filesOf(cd: DataTransfer): File[] {
  const direct = Array.from(cd.files ?? []);
  if (direct.length) return direct;
  const out: File[] = [];
  for (const item of Array.from(cd.items ?? [])) {
    if (item.kind === "file") {
      const f = item.getAsFile();
      if (f) out.push(f);
    }
  }
  return out;
}

/** Non-blank lines of pasted text when it should be offered as stickies (a list, or very long), else null. */
function splittableLines(text: string, lines: number): string[] | null {
  const parts = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines > SPLIT_ASK_LINES) return parts.length > 1 ? parts : null;
  if (parts.length >= LIST_MIN_LINES && parts.every((l) => l.length <= LIST_MAX_LINE_CHARS)) return parts;
  return null;
}

/** Replace the text object `id` by one sticky per line, laid out in a square-ish grid around where the text was. */
function splitIntoStickies(ctx: CommandCtx, id: string, lines: string[]): void {
  const { doc, selection } = ctx;
  const text = doc.get(id);
  if (!text) return;
  const d = defaultsFor("sticky");
  const pitchX = d.w + STICKY_GUTTER;
  const pitchY = d.h + STICKY_GUTTER;
  const cols = Math.max(1, Math.ceil(Math.sqrt(lines.length)));
  const rows = Math.ceil(lines.length / cols);
  const b = boundsOf(text);
  const x0 = b.x + b.w / 2 - (cols * pitchX - STICKY_GUTTER) / 2;
  const y0 = b.y + b.h / 2 - (rows * pitchY - STICKY_GUTTER) / 2;
  let created: string[] = [];
  oneStep(doc, () => {
    created = doc.createMany(lines.map((_, i) => ({ ...d, x: x0 + (i % cols) * pitchX, y: y0 + Math.floor(i / cols) * pitchY })));
    created.forEach((sid, i) => {
      const frag = doc.content(sid);
      if (frag) writeRichContent(frag, { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: lines[i] }] }] });
    });
    doc.remove([id]);
  });
  selection.set(created);
}

/** The new objects that are not inside another new object (a pasted frame brings its children, but only it is selected). */
function topLevel(ctx: CommandCtx, ids: string[]): string[] {
  const set = new Set(ids);
  return ids.filter((id) => {
    const p = ctx.doc.get(id)?.parentId;
    return !p || !set.has(p);
  });
}

/**
 * Copy, cut and paste through the browser's clipboard events (so they carry both `text/html` and `text/plain` and work
 * with the keyboard shortcut), plus the programmatic copy/cut/paste behind the context menu and the command palette
 * (Clipboard API). Paste handles everything Review Focus #2 lists: odd files, huge or undecodable images, long text,
 * empty or damaged clipboards.
 */
export function useClipboard(opts: UseClipboardOptions): ClipboardApi {
  const latest = useRef(opts);
  useEffect(() => {
    latest.current = opts;
  });
  const pasteState = useRef(createPasteState());
  const lastPointer = useRef<Point | null>(null);
  /** When Mod+Shift+V was last pressed: the paste event that follows has no flag of its own. */
  const plainPasteAt = useRef(-Infinity);

  const api = useMemo<ClipboardApi>(() => {
    const O = () => latest.current;

    const pasteAt = (): Point => {
      const h = O().handle;
      if (!h) return { x: 0, y: 0 };
      const vp = h.viewport();
      const r = h.container().getBoundingClientRect();
      const p = lastPointer.current ? { x: lastPointer.current.x - r.left, y: lastPointer.current.y - r.top } : null;
      const inside = p && p.x >= 0 && p.y >= 0 && p.x <= vp.w && p.y <= vp.h;
      return screenToCanvas(h.getCamera(), inside ? p : { x: vp.w / 2, y: vp.h / 2 });
    };

    const serialize = (ctx: CommandCtx) => {
      const roots = selectedRoots(ctx.doc, ctx.selection.ids, true);
      if (roots.length === 0) return null;
      const data = serializeSelection(
        ctx.doc,
        roots.map((o) => o.id),
        { assetUrl: O().assetUrl ?? defaultAssetUrl },
      );
      return data.html ? { ...data, count: roots.length } : null;
    };

    const pasteInput = (input: ClipboardInput, atArg?: Point, popts?: { asText?: boolean }): void => {
      const ctx = O().ctx();
      const at = atArg ?? pasteAt();
      try {
        const files = input.files ?? [];
        // Files we know we will not take are reported by name and kept out of the grid.
        const usable: File[] = [];
        for (const f of files) {
          if (!isImageFile(f)) {
            ctx.toast({ message: `Couldn't add ${fileName(f)}: only images can be added` });
            continue;
          }
          try {
            if (isVideoFile(f)) assertVideoAcceptable(f);
            else assertAcceptable(f);
            usable.push(f);
          } catch (e) {
            ctx.toast({ message: `Couldn't add ${fileName(f)}: ${e instanceof Error ? e.message : "it can't be read"}` });
          }
        }
        const items = parseClipboard({ html: input.html, text: input.text, files: usable, url: input.url });
        if (items.length === 0) return; // empty clipboard, or only files that were refused above

        const addImage = O().addImage;
        const created = insertPaste(ctx.doc, items, at, {
          state: pasteState.current,
          links: O().links,
          urlAsText: popts?.asText,
          addImage: addImage
            ? (file, pos, provenance) =>
                (provenance ? addImage(file, pos, provenance) : addImage(file, pos)).then((id) => {
                  if (typeof id === "string") ctx.selection.add([id]);
                  return id;
                })
            : undefined,
          onImageError: (file, error) => {
            const reason = error instanceof ImageError || error instanceof Error ? error.message : "it can't be read";
            ctx.toast({ message: `Couldn't add ${fileName(file)}: ${reason}` });
          },
        });
        if (created.length) ctx.selection.set(topLevel(ctx, created));

        const only: PasteItem | undefined = items.length === 1 ? items[0] : undefined;
        if (only?.kind === "text" && created.length === 1) {
          const lines = splittableLines(only.text, only.lines);
          if (lines) {
            const id = created[0];
            ctx.toast({
              message: lines.length > SPLIT_ASK_LINES ? `Pasted ${lines.length} lines as one text object` : "Pasted a list as one text object",
              durationMs: 10_000,
              action: { label: `Split into ${lines.length} stickies?`, run: () => splitIntoStickies(O().ctx(), id, lines) },
            });
          }
        }
      } catch (e) {
        console.warn("paste failed", e);
        ctx.toast({ message: "Couldn't paste that" });
      }
    };

    const writeToClipboard = async (html: string, text: string): Promise<boolean> => {
      // First a synthetic copy event: the browser puts exactly our HTML on the clipboard, comment marker included.
      let handled = false;
      const probe = (e: ClipboardEvent) => {
        e.clipboardData?.setData("text/html", html);
        e.clipboardData?.setData("text/plain", text);
        e.preventDefault();
        handled = true;
      };
      document.addEventListener("copy", probe, { capture: true, once: true });
      try {
        if (document.execCommand?.("copy") && handled) return true;
      } catch {
        /* fall through to the async API */
      } finally {
        document.removeEventListener("copy", probe, { capture: true });
      }
      try {
        if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
          await navigator.clipboard.write([
            new ClipboardItem({
              "text/html": new Blob([html], { type: "text/html" }),
              "text/plain": new Blob([text], { type: "text/plain" }),
            }),
          ]);
          return true;
        }
      } catch {
        /* reported by the caller */
      }
      return false;
    };

    const failToast = (ctx: CommandCtx, what: string) =>
      ctx.toast({ message: `Couldn't ${what}. Use the keyboard shortcut (Ctrl+C or ⌘C) instead.` });

    return {
      pasteInput,
      async pasteAsText() {
        const ctx = O().ctx();
        try {
          const text = await navigator.clipboard.readText();
          pasteInput({ text }, undefined, { asText: true });
        } catch {
          ctx.toast({ message: "Couldn't read the clipboard. Press Ctrl+Shift+V (⌘⇧V) to paste as text instead." });
        }
      },
      async copy() {
        const ctx = O().ctx();
        const data = serialize(ctx);
        if (!data) return;
        if (await writeToClipboard(data.html, data.text)) ctx.toast({ message: `Copied ${plural(data.count, "object", "objects")}`, durationMs: 2000 });
        else failToast(ctx, "copy");
      },
      async cut() {
        const ctx = O().ctx();
        const data = serialize(ctx);
        if (!data) return;
        if (!(await writeToClipboard(data.html, data.text))) {
          failToast(ctx, "cut");
          return;
        }
        deleteSelection(ctx, "Cut");
      },
      async paste() {
        const ctx = O().ctx();
        const nav = typeof navigator === "undefined" ? undefined : navigator;
        const hint = () => ctx.toast({ message: "Couldn't read the clipboard. Press Ctrl+V (⌘V) to paste instead." });
        try {
          if (nav?.clipboard?.read) {
            let items: ClipboardItems;
            try {
              // Unsanitized HTML keeps the Atelier marker comment that normal reads strip.
              items = await (nav.clipboard.read as (o?: unknown) => Promise<ClipboardItems>)({ unsanitized: ["text/html"] });
            } catch {
              items = await nav.clipboard.read();
            }
            const input: ClipboardInput = { files: [] };
            for (const item of items) {
              for (const type of item.types) {
                if (type === "text/html") input.html = await (await item.getType(type)).text();
                else if (type === "text/plain") input.text = await (await item.getType(type)).text();
                else if (type.startsWith("image/")) {
                  const blob = await item.getType(type);
                  input.files!.push(new File([blob], `pasted-image.${type.slice(6).replace("jpeg", "jpg")}`, { type }));
                }
              }
            }
            pasteInput(input);
          } else if (nav?.clipboard?.readText) {
            pasteInput({ text: await nav.clipboard.readText() });
          } else hint();
        } catch {
          hint();
        }
      },
    };
  }, []);

  const handle = opts.handle;
  useEffect(() => {
    const el = handle?.container();
    if (!el) return;
    const onMove = (e: PointerEvent | MouseEvent) => {
      lastPointer.current = { x: e.clientX, y: e.clientY };
    };
    el.addEventListener("pointermove", onMove);
    return () => el.removeEventListener("pointermove", onMove);
  }, [handle]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && e.key.toLowerCase() === "v") plainPasteAt.current = performance.now();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, []);

  useEffect(() => {
    const O = () => latest.current;
    // Something else (a text field, a text selection on the page) owns the clipboard event.
    const foreign = (e: ClipboardEvent) =>
      e.defaultPrevented ||
      isTypingTarget(e.target) ||
      isTypingTarget(document.activeElement) ||
      (() => {
        const sel = typeof getSelection === "function" ? getSelection() : null;
        return !!sel && !sel.isCollapsed && sel.toString().length > 0;
      })();

    const onCopyOrCut = (e: ClipboardEvent, cut: boolean) => {
      if (foreign(e) || !e.clipboardData) return;
      const ctx = O().ctx();
      const roots = selectedRoots(ctx.doc, ctx.selection.ids, true);
      if (roots.length === 0) return;
      const data = serializeSelection(
        ctx.doc,
        roots.map((o) => o.id),
        { assetUrl: O().assetUrl ?? defaultAssetUrl },
      );
      if (!data.html) return;
      e.clipboardData.setData("text/html", data.html);
      e.clipboardData.setData("text/plain", data.text);
      e.preventDefault();
      if (cut) deleteSelection(ctx, "Cut");
      else ctx.toast({ message: `Copied ${plural(roots.length, "object", "objects")}`, durationMs: 2000 });
    };
    const onCopy = (e: ClipboardEvent) => onCopyOrCut(e, false);
    const onCut = (e: ClipboardEvent) => onCopyOrCut(e, true);
    const onPaste = (e: ClipboardEvent) => {
      if (foreign(e) || !e.clipboardData) return;
      e.preventDefault();
      const asText = performance.now() - plainPasteAt.current < PLAIN_PASTE_WINDOW_MS;
      plainPasteAt.current = -Infinity;
      api.pasteInput(
        {
          html: e.clipboardData.getData("text/html"),
          text: e.clipboardData.getData("text/plain"),
          files: filesOf(e.clipboardData),
        },
        undefined,
        { asText },
      );
    };
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCut);
    document.addEventListener("paste", onPaste);
    return () => {
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCut);
      document.removeEventListener("paste", onPaste);
    };
  }, [api]);

  return api;
}

