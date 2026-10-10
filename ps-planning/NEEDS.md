# NEEDS — à fournir par Ilias

`SETUP.env` n'était pas dans le kit, donc toutes les valeurs ci-dessous sont des placeholders.
Une fois `SETUP.env` rempli (copie de `SETUP.env.example`) : `node scripts/gen-config.mjs`, puis reprendre les étapes bloquées plus bas.

## Valeurs manquantes
- FIREBASE_API_KEY, FIREBASE_AUTH_DOMAIN, FIREBASE_PROJECT_ID, FIREBASE_STORAGE_BUCKET, FIREBASE_MESSAGING_SENDER_ID, FIREBASE_APP_ID → `public/js/firebase-config.js` contient `PLACEHOLDER_*` ; l'écran de connexion affiche « Configuration Firebase manquante ».
- OWNER_EMAIL, OWNER_UID → login et règles Firestore.
- APP_PASSWORD → seed et smoke tests (le `.example` indique 123456 : à changer, c'est trop faible).
- GEMINI_API_KEY → `/api/ai` répond 500 `missing_env` sans elle.
