# Planet Sport — Calendrier éditorial (Content Studio)

Application web (HTML/CSS/JS vanilla, sans framework ni build step) pour planifier le contenu Feed/Stories/Influence de Planet Sport Maroc. Les données vivent maintenant dans une base **Supabase** (Postgres) partagée par toute l'équipe, avec synchronisation en temps réel entre appareils — voir "Architecture" ci-dessous.

## Fichiers

- `index.html` — coquille HTML : Tabler Icons + Google Fonts (Oswald/Inter) via CDN, le client `supabase-js` via CDN, puis `config.js`, `styles.css` et `app.js`. Contient aussi l'écran de connexion et l'écran "configuration requise".
- `styles.css` — tout le style (mode clair/sombre via `#psRoot.dark`, tokens couleur en haut du fichier, + styles de l'écran de connexion)
- `app.js` — toute la logique, dans une IIFE unique. Pas de modules ES, pas de build step.
- `config.js` — les identifiants Supabase (`SUPABASE_URL`, `SUPABASE_ANON_KEY`). À remplir après avoir créé le projet Supabase (voir plus bas). L'anon key est conçue pour être publique côté client — la vraie protection vient des règles Row Level Security (RLS) définies dans `supabase/schema.sql`.
- `supabase/schema.sql` — schéma SQL à exécuter une fois dans le projet Supabase.
- `vercel.json` — configuration minimale pour un déploiement statique sur Vercel.

## Architecture

- **Frontend** : statique (HTML/CSS/JS), aucun build step, déployable tel quel sur Vercel (ou tout hébergeur statique).
- **Backend** : Supabase — une table Postgres (`app_state`) qui stocke tout l'état de l'app (`weeks`, `ideas`, `production`, `campaigns`, `assets`, `influencers`, `prefs`) sous forme d'un unique document JSON (JSONB). Ce choix (plutôt qu'un schéma relationnel complet) garde la logique JS quasi inchangée et limite le risque de régression, au prix de ne pas pouvoir requêter les champs individuellement en SQL — à revoir si l'app grossit beaucoup.
- **Auth** : connexion unique partagée par toute l'équipe (email + mot de passe Supabase Auth). Pas d'inscription libre : le compte se crée depuis le Dashboard Supabase (voir procédure ci-dessous).
- **Synchronisation** : `save()` écrit dans Supabase avec un debounce de ~700ms, et met aussi à jour `localStorage` en instantané (cache local pour un premier affichage rapide). Un canal Supabase Realtime écoute les changements de la table `app_state` et met à jour l'app si un autre appareil/onglet a sauvegardé entre-temps.

## Mise en place (une seule fois)

### 1. Créer le projet Supabase

