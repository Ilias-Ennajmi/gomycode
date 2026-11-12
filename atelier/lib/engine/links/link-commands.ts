import type { Command, CommandCtx } from "../commands/registry";
import { screenToCanvas } from "../geometry/camera";
import type { CanvasObject } from "../model/types";
import { retryLinkPreview } from "./link-cards";
import { activateLinkObject, openExternal } from "./open";

const only = (c: CommandCtx): CanvasObject | null => {
  if (c.selection.size !== 1) return null;
  return c.doc.get([...c.selection.ids][0]) ?? null;
};
const selectedLink = (c: CommandCtx) => {
  const o = only(c);
  return o && (o.type === "link" || o.type === "embed") ? o : null;
};

/** The middle of what the owner sees: where inserted objects land. */
export function viewCentre(c: CommandCtx) {
  const vp = c.canvas.viewport();
  return screenToCanvas(c.canvas.getCamera(), { x: vp.w / 2, y: vp.h / 2 });
}

/** Link cards and embeds: paste-as-text, open, retry the preview, and the two "insert" entries of the More menu. */
export const LINK_COMMANDS: Command[] = [
  {
    id: "edit.pasteAsText",
    label: "Paste as text",
    group: "edit",
    shortcut: "Mod+Shift+V",
    native: true,
    when: (c) => !!c.clipboard?.pasteAsText,
    run: (c) => void c.clipboard?.pasteAsText?.(),
  },
  {
    id: "link.open",
    label: "Open link",
    group: "edit",
    when: (c) => selectedLink(c) !== null,
    run: (c) => {
      const o = selectedLink(c);
      if (o && !openExternal(o.url)) c.toast({ message: "That address can't be opened" });
    },
  },
  {
    id: "embed.play",
    label: "Play embed",
    group: "edit",
    when: (c) => selectedLink(c)?.type === "embed",
    run: (c) => {
      const o = selectedLink(c);
      if (o) activateLinkObject(o);
    },
  },
  {
    id: "link.retryPreview",
    label: "Retry preview",
    group: "edit",
    when: (c) => {
      const o = only(c);
      return o?.type === "link" && o.status !== "ready" && !!c.ui?.linkDeps?.();
    },
    run: (c) => {
      const o = only(c);
      const deps = c.ui?.linkDeps?.();
      if (o && o.type === "link" && deps) void retryLinkPreview(c.doc, o.id, deps);
    },
  },
  { id: "insert.link", label: "Link card…", group: "insert", when: (c) => !!c.ui?.promptUrl, run: (c) => c.ui?.promptUrl?.("link") },
  { id: "insert.embed", label: "Embed video or design…", group: "insert", when: (c) => !!c.ui?.promptUrl, run: (c) => c.ui?.promptUrl?.("embed") },
];
