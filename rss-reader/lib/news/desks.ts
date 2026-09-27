// The News tab's sections ("rubriques"). A news source belongs to one desk;
// Moroccan outlets also carry region "ma" so they feed the Maroc section.

export const DESKS = [
  {
    id: "morocco",
    name: "Maroc",
    description: "Moroccan news, from Moroccan outlets and the world press",
  },
  { id: "world", name: "Monde", description: "Global affairs" },
  { id: "europe", name: "Europe", description: "Europe and France" },
  { id: "africa", name: "Afrique", description: "Africa and the Maghreb" },
  { id: "economy", name: "Économie", description: "Business, markets and the economy" },
  { id: "sports", name: "Sport", description: "Football and more" },
  { id: "tech", name: "Tech", description: "Technology and science" },
] as const;

export type DeskId = (typeof DESKS)[number]["id"];

export function isDesk(value: unknown): value is DeskId {
  return DESKS.some((d) => d.id === value);
}

export function deskName(id: string) {
  return DESKS.find((d) => d.id === id)?.name ?? id;
}

/** Articles that are about Morocco, whoever wrote them. */
export const MOROCCO_PATTERN = new RegExp(
  "\\b(maroc|marocain\\w*|morocc\\w*|moroccan\\w*|rabat|casablanca|marrakech|marrakesh|tanger|tangier|agadir|f[eè]s|mekn[eè]s|oujda|t[eé]touan|sahara occidental|western sahara|botola|lions de l'atlas|atlas lions)\\b",
  "i"
);
