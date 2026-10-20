"use client";

import * as React from "react";
import { readPref, usePref } from "@/lib/prefs";

// The interface in English or French. Article text stays in its own language; this covers
// the chrome: tabs, the sidebar, settings, list menus and the common actions. Strings not in
// the French table fall back to English, so a missing translation is never a blank.

export type Locale = "en" | "fr";
const KEY = "locale";

const FR: Record<string, string> = {
  // Tabs and navigation
  "For You": "Pour vous",
  News: "Actus",
  RSS: "RSS",
  YouTube: "YouTube",
  Newsletters: "Newsletters",
  Podcasts: "Podcasts",
  Later: "À lire",
  "All articles": "Tous les articles",
  Today: "Aujourd'hui",
  "Weekly recap": "Récap de la semaine",
  Alerts: "Alertes",
  "Daily review": "Révision du jour",
  Ask: "Demander",
  Stats: "Statistiques",
  Highlights: "Surlignages",
  Library: "Bibliothèque",
  Discover: "Découvrir",
  Sources: "Sources",
  Search: "Recherche",
  "Search articles…": "Rechercher des articles…",
  Settings: "Réglages",
  Add: "Ajouter",
  "Add a site": "Ajouter un site",
  "Add a channel": "Ajouter une chaîne",
  "Add a newsletter": "Ajouter une newsletter",
  "Add a podcast": "Ajouter un podcast",
  // Lists
  Unread: "Non lus",
  Saved: "Enregistrés",
  Snoozed: "Reportés",
  Archive: "Archive",
  "Refresh feeds": "Actualiser les flux",
  "Mark all as read": "Tout marquer comme lu",
  "Catch me up": "Résume-moi",
  "Save a link": "Enregistrer un lien",
  Layout: "Affichage",
  Magazine: "Magazine",
  Grid: "Grille",
  "Daily goal": "Objectif du jour",
  "Find episodes": "Trouver des épisodes",
  More: "Plus",
  Letters: "Lettres",
  Collections: "Collections",
  "Add to collection": "Ajouter à une collection",
  "Download as EPUB": "Télécharger en EPUB",
  "Listen to Later": "Écouter À lire",
  "Reading comfort": "Confort de lecture",
  "Bionic reading": "Lecture bionique",
  "Larger tap targets": "Boutons plus grands",
  "Dark after sunset": "Sombre après le coucher du soleil",
  "Starter packs": "Packs de départ",
  "What do you want to read?": "Que voulez-vous lire ?",
  Follow: "Suivre",
  sources: "sources",
  "Pick an interest": "Choisissez un centre d'intérêt",
  "I'll add my own": "J'ajouterai les miens",
  "Saved searches": "Recherches enregistrées",
  "From your shows": "Dans vos émissions",
  Everywhere: "Partout",
  "No episodes found for that.": "Aucun épisode trouvé.",
  "Accent colour": "Couleur d'accent",
  Stories: "Stories",
  "Compact list": "Liste compacte",
  "Big pictures": "Grandes images",
  Sort: "Tri",
  "Newest first": "Plus récents d'abord",
  "Oldest first": "Plus anciens d'abord",
  Channels: "Chaînes",
  "In progress": "En cours",
  "Substack & web": "Substack et web",
  Email: "E-mail",
  Videos: "Vidéos",
  Shorts: "Shorts",
  All: "Tout",
  "Under 10 min": "Moins de 10 min",
  "10–30 min": "10 à 30 min",
  "30+ min": "Plus de 30 min",
  "Alert rules": "Règles d'alerte",
  // Greeting
  "Good morning": "Bonjour",
  "Good afternoon": "Bon après-midi",
  "Good evening": "Bonsoir",
  "Late night": "Bonne nuit",
  "Good night": "Bonne nuit",
  unread: "non lus",
  "You're all caught up": "Vous êtes à jour",
  "Review ready": "Révision prête",
  // Settings
  You: "Vous",
  Personalise: "Personnaliser",
  "Stories row": "Rangée des stories",
  "Sources with something new, above the lists":
    "Les sources avec du nouveau, au-dessus des listes",
  "Goal ring": "Anneau d'objectif",
  "Today's minutes against your goal, on For You and Today":
    "Vos minutes du jour face à l'objectif, sur Pour vous et Aujourd'hui",
  "Briefing card": "Carte du briefing",
  "Today's briefing at the top of For You": "Le briefing du jour en haut de Pour vous",
  "Compact density": "Densité compacte",
  "Tighter cards, more on screen": "Des cartes plus serrées, plus à l'écran",
  Haptics: "Vibrations",
  "A tap you can feel on saves, swipes and goals":
    "Une petite vibration sur les enregistrements, balayages et objectifs",
  "Top tabs": "Onglets du haut",
  "Order them, hide the ones you don't use, pin a category.":
    "Ordonnez-les, masquez ceux que vous n'utilisez pas, épinglez une catégorie.",
  "Pin a category as a tab…": "Épingler une catégorie comme onglet…",
  "Your reading": "Vos lectures",
  "Articles, time and highlights over the last 30 days":
    "Articles, temps et surlignages des 30 derniers jours",
  "Start on": "Ouvrir sur",
  Language: "Langue",
  "Discover sources": "Découvrir des sources",
  "Browse by interest, search, or paste a link": "Par centre d'intérêt, recherche ou lien collé",
  "Your sources": "Vos sources",
  "Rename, move, mute or unfollow": "Renommer, déplacer, couper ou ne plus suivre",
  Categories: "Catégories",
  "Content filters": "Filtres de contenu",
  "Hide, boost, alerts and auto-save": "Masquer, mettre en avant, alertes et enregistrement auto",
  AI: "IA",
  Appearance: "Apparence",
  Light: "Clair",
  Dark: "Sombre",
  Paper: "Papier",
  System: "Système",
  "Your data": "Vos données",
  "Import OPML": "Importer un OPML",
  "Export OPML": "Exporter en OPML",
  "Download a backup": "Télécharger une sauvegarde",
  "Sources, highlights, saved articles and settings, as one file":
    "Sources, surlignages, articles enregistrés et réglages, en un fichier",
  Notifications: "Notifications",
  App: "Application",
  "Under the hood": "Sous le capot",
  "Build, database, last refresh, errors":
    "Version, base de données, dernière actualisation, erreurs",
  Help: "Aide",
  "Keyboard shortcuts": "Raccourcis clavier",
  "What's new": "Nouveautés",
  "Sign out": "Se déconnecter",
  // Actions
  "Read later": "Lire plus tard",
  "Remove from Later": "Retirer de À lire",
  "Mark as read": "Marquer comme lu",
  "Mark as unread": "Marquer comme non lu",
  Share: "Partager",
  "Open original": "Ouvrir l'original",
  "Save offline": "Garder hors ligne",
};

const LocaleContext = React.createContext<{
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (text: string) => string;
}>({ locale: "en", setLocale: () => {}, t: (text) => text });

export function readLocale(): Locale {
  return readPref<string>(KEY, "en") === "fr" ? "fr" : "en";
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [raw, setRaw] = usePref<string>(KEY, "en");
  const locale: Locale = raw === "fr" ? "fr" : "en";
  React.useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const setLocale = React.useCallback((next: Locale) => setRaw(next), [setRaw]);
  const t = React.useCallback(
    (text: string) => (locale === "fr" ? (FR[text] ?? text) : text),
    [locale]
  );
  const value = React.useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}
export function useT() {
  return React.useContext(LocaleContext);
}
