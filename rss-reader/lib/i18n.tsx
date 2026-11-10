"use client";

import * as React from "react";
import { readPref, usePref } from "@/lib/prefs";

// The interface in English or French. Article text stays in its own language; this covers
// the chrome: tabs, the sidebar, settings, list menus and the common actions. Strings not in
// the French table fall back to English, so a missing translation is never a blank.

export type Locale = "en" | "fr";
const KEY = "locale";

export const FR: Record<string, string> = {
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
  "Quick look": "Aperçu",
  "Swipe cards for Later and read": "Balayer les cartes pour À lire et Lu",
  "Off: swiping sideways on a list moves to the next or previous tab":
    "Désactivé : balayer une liste passe à l'onglet suivant ou précédent",
  About: "À propos de",
  "Triage unread": "Trier les non lus",
  "Got 5 minutes?": "5 minutes devant vous ?",
  "Skip sponsors": "Passer les sponsors",
  "Jump over sponsor reads in videos and episodes, with Undo":
    "Saute les passages sponsorisés des vidéos et épisodes, avec Annuler",
  In: "Dans",
  "Tap a source to look inside before following.":
    "Touchez une source pour la découvrir avant de la suivre.",
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
  // Reading sessions, triage, player, snooze, media cards
  "Passkey added: next time, unlock without the password":
    "Clé d'accès ajoutée : la prochaine fois, déverrouillez sans le mot de passe",
  "This device already has a passkey": "Cet appareil a déjà une clé d'accès",
  "Couldn't add the passkey": "Impossible d'ajouter la clé d'accès",
  "Add a passkey": "Ajouter une clé d'accès",
  "Unlock with your fingerprint, face or PIN instead of the password":
    "Déverrouillez avec votre empreinte, votre visage ou votre code plutôt que le mot de passe",
  Passkeys: "Clés d'accès",
  "Remove passkey": "Supprimer la clé d'accès",
  "Restore a backup": "Restaurer une sauvegarde",
  "Adds what's missing from a backup file; nothing is deleted":
    "Ajoute ce qui manque depuis un fichier de sauvegarde ; rien n'est supprimé",
  "Backup file": "Fichier de sauvegarde",
  "Restoring…": "Restauration…",
  "Couldn't restore that backup": "Impossible de restaurer cette sauvegarde",
  highlights: "surlignages",
  "saved articles": "articles enregistrés",
  categories: "catégories",
  rules: "règles",
  Restored: "Restauré",
  "Everything was already here": "Tout était déjà là",
  "Share this moment": "Partager ce moment",
  "Car mode": "Mode voiture",
  "Leave car mode": "Quitter le mode voiture",
  "Back 15 seconds": "Reculer de 15 secondes",
  "Ahead 30 seconds": "Avancer de 30 secondes",
  Pause: "Pause",
  Play: "Lecture",
  "Next episode": "Épisode suivant",
  Sound: "Son",
  "Silences trimmed": "Silences raccourcis",
  "On for this episode": "Actif sur cet épisode",
  "Applies to downloaded episodes": "S'applique aux épisodes téléchargés",
  "Voice boost": "Voix renforcée",
  "Trim silences": "Raccourcir les silences",
  "Downloaded: it plays without a connection": "Téléchargé : il se lit sans connexion",
  "The download failed": "Le téléchargement a échoué",
  Downloaded: "Téléchargé",
  "tap to remove": "touchez pour supprimer",
  Downloading: "Téléchargement",
  "Download for offline": "Télécharger pour l'écouter hors ligne",
  "Download removed": "Téléchargement supprimé",
  Downloads: "Téléchargements",
  "Nothing downloaded. Use the arrow in the player to keep an episode for offline.":
    "Rien de téléchargé. Utilisez la flèche du lecteur pour garder un épisode hors ligne.",
  "Remove download": "Supprimer le téléchargement",
  "Removed on their own once you've listened to the end.":
    "Supprimés d'eux-mêmes une fois écoutés jusqu'au bout.",
  "Plain YouTube titles": "Titres YouTube sans piège",
  "Clickbait-free titles written by the DeArrow community, when there is one":
    "Des titres sans piège à clics écrits par la communauté DeArrow, quand il y en a un",
  "Couldn't change titles": "Impossible de changer les titres",
  "Creator's title": "Titre du créateur",
  "A scroll": "Un défilement",
  "All clear": "Tout est trié",
  "Another round": "Encore un tour",
  "Back in Later": "De retour dans À lire",
  "Bigger buttons and rows": "Boutons et lignes plus grands",
  "Close the transcript": "Fermer la transcription",
  Collapse: "Replier",
  "Could not snooze": "Impossible de reporter",
  "Couldn't undo": "Impossible d'annuler",
  Done: "Terminé",
  "End of episode": "Fin de l'épisode",
  "End this session": "Terminer cette session",
  "Episodes about… (a topic, a guest, a question)":
    "Des épisodes sur… (un sujet, un invité, une question)",
  Expand: "Déplier",
  "Focus mode": "Mode concentration",
  "Follow a curated bundle for an interest in one tap":
    "Suivez une sélection sur un centre d'intérêt en un geste",
  From: "Depuis",
  "How much time do you have?": "Combien de temps avez-vous ?",
  "It will come back to Later, with a notification.":
    "Il reviendra dans À lire, avec une notification.",
  Keep: "Garder",
  "Later and For You": "À lire et Pour vous",
  "Later only": "À lire seulement",
  "Learned from {n} articles": "Appris de {n} articles",
  "Light by day, dark by night, by the clock (and your location when shared)":
    "Clair le jour, sombre la nuit, selon l'heure (et votre position si partagée)",
  "List options": "Options de la liste",
  "More options": "Plus d'options",
  Next: "Suivant",
  "Next in this session": "Suivant dans cette session",
  "Not refreshed yet": "Pas encore actualisé",
  "Not said in this one.": "Pas dit dans celui-ci.",
  "Nothing saved for Later yet.": "Rien dans À lire pour l'instant.",
  "Nothing short enough right now. Try more time.":
    "Rien d'assez court pour l'instant. Essayez plus de temps.",
  "Nothing unread here.": "Rien de non lu ici.",
  "Or swipe left for the next one": "Ou balayez vers la gauche pour le suivant",
  "Pages, like a book": "Des pages, comme un livre",
  "Ranked for you": "Classé pour vous",
  "Read as": "Lire en",
  "Read, then swipe to the next. Leave any time: a pill brings you back.":
    "Lisez, puis balayez vers le suivant. Partez quand vous voulez : une pastille vous ramène.",
  "Search the transcript": "Rechercher dans la transcription",
  "Search what's said…": "Chercher ce qui est dit…",
  Shuffle: "Mélanger",
  Skip: "Passer",
  "Sleep timer": "Minuteur de sommeil",
  Snip: "Extrait",
  "Snip the last half-minute": "Garder les 30 dernières secondes",
  "Snooze until…": "Reporter jusqu'à…",
  "Snoozed until": "Reporté jusqu'à",
  Start: "Commencer",
  "Stop playing in…": "Arrêter la lecture dans…",
  "Swap for another": "Échanger contre un autre",
  "Swap out": "Échanger",
  Tabs: "Onglets",
  "That one didn't save": "Celui-ci n'a pas été enregistré",
  "That's your {n} minutes": "Vos {n} minutes sont écoulées",
  "The start of each word in bold, to carry the eye":
    "Le début de chaque mot en gras, pour guider l'œil",
  Time: "Durée",
  Tomorrow: "Demain",
  Transcript: "Transcription",
  Triage: "Tri",
  "Turn off": "Désactiver",
  Undo: "Annuler",
  "Unsnooze now": "Ne plus reporter",
  Updated: "Mis à jour",
  "Your {n} minutes": "Vos {n} minutes",
  "coming back later": "reviendront plus tard",
  finished: "terminés",
  minutes: "minutes",
  of: "sur",
  "to read": "à lire",
  "{a} of {b} opened.": "{a} sur {b} ouverts.",
  "{kept} kept for Later, {skipped} skipped.": "{kept} gardés pour À lire, {skipped} passés.",
  piece: "lecture",
  pieces: "lectures",
  "Show less": "Voir moins",
  "Show all": "Tout voir",
  "Read along": "Lecture synchronisée",
  "Open the full transcript": "Ouvrir toute la transcription",
  Discussion: "Discussion",
  Chapters: "Chapitres",
  "Key moments": "Moments clés",
  "About the episode": "À propos de l'épisode",
  "Up next": "À suivre",
  "You might also like": "Vous aimerez aussi",
  "About the podcast": "À propos du podcast",
  "Episode page": "Page de l'épisode",
  "Skip, mark read": "Passer, marquer comme lu",
  "Keep for Later": "Garder pour À lire",
  Open: "Ouvrir",
  Details: "Détails",
  "Open on YouTube": "Ouvrir sur YouTube",
  "This evening": "Ce soir",
  "Tomorrow morning": "Demain matin",
  "This weekend": "Ce week-end",
  "Next week": "La semaine prochaine",
};

const LocaleContext = React.createContext<{
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (text: string) => string;
}>({ locale: "en", setLocale: () => {}, t: (text) => text });

export function readLocale(): Locale {
  return readPref<string>(KEY, "en") === "fr" ? "fr" : "en";
}

/** Outside components (toasts, helpers): the same lookup, read from the saved locale. */
export function tr(text: string) {
  return readLocale() === "fr" ? (FR[text] ?? text) : text;
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
