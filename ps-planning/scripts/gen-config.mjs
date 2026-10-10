// Generates public/js/firebase-config.js from SETUP.env. The Firebase web config is public by design.
// Empty values become PLACEHOLDER_* so the app shows a clear message instead of crashing.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadEnv, ROOT } from "./env.mjs";

const env = loadEnv();
const missing = [];
const v = (k) => env[k] || (missing.push(k), "PLACEHOLDER_" + k);
const cfg = {
  firebase: {
    apiKey: v("FIREBASE_API_KEY"),
    authDomain: v("FIREBASE_AUTH_DOMAIN"),
    projectId: v("FIREBASE_PROJECT_ID"),
    storageBucket: v("FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: v("FIREBASE_MESSAGING_SENDER_ID"),
    appId: v("FIREBASE_APP_ID"),
  },
  ownerEmail: v("OWNER_EMAIL"),
};
writeFileSync(join(ROOT, "public/js/firebase-config.js"),
  "/* Généré par scripts/gen-config.mjs depuis SETUP.env. Config web Firebase : publique par conception. */\n" +
  "window.PS_CONFIG=" + JSON.stringify(cfg, null, 2) + ";\n");
console.log(missing.length ? "firebase-config.js written, placeholders for: " + missing.join(", ") : "firebase-config.js written");
writeFileSync(join(ROOT, ".firebaserc"), JSON.stringify({ projects: { default: cfg.firebase.projectId } }, null, 2) + "\n");