1. Aller sur [supabase.com](https://supabase.com), créer un compte/projet (le plan gratuit suffit).
2. Dans **SQL Editor**, coller le contenu de `supabase/schema.sql` et l'exécuter. Cela crée la table `app_state`, active les policies RLS (accès réservé aux utilisateurs authentifiés) et active le Realtime sur la table.
3. Dans **Authentication > Users**, cliquer sur "Add user" et créer le compte unique que toute l'équipe utilisera (email + mot de passe). C'est le login partagé — pas besoin d'auto-confirmation email, le compte est créé déjà confirmé depuis le Dashboard.
4. Dans **Project Settings > API**, copier :
   - `Project URL` → à coller dans `config.js` comme `PS_SUPABASE_URL`
   - `anon public` key → à coller dans `config.js` comme `PS_SUPABASE_ANON_KEY`

### 2. Configurer l'app

Éditer `config.js` :

```js
window.PS_SUPABASE_URL = "https://xxxxxxxx.supabase.co";
window.PS_SUPABASE_ANON_KEY = "eyJhbGciOi...";
```

Tant que ces valeurs restent sur les placeholders `YOUR-PROJECT` / `YOUR-ANON-KEY`, l'app affiche un écran "Configuration requise" au lieu de planter.

### 3. Déployer

L'app est 100% statique (pas de build) : n'importe quel hébergeur statique fonctionne (Vercel, Netlify, GitHub Pages...). Avec Vercel : importer ce dépôt GitHub comme projet, laisser le "Build Command" vide (voir `vercel.json`), déployer. Chaque push sur la branche connectée redéploie automatiquement.

### 4. Utilisation quotidienne

Toute l'équipe se connecte avec le même email/mot de passe créé à l'étape 1. Les modifications sont synchronisées en direct entre tous les appareils connectés.

## Modèle de données (`state`, stocké tel quel en JSONB dans `app_state.data`)

```js
state = {
  weeks: {
    "2026-07-13": {              // clé = date du lundi de la semaine (YYYY-MM-DD)
      "2026-07-13": [ {card}, ... ],  // clé = date du jour (YYYY-MM-DD) -> tableau de cartes
      ...
    },
    ...
  },
  ideas: [ {idea}, ... ],
  production: { todo: [...], inprogress: [...], ready: [...] },
  campaigns: [ {campaign}, ... ],
  assets: [ {title, url}, ... ],
  influencers: [ {influencer}, ... ],
  prefs: { dark: bool, tab: string, view: "week"|"month"|"list" }
}
```

**Card** (contenu Feed ou Story) : `id, kind ("Feed"|"Story 1"|"Story 2"|"Story 3"), category, title, format, cta, brand, status, responsable, note, checklist [3 bool], link`

**Campaign** : `id, name, period (texte affiché), start, end (YYYY-MM-DD, optionnels), items: [{id, title, date, status}]`

**Influencer** : `id, name, platform, category, campaign (nom, texte libre), status, contact, followers, notes`

## Logique de génération du calendrier

Le calendrier est **généré**, pas saisi à la main : `genDayCards(date)` calcule les cartes Feed/Story du jour selon une rotation fixe (voir `TIER1_PAIRS`, `TIER2`, `TIER3`, `STORY1_ROLE_BY_DAY`, etc. en haut de `app.js`). La fenêtre pré-générée va du **13 juillet au 4 octobre 2026** (`RANGE_START`/`RANGE_END`/`N_WEEKS = 12`). Au-delà, `ensureWeekData()` génère à la volée quand on navigue dessus, mais les stats de rotation (onglet Stats) ne sont fiables que sur les semaines déjà générées.

## Problèmes connus / dette technique

1. **Pas de responsive mobile.** Tout est pensé desktop — la grille 7 colonnes du Calendrier serait illisible sur petit écran.
2. **Import CSV fragile.** Format attendu très strict (ordre exact des colonnes, virgules) — une ligne malformée échoue silencieusement plutôt que de signaler l'erreur.
3. **Rotation des marques limitée à la fenêtre visitée.** Le calcul dans Stats ne regarde que les semaines déjà dans `state.weeks` (pré-générées au chargement pour les 12 premières, mais pas au-delà sans navigation).
4. **Redondance `format` / `contentType`.** Les cartes Calendrier ont un champ `format` (ex: "Carousel ou Reel"), les cartes Production ont un champ `contentType` (Photo/Vidéo/Carousel/Reel/Texte) séparé — jamais synchronisés, pourraient être fusionnés.
5. **Deux systèmes de statut non synchronisés.** Une carte envoyée d'Idéation → Production → Calendrier a son statut réinitialisé à chaque étape ("Idée" à chaque fois), sans lien de traçabilité au-delà du flag `fromIdea`.
6. **Pas d'export réel (PDF/image).** Seul l'export "copier en texte" (WhatsApp) existe.
7. **Pas de tests automatisés.** Tout le JS est une IIFE de ~1700 lignes sans découpage en modules ni tests unitaires.
8. **Stockage JSONB en un seul document.** Simple et fiable pour une petite équipe, mais deux personnes qui modifient des sections très différentes en même temps peuvent s'écraser mutuellement (dernier `save()` gagne) — pas de fusion fine par champ. Un modèle relationnel (une ligne par carte) réglerait ça si le multi-édition simultanée devient fréquent.

## Pistes d'évolution suggérées

- Séparer `app.js` en modules par domaine (`calendar.js`, `production.js`, `campaigns.js`, `influence.js`, `storage.js`) pour la lisibilité
- Ajouter un mode responsive (au moins une vue liste par défaut sur mobile)
- Remplacer l'import CSV silencieux par un rapport d'erreurs ligne par ligne
- Étendre `RANGE_END` ou rendre la fenêtre de génération dynamique plutôt que fixée en dur au 4 octobre 2026
- Passer à un schéma relationnel (une table par type d'objet) si la synchro par blob JSON devient limitante

## Fonctionnalités récentes (benchmark outils de content calendar)

En comparant aux fonctions standards des outils du marché (Planable, CoSchedule, Later, Sprout Social — deadline tracking, backlog priorisé, actions groupées, raccourcis clavier), les ajouts suivants ont été faits :

- **Panneau "À traiter"** (onglet Calendrier) : liste, toutes semaines générées confondues, les contenus en retard ou à échéance sous 48h, avec un bouton "Voir" qui saute directement à la bonne semaine.
- **Priorité sur les idées** (Idéation) : champ Basse/Moyenne/Haute, badge coloré, tri automatique par priorité dans le panneau.
- **Actions groupées en vue Liste** (Calendrier → Liste) : sélection multiple par case à cocher, changement de statut/responsable ou suppression en masse (avec annulation).
- **Raccourcis clavier étendus** : `T` (aujourd'hui), `N` (nouveau post), `?` (aide raccourcis), en plus de `⌘K`/`Ctrl+K` (recherche) et `←`/`→` (semaine précédente/suivante) déjà existants.
