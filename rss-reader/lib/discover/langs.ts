import type { DiscoverKind, Language } from "@/lib/discover/catalog";

const ALL: Language[] = ["en", "fr"];

/** Parses "en,fr" from a query string; defaults to every language. */
export function parseLangs(value: string | null | undefined): Language[] {
  const langs = (value ?? "").split(",").filter((l): l is Language => ALL.includes(l as Language));
  return langs.length > 0 ? langs : ALL;
}

const KINDS: DiscoverKind[] = ["all", "rss", "youtube", "newsletter"];

/** Parses ?kind=youtube; anything else means every kind. */
export function parseKind(value: string | null | undefined): DiscoverKind {
  return KINDS.includes(value as DiscoverKind) ? (value as DiscoverKind) : "all";
}
