import type { Language } from "@/lib/discover/catalog";

const ALL: Language[] = ["en", "fr"];

/** Parses "en,fr" from a query string; defaults to every language. */
export function parseLangs(value: string | null | undefined): Language[] {
  const langs = (value ?? "").split(",").filter((l): l is Language => ALL.includes(l as Language));
  return langs.length > 0 ? langs : ALL;
}
