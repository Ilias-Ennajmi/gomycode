import type { CommandCtx } from "../commands/registry";
import { classifyUrl } from "./classify";
import { createEmbed, createLinkCard, createPlainLinkCard, type LinkCardDeps } from "./link-cards";
import { viewCentre } from "./link-commands";

/**
 * Add the address the owner typed into the "Link card" / "Embed" dialog at the middle of the view, select it, and return
 * its id (null when the address does not qualify: the dialog validates first, this is the backstop). A "link" request
 * always makes a link card, even for a YouTube address; an "embed" request needs a provider address.
 */
export function addUrlToBoard(ctx: CommandCtx, kind: "link" | "embed", raw: string, deps: LinkCardDeps | null): string | null {
  const c = classifyUrl(raw);
  const at = viewCentre(ctx);
  let id: string | null = null;
  ctx.doc.transact(() => {
    if (kind === "embed") {
      if (c.kind === "embed") id = createEmbed(ctx.doc, c, raw, at);
    } else if (c.kind === "embed" || c.kind === "link") {
      const url = c.kind === "link" ? c.url : raw.trim();
      id = deps ? createLinkCard(ctx.doc, url, at, deps) : createPlainLinkCard(ctx.doc, url, at);
    }
  });
  if (id) ctx.selection.set([id]);
  return id;
}
