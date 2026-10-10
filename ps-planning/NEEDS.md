# NEEDS — à fournir par Ilias

`SETUP.env` n'était pas dans le kit, donc toutes les valeurs ci-dessous sont des placeholders.
Une fois `SETUP.env` rempli (copie de `SETUP.env.example`) : `node scripts/gen-config.mjs`, puis reprendre les étapes bloquées plus bas.

## Valeurs manquantes
- FIREBASE_API_KEY, FIREBASE_AUTH_DOMAIN, FIREBASE_PROJECT_ID, FIREBASE_STORAGE_BUCKET, FIREBASE_MESSAGING_SENDER_ID, FIREBASE_APP_ID → `public/js/firebase-config.js` contient `PLACEHOLDER_*` ; l'écran de connexion affiche « Configuration Firebase manquante ».
- OWNER_EMAIL, OWNER_UID → login et règles Firestore.
- APP_PASSWORD → seed et smoke tests (le `.example` indique 123456 : à changer, c'est trop faible).
- GEMINI_API_KEY → `/api/ai` répond 500 `missing_env` sans elle.
- GEMINI_MODEL : la liste des modèles n'a pas pu être lue sans clé. Une fois la clé en place : `node scripts/pick-model.mjs`, puis mettre le résultat dans l'env Vercel `GEMINI_MODEL` (en attendant, utiliser `gemini-2.5-flash`).

## Firestore (bloqué : pas de projet ni de connexion firebase-tools)
1. Remplir SETUP.env, puis : `node scripts/gen-config.mjs && node scripts/gen-rules.mjs`
2. Règles : `npx firebase-tools login` puis `npx firebase-tools deploy --only firestore:rules --project <FIREBASE_PROJECT_ID>`.
   Ou à la main : console Firebase > Firestore Database > Règles > coller le contenu de `firestore.rules` > Publier.
   Texte des règles (OWNER_UID à remplacer) :
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /{document=**} {
         allow read, write: if request.auth != null && request.auth.uid == "<OWNER_UID>";
       }
     }
   }
   ```
3. Données : `node scripts/seed.mjs` (idempotent, ne remplace jamais un doc existant ; affiche les compteurs).
