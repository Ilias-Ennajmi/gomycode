// 17 canned idea templates, ported verbatim from the legacy app's IDEA_BANK.
// Used only to prefill the "create idea" form — not user-editable.
export type IdeaBankTemplate = {
  title: string;
  note: string;
  tagType: "Produit" | "Campagne" | "Autre";
  tagDetail: string;
  priority: "Haute" | "Moyenne" | "Basse";
};

export const IDEA_BANK: IdeaBankTemplate[] = [
  { title: "Mise en avant produit — best-seller de la semaine", note: "Photo/Reel produit seul, prix visible, CTA vers la fiche produit.", tagType: "Produit", tagDetail: "", priority: "Moyenne" },
  { title: "Repost UGC client", note: "Repartager une story/publication d'un client portant un produit Planet Sport.", tagType: "Autre", tagDetail: "UGC", priority: "Basse" },
  { title: "Compte à rebours avant une campagne", note: "Story avec sticker compte à rebours vers le lancement d'une offre.", tagType: "Campagne", tagDetail: "", priority: "Haute" },
  { title: "Tenue du jour (outfit of the day)", note: "Carousel de looks complets avec tags produits, un par marque en rotation.", tagType: "Produit", tagDetail: "", priority: "Moyenne" },
  { title: "Astuce technique / éducatif", note: "Story ou post court expliquant une caractéristique technique d'un produit (amorti, matière, etc.).", tagType: "Autre", tagDetail: "Educational", priority: "Basse" },
  { title: "Coulisses en boutique", note: "Photo/Reel de l'équipe ou de la mise en rayon, ton informel.", tagType: "Autre", tagDetail: "", priority: "Basse" },
  { title: "Avant/après ou comparatif produit", note: "Comparaison visuelle entre deux modèles ou usages.", tagType: "Produit", tagDetail: "", priority: "Moyenne" },
  { title: "Question à la communauté", note: "Story avec sticker sondage/question pour engager (ex: quelle paire tu préfères ?).", tagType: "Autre", tagDetail: "", priority: "Basse" },
  { title: "Annonce de réassort", note: "Post ou story annonçant le retour en stock d'un produit populaire.", tagType: "Produit", tagDetail: "", priority: "Haute" },
  { title: "Témoignage / avis client", note: "Citation ou capture d'un avis client mise en avant visuellement.", tagType: "Autre", tagDetail: "", priority: "Basse" },
  { title: "Guide cadeaux saisonnier", note: "Carousel de suggestions de produits pour une occasion (rentrée, fêtes, etc.).", tagType: "Campagne", tagDetail: "", priority: "Moyenne" },
  { title: "Focus sur une nouvelle collection", note: "Annonce d'arrivée d'une nouvelle collection avec teaser visuel.", tagType: "Produit", tagDetail: "", priority: "Haute" },
  { title: "Motivation sportive du lundi", note: "Citation ou visuel inspirant lié au sport pour démarrer la semaine.", tagType: "Autre", tagDetail: "", priority: "Basse" },
  { title: "Live shopping / démonstration", note: "Annonce ou récap d'une session de démonstration produit en direct.", tagType: "Campagne", tagDetail: "", priority: "Moyenne" },
  { title: "Partenariat influenceur/ambassadeur", note: "Post croisé avec un ambassadeur portant un produit Planet Sport.", tagType: "Autre", tagDetail: "", priority: "Moyenne" },
  { title: "Rappel offre en cours", note: "Rappel visuel d'une promotion active avec compte à rebours de fin.", tagType: "Campagne", tagDetail: "", priority: "Haute" },
  { title: "Behind the sport — histoire d'un modèle", note: "Storytelling autour de l'histoire ou de la conception d'un produit phare.", tagType: "Autre", tagDetail: "Educational", priority: "Basse" },
];
