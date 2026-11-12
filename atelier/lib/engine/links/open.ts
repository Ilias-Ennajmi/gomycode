import type { CanvasObject } from "../model/types";
import { parseHttpUrl } from "./url";
import { liveEmbeds } from "./live-embed";

/** Open an address in a new tab with no opener and no referrer. Only http(s); returns whether anything was opened. */
export function openExternal(url: string): boolean {
  const u = parseHttpUrl(url);
  if (!u || typeof window === "undefined") return false;
  window.open(u.href, "_blank", "noopener,noreferrer");
  return true;
}

/**
 * What double-click and Enter do on a link card (open the page) or an embed (load the player). Returns whether the object
 * was one of those, so the select tool can leave every other type to its own handling.
 */
export function activateLinkObject(o: CanvasObject): boolean {
  if (o.type === "link") {
    openExternal(o.url);
    return true;
  }
  if (o.type === "embed") {
    liveEmbeds.activate(o.id);
    return true;
  }
  return false;
}
