import type { EmbedProvider } from "../model/types";
import { toEmbed } from "./embed";
import { parseHttpUrl } from "./url";

export type ClassifiedUrl =
  | { kind: "embed"; provider: EmbedProvider; embedUrl: string; aspect: number }
  | { kind: "link"; url: string }
  | { kind: "none" };

/**
 * What a pasted or typed address becomes: an embed for YouTube, Vimeo and Figma, a link card for any other http(s)
 * URL, nothing for anything else (other schemes, credentials in the URL, text, more than 2,048 characters).
 */
export function classifyUrl(raw: string): ClassifiedUrl {
  const u = parseHttpUrl(raw);
  if (!u) return { kind: "none" };
  const e = toEmbed(raw);
  if (e) return { kind: "embed", provider: e.provider, embedUrl: e.embedUrl, aspect: e.aspect };
  return { kind: "link", url: u.href };
}
