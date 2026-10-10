// Writes firestore.rules with OWNER_UID from SETUP.env.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadEnv, ROOT } from "./env.mjs";
const uid = loadEnv().OWNER_UID || "PLACEHOLDER_OWNER_UID";
writeFileSync(join(ROOT, "firestore.rules"), `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == "${uid}";
    }
  }
}
`);
console.log("firestore.rules written for", uid);
