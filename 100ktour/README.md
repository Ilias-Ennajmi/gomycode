# 100KTour

Jeu concours mobile pour les 100 000 abonnés Instagram de Planet Sport : une machine à trois rouleaux avec levier,
un bon d'achat de 1000 DH à gagner quand elle aligne 1 · 0 · 0, un stock de bons par ville.

## Les pages

| Adresse | Pour qui | Rôle |
|---|---|---|
| `/jeu/<ville>` | Clients, via le QR code du magasin | Accueil, formulaire, machine, résultat |
| `/reglement` | Clients | Règlement du jeu |
| `/validation` | Équipes en magasin | Vérifier un code gagnant et marquer le bon comme remis (code magasin à 6 chiffres) |
| `/admin` | Siège, avec mot de passe | Magasins, liens, QR codes, lots, chance de gain, participants, export, réglages |

## Les règles appliquées par le serveur

- Le résultat est tiré dans la base de données au moment où le joueur lance la machine. Le téléphone ne
  fait qu'afficher ce résultat.
- Une partie par numéro de téléphone et par appareil (cookie + identifiant gardé par le navigateur).
  L'adresse IP ne sert qu'à freiner les abus, car un Wi-Fi de magasin partage la même adresse.
- Le magasin est verrouillé pendant le tirage : le dernier bon ne peut pas être gagné deux fois.
- Quand tous les bons d'une ville sont gagnés, le jeu s'y arrête et affiche un message.
- **Créneau de gain** (facultatif, par ville) : heure d'ouverture, heure de montée, heure de fermeture et
  nombre de gagnants par jour. La chance reste à son niveau de base jusqu'à l'heure de montée, puis grimpe
  jusqu'à 100 % à la fermeture (carré du temps écoulé). Une fois le quota du jour atteint, la ville se ferme
  jusqu'au lendemain. Hors horaires, le jeu est fermé.
- Un gagnant reçoit un code unique (`PS-XXXXXX`). Le magasin le valide une seule fois, avec son code à
  6 chiffres et le nom de la personne qui remet le bon.

## Langues, son, liens

- Le joueur choisit le français ou l'arabe au premier écran (`src/app/jeu/[slug]/i18n.ts`).
- Les sons sont synthétisés dans le navigateur ; la vibration ne fonctionne que sur Android.
- Les écrans de fin renvoient vers le site, Instagram et TikTok (réglages généraux du back-office). Avec un
  numéro WhatsApp, le gagnant peut envoyer son code à Planet Sport en un geste.

## Sauvegardes

Chaque nuit à 23 h 30 (heure du Maroc), Vercel Cron appelle `/api/backup`, qui copie tous les participants
dans un stockage Vercel Blob privé, hors de la base de données. Il faut pour cela créer un Blob store dans
Vercel et le relier au projet (variable `BLOB_READ_WRITE_TOKEN`). Sans ce stockage, seul l'export Excel
manuel est disponible.

## Architecture

- **Next.js** (App Router) hébergé sur Vercel. Toute la logique passe par des actions serveur.
- **Supabase Postgres**. Les tables vivent dans le schéma privé `ps100k`, qui n'est pas exposé par l'API.
  La seule porte d'entrée est la fonction `public.ps100k_api(clé, fonction, arguments)`, qui refuse tout
  appel sans la clé applicative. Cette clé n'existe que dans les variables d'environnement du serveur.
- Le mot de passe du back-office est stocké haché (bcrypt) dans la base. La session est un cookie signé,
  valable 12 heures. Huit essais ratés bloquent la connexion pendant un quart d'heure.

```
src/core/        accès base, sécurité (cookies, session), téléphone, types
src/app/jeu/     le jeu
src/app/admin/   le back-office
src/app/validation/  la remise des bons en magasin
supabase/migrations/ le schéma et les fonctions SQL
tests/           tests unitaires et vérification des règles du tirage
```

## Installation

1. Appliquer les fichiers de `supabase/migrations/` dans l'ordre sur le projet Supabase.
2. Générer deux secrets et le mot de passe initial, puis les enregistrer dans la base :

   ```sql
   update ps100k.settings set
     app_key_hash = encode(sha256(convert_to('<PS100K_APP_KEY>', 'UTF8')), 'hex'),
     admin_password_hash = extensions.crypt('<mot de passe>', extensions.gen_salt('bf', 10));
   ```

3. Renseigner les variables de `.env.example` dans Vercel (ou dans `.env.local` en local).
4. Dans Vercel, le dossier racine du projet est `100ktour` et la branche de production est `main`.

## Commandes

```bash
npm run dev
```

```bash
npm test
```

```bash
npm run build
```

`tests/db-check.sh` vérifie les règles du tirage (dont 40 parties simultanées pour 2 bons) sur une base
Postgres locale où la migration a été appliquée.

## Avant le lancement

- Supprimer les participations de test depuis `/admin/participants`.
- Régler la chance de gain de chaque ville selon l'affluence attendue (2 % par défaut, soit environ un
  gagnant toutes les 50 parties).
- Faire relire `/reglement` par la personne en charge du juridique.
- Changer le mot de passe initial dans `/admin/reglages`.
