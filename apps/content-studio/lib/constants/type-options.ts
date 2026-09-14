// Kind/category pairings and color/icon maps, ported from the legacy app's
// TYPE_OPTIONS / CONTENT_TYPES / CAT_COLORS / CAT_ICON / STATUS_COLORS / AVATAR_COLORS.
// Kept in sync manually with the card_kind / content_type pg enums in db/schema.ts.

export const TYPE_OPTIONS = [
  { value: "Feed|Campaigns Content", label: "Feed — Campaigns Content" },
  { value: "Feed|Brands Collections Content", label: "Feed — Brands Collections" },
  { value: "Feed|Planet Sport Content", label: "Feed — Planet Sport" },
  { value: "Feed|Educational Content", label: "Feed — Educational" },
  { value: "Story 1|Story 1", label: "Story 1 (variable)" },
  { value: "Story 2|Story 2", label: "Story 2 (Focus Produit)" },
  { value: "Story 3|Story 3", label: "Story 3 (Repost)" },
] as const;

export const CONTENT_TYPES = ["Photo", "Vidéo", "Carousel", "Reel", "Texte"] as const;

export const RESPONSABLE_OPTIONS = ["À assigner", "Ilias", "Agence", "Équipe Boutique"] as const;

export const CARD_STATUS_OPTIONS = ["Idée", "En préparation", "Prêt", "Publié"] as const;

export const CAT_COLORS: Record<string, string> = {
  "Campaigns Content": "#D64545",
  "Brands Collections Content": "#8657D6",
  "Planet Sport Content": "#1E88A8",
  "Educational Content": "#3B9E5F",
  "Story 1": "#E0A030",
  "Story 2": "#C9548A",
  "Story 3": "#5B7FDB",
};

export const STATUS_COLORS: Record<string, string> = {
  Idée: "#378ADD",
  "En préparation": "#EF9F27",
  Prêt: "#639922",
  Publié: "#888780",
};

export const AVATAR_COLORS: Record<string, string> = {
  "À assigner": "#9AA2AF",
  Ilias: "#235789",
  Agence: "#C98A1E",
  "Équipe Boutique": "#2F7A4C",
};

export const INFLUENCER_PLATFORM_OPTIONS = ["Instagram", "TikTok", "YouTube", "Twitter/X", "Autre"] as const;

export const INFLUENCER_STATUS_OPTIONS = [
  "Prospection",
  "Contacté",
  "Négociation",
  "Actif",
  "Terminé",
  "Refusé",
] as const;

export const INFLUENCE_STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  Prospection: { bg: "#E6F1FB", fg: "#0C447C" },
  Contacté: { bg: "#FAEEDA", fg: "#854F0B" },
  Négociation: { bg: "#F4CCCC", fg: "#791F1F" },
  Actif: { bg: "#EAF3DE", fg: "#3B6D11" },
  Terminé: { bg: "#EEF1F7", fg: "#444441" },
  Refusé: { bg: "#F1EFE8", fg: "#5F5E5A" },
};

export const IDEA_PRIORITY_OPTIONS = ["Haute", "Moyenne", "Basse"] as const;
export const IDEA_TAG_TYPE_OPTIONS = ["Produit", "Campagne", "Autre"] as const;

export function avatarInitials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.split(" ");
  return parts.length > 1 ? (parts[0][0] + parts[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}
