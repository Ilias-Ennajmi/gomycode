import type { Platform } from "@/lib/links";
import { SPACE_COLORS, type SpaceColor } from "@/components/ui/space";

/** What a public collection page (/c/<slug>) may show. Parsed defensively from stash.get_collection(). */
export type Collection = {
  name: string;
  color: SpaceColor;
  kind: "topic" | "project";
  description: string | null;
  saves: CollectionSave[];
};

export type CollectionSave = {
  id: string;
  title: string | null;
  keyIdea: string | null;
  takeaways: string[];
  creator: string | null;
  platform: Platform;
  sourceUrl: string | null;
  thumbPath: string | null;
  applied: boolean;
};

const PLATFORMS: Platform[] = ["instagram", "tiktok", "youtube", "web", "screenshot"];

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

/** Only http(s) links are rendered as links. */
export function safeHref(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export function parseCollection(raw: unknown): Collection | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const name = str(r.name);
  if (!name) return null;
  const color = (SPACE_COLORS as readonly string[]).includes(String(r.color)) ? (r.color as SpaceColor) : "violet";
  const saves = (Array.isArray(r.saves) ? r.saves : [])
    .filter((s): s is Record<string, unknown> => Boolean(s) && typeof s === "object")
    .map((s) => ({
      id: String(s.id ?? ""),
      title: str(s.title),
      keyIdea: str(s.key_idea),
      takeaways: Array.isArray(s.takeaways) ? s.takeaways.filter((t): t is string => typeof t === "string" && Boolean(t.trim())).slice(0, 3) : [],
      creator: str(s.creator),
      platform: (PLATFORMS as string[]).includes(String(s.platform)) ? (s.platform as Platform) : "web",
      sourceUrl: safeHref(s.source_url),
      thumbPath: str(s.thumb_path),
      applied: s.applied === true,
    }))
    .filter((s) => s.id);
  return { name, color, kind: r.kind === "project" ? "project" : "topic", description: str(r.description), saves };
}
