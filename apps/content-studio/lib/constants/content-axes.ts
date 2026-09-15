// Static Feed/Story rotation guidelines, ported from the legacy app's renderLibrary().
// "Utiliser cet axe" creates a production_cards row from one of these.
export type ContentAxis = { kind: "Feed" | "Story 1" | "Story 2" | "Story 3"; category: string; description: string };

export const FEED_AXES: ContentAxis[] = [
  { kind: "Feed", category: "Campaigns Content", description: "Sales / Campagne active — 2x/semaine" },
  { kind: "Feed", category: "Brands Collections Content", description: "Tier 1 (2x), Tier 2 (1x) — rotation" },
  { kind: "Feed", category: "Planet Sport Content", description: "Store Content, Ambassadors, Coulisses — rotation 1x/2 sem." },
  { kind: "Feed", category: "Educational Content", description: "Tech Specs, Par Sport, Un Modèle Une Histoire — rotation 1x/2 sem." },
];

export const STORY_AXES: ContentAxis[] = [
  { kind: "Story 1", category: "Story 1", description: "Variable — change chaque jour (marques Tier 2/3, motivation, UGC...)" },
  { kind: "Story 2", category: "Story 2", description: "Focus Produit — traitement varié selon le jour" },
  { kind: "Story 3", category: "Story 3", description: "Repost du post Feed / meilleur post / campagne" },
];
