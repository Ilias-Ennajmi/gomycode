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
- **Déploiement Vercel** : `index.html` charge `styles.css` et `app.js` depuis le CDN jsdelivr (`cdn.jsdelivr.net/gh/Ilias-Ennajmi/gomycode@<commit-sha>/...`) plutôt qu'en fichiers locaux du déploiement. Cela évite une limite de taille sur le déploiement direct de fichiers vers Vercel (l'app dépasse la centaine de Ko). **Conséquence : après chaque modification de `styles.css` ou `app.js`, il faut committer/pousser sur GitHub, puis mettre à jour le hash de commit dans les deux URLs jsdelivr de `index.html` avant de redéployer** — sinon le CDN sert encore l'ancienne version. `config.js` et `index.html` restent déployés directement sur Vercel (petits fichiers, pas de souci de taille).
- **Backend** : Supabase — une table Postgres (`app_state`) qui stocke tout l'état de l'app (`calendars`, `brands`, `ideas`, `production`, `campaigns`, `assets`, `influencers`, `prefs`) sous forme d'un unique document JSON (JSONB). Ce choix (plutôt qu'un schéma relationnel complet) garde la logique JS quasi inchangée et limite le risque de régression, au prix de ne pas pouvoir requêter les champs individuellement en SQL — à revoir si l'app grossit beaucoup.
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
  calendars: {                    // un calendrier indépendant par marque
    "general": {                  // clé = id de marque (state.brands[].id), "general" = calendrier par défaut
      "2026-07-13": {              // clé = date du lundi de la semaine (YYYY-MM-DD)
        "2026-07-13": [ {card}, ... ],  // clé = date du jour (YYYY-MM-DD) -> tableau de cartes
        ...
      },
      ...
    },
    "adidas": { ... },
    ...
  },
  brands: [ {id, name, tier} ... ],   // registre des marques sélectionnables (catalogue TIER1/2/3 + marques ajoutées à la volée)
  ideas: [ {idea}, ... ],
  production: { todo: [...], inprogress: [...], ready: [...] },
  campaigns: [ {campaign}, ... ],
  assets: [ {title, url, brand}, ... ],
  influencers: [ {influencer}, ... ],
  prefs: { dark: bool, tab: string, view: "week"|"month"|"list", activeBrandId: string, attentionCollapsed: bool, filters: {search, status, resp} }
}
```

**Card** (contenu Feed ou Story) : `id, kind ("Feed"|"Story 1"|"Story 2"|"Story 3"), category, contentType (Photo/Vidéo/Carousel/Reel/Texte), title, format, cta, brand (nom, texte libre), status, responsable, note, checklist [3 bool], link, attentionDismissedAt (optionnel)`

**Campaign** : `id, name, period (texte affiché), start, end (YYYY-MM-DD, optionnels), items: [{id, title, date, status}]`

**Influencer** : `id, name, platform, category, campaign (nom, texte libre), status, contact, followers, notes`

## Calendrier : saisie manuelle, par marque

Le calendrier n'est **plus généré automatiquement** — chaque semaine démarre vide et se remplit uniquement via le bouton "+ Post"/"+ Story" (ou l'import CSV). Chaque marque a son propre calendrier indépendant (`state.calendars[brandId]`), sélectionnable via le menu déroulant en haut de l'onglet Calendrier ; ce même menu permet d'ajouter une nouvelle marque à la volée. Le formulaire d'ajout de contenu propose une répétition hebdomadaire optionnelle (clone le contenu sur N semaines suivantes). Les constantes `TIER1`/`TIER2`/`TIER3` (nom + % de catalogue) restent utilisées uniquement par la Bibliothèque pour l'affichage des parts de marché — elles ne pilotent plus aucune génération.

## Problèmes connus / dette technique

1. **Pas de responsive mobile.** Tout est pensé desktop — la grille 7 colonnes du Calendrier serait illisible sur petit écran.
2. **Import CSV fragile.** Format attendu très strict (ordre exact des colonnes, virgules) — une ligne malformée échoue silencieusement plutôt que de signaler l'erreur. L'import cible toujours le calendrier de marque actuellement actif.
3. **Redondance `format` / `contentType`.** Les cartes Calendrier ont désormais aussi `contentType`, en plus de `format` (texte libre) — jamais synchronisés avec les cartes Production, pourraient être fusionnés.
4. **Deux systèmes de statut non synchronisés.** Une carte envoyée d'Idéation → Production → Calendrier a son statut réinitialisé à chaque étape ("Idée" à chaque fois), sans lien de traçabilité au-delà du flag `fromIdea`.
5. **Pas d'export réel (PDF/image).** L'export "PDF" utilise l'impression navigateur (`window.print()`), pas de génération de fichier binaire.
6. **Pas de tests automatisés.** Tout le JS est une IIFE de ~2000 lignes sans découpage en modules ni tests unitaires.
7. **Stockage JSONB en un seul document.** Simple et fiable pour une petite équipe, mais deux personnes qui modifient des sections très différentes en même temps peuvent s'écraser mutuellement (dernier `save()` gagne) — pas de fusion fine par champ. Un modèle relationnel (une ligne par carte) réglerait ça si le multi-édition simultanée devient fréquent.
8. **Marques "custom" non nettoyées.** Une marque ajoutée à la volée (via le sélecteur ou un formulaire d'ajout) reste dans `state.brands` même si son calendrier redevient vide — pas de suppression de marque dans l'UI actuelle.

## Pistes d'évolution suggérées

- Séparer `app.js` en modules par domaine (`calendar.js`, `production.js`, `campaigns.js`, `influence.js`, `storage.js`) pour la lisibilité
- Ajouter un mode responsive (au moins une vue liste par défaut sur mobile)
- Remplacer l'import CSV silencieux par un rapport d'erreurs ligne par ligne
- Ajouter une option de suppression/fusion de marques custom
- Passer à un schéma relationnel (une table par type d'objet) si la synchro par blob JSON devient limitante

## Fonctionnalités récentes (benchmark outils de content calendar)

En comparant aux fonctions standards des outils du marché (Planable, CoSchedule, Later, Sprout Social — deadline tracking, backlog priorisé, actions groupées, raccourcis clavier), les ajouts suivants ont été faits :

- **Panneau "À traiter"** (onglet Calendrier) : liste, toutes semaines confondues, les contenus en retard ou à échéance sous 48h ; repliable, et chaque élément (ou tous d'un coup) peut être ignoré sans supprimer la carte.
- **Priorité sur les idées** (Idéation) : champ Basse/Moyenne/Haute, badge coloré, tri automatique par priorité dans le panneau. Une "Banque d'idées" propose des idées prêtes à l'emploi, ajoutables en un clic.
- **Actions groupées** : sélection multiple par case à cocher en vue Liste **et** en vue Semaine, changement de statut/responsable ou suppression en masse (avec annulation).
- **Calendriers par marque** : chaque marque a son propre calendrier ; sélecteur en haut de l'onglet Calendrier, avec ajout de marque à la volée.
- **Production ↔ Campagnes** : les cartes Production peuvent être rattachées à une campagne (regroupement visuel par campagne dans le Kanban), avec une barre de progression et un vrai formulaire d'édition.
- **Raccourcis clavier étendus** : `T` (aujourd'hui), `N` (nouveau post), `?` (aide raccourcis), en plus de `⌘K`/`Ctrl+K` (recherche) et `←`/`→` (semaine précédente/suivante) déjà existants.
