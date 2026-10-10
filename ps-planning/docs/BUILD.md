# Build spec (one run, MVP)

The plan is final. Don't re-plan, don't ask questions. Execute phases 1 to 8 in order.

## 0. What you're working with

`reference/planning-editorial.html` is the current app. It ran inside a host runtime that exposed
`window.claude.use(name)` → Promise of a service. The app uses four of them:

| Service | Used as | Where (grep for it) |
|---|---|---|
| `db` | `db.doc(path).onSnapshot(cb, errCb)`, `.set(obj)`, `.delete()`; `db.collection(name).onSnapshot(cb, errCb)`. Snapshot: `s.exists` (boolean property), `s.data()`, `sn.docs[i].id`, `.data()` | `function boot`, `S.db.doc(` |
| `assets` | `upload(file)` → `{id, sizeBytes}`; rejects `{code:"too_large"\|"unsupported_type"\|"quota_or_state"}` | `S.assets.upload(` (2 sites), `function blobUrl` |
| `downloads` | `save({filename, data})`, data is a string (CSV) or ArrayBuffer (XLSX) | `S.dl.save(` |
| `sample` | `json(prompt, {signal})` → parsed JSON; rejects `{code:"cancelled"\|"rate_limited"\|"invalid_json"\|...}` | `S.sample.json(` |

Collections the app reads/writes: `days/{YYYY-MM-DD}`, `campaigns/{id}`, `ideas/{id}`, `groups/{id}`, `config/settings`, `config/storyRules`.

**Strategy: a shim, not a rewrite.** Build `public/js/platform.js` that defines `window.claude = { use(name) }`
returning Firebase-backed versions of these four services with the exact same shapes. Then `app.js` boots
unchanged. Only three small edits to `app.js` are allowed (listed in phase 4 and 5).

`seed/seed.json` holds the live data exported 2026-10-10: `days` (20), `campaigns` (2), `config.settings`,
`config.storyRules`. `ideas` and `groups` are empty.

`SETUP.env` holds the owner's values. Anything empty → placeholder + a line in `NEEDS.md`, then continue.

## Target layout

```
public/index.html            markup only (from the reference)
public/css/app.css           extracted <style>
public/js/firebase-config.js generated from SETUP.env (web config is public by design)
public/js/platform.js        NEW: firebase init, login gate, 4 service shims
public/js/app.js             extracted <script>, 3 small edits
public/manifest.webmanifest, public/icons/
api/ai.js
scripts/firestore-rest.mjs, scripts/seed.mjs, scripts/smoke.mjs
firestore.rules, firebase.json, .firebaserc
vercel.json, .vercelignore, .gitignore
```

## Phase 1. Split (mechanical)

Python script: extract the single inline `<style>` → `public/css/app.css`, the single inline `<script>` →
`public/js/app.js`, write the rest to `public/index.html` with `<link>` and `<script>` tags in this order:
gstatic firebase-app-compat, firebase-auth-compat, firebase-firestore-compat, `firebase-config.js`,
`platform.js`, `app.js`. Keep the Google Fonts link and the lazy XLSX loader as they are.
Check: `node --check public/js/app.js`, and total size of the three files ≈ the original.
`git init`, commit.

## Phase 2. platform.js: Firebase, login, db shim

**Init.** `firebase.initializeApp(PS_CONFIG.firebase)`. `firestore().enablePersistence({synchronizeTabs:true})`, ignore errors.

**Login gate.** Auth persistence LOCAL. While no user: full-screen overlay above the app, styled with the app's
existing CSS variables and fonts (read `:root` tokens in app.css, don't invent a palette). Content: app name,
one password field, one button, error line. Email is `PS_CONFIG.ownerEmail` (never shown).
`signInWithEmailAndPassword`. French errors: wrong password → "Mot de passe incorrect.",
`auth/too-many-requests` → "Trop de tentatives. Réessaie dans quelques minutes.", network → "Pas de connexion.".
Enter key submits; autofocus the field. Expose `window.PS.logout()`.

**db shim.** Firestore rejects nested arrays and `config/storyRules` contains them (`ambassadors: [[0,"asics"],...]`).
So every document is stored as `{ j: JSON.stringify(data), u: serverTimestamp() }` and decoded on read.
Implement:
- `doc(path)` → `{ onSnapshot(cb, err), set(obj), delete() }`; snapshot wrapper `{ exists, id, data() }`.
- `collection(name)` → `{ onSnapshot(cb, err) }`; wrapper `{ docs: [{ id, data() }] }`.
- `flush()` → `firestore().waitForPendingWrites()`.
- If a stored doc has no `j` field, return its raw fields (robustness).
`use("db")` resolves only after sign-in.

## Phase 3. Other shims

**assets.** `upload(file)`: accept png/jpeg/webp/gif else reject `{code:"unsupported_type"}`. Downscale on a canvas
to 1600 px long edge, encode WebP q 0.82; if > 700 KB retry at 1200 px q 0.65; if still > 900 KB reject
`{code:"too_large"}`. Store `assets/{id}` as `{ dataUrl, type, sizeBytes, createdAt }` (no `j` wrapping needed).
Keep an in-memory cache id → dataUrl, fill it on upload. Resolve `{ id, sizeBytes }`.
`src(id)`: cached dataUrl, or `""` while it fetches the doc once; on arrival cache it and dispatch
`window` event `ps:asset`. Unknown or missing id → `""` forever, never a broken image (the old artifact had one
3.7 MB image that is not migrated).

**downloads.** `save({filename, data})` → Blob (CSV as `text/csv;charset=utf-8` with BOM) → object URL →
temporary `<a download>` click → revoke. Resolve.

**sample.** `json(prompt, opts)` → `POST /api/ai` `{ mode:"json", prompt }` with header
`Authorization: Bearer <currentUser.getIdToken()>`, honoring `opts.signal`. Map errors: AbortError →
`{code:"cancelled"}`, 429 → `rate_limited`, unparsable → `invalid_json`, else `ai_error`. Also expose
`window.PS.ai(mode, payload)` for the new features in phase 5.

## Phase 4. api/ai.js

- POST only. Verify the ID token with zero deps: `POST https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=FIREBASE_API_KEY`
  with `{ idToken }`; require `users[0].localId === OWNER_UID`, else 401.
- Gemini REST `generateContent`, model from env `GEMINI_MODEL`. During the build, list
  `GET https://generativelanguage.googleapis.com/v1beta/models?key=…` once and set `GEMINI_MODEL` to the newest
  stable Flash model that supports `generateContent`. `responseMimeType: "application/json"`, temperature 0.7,
  prompt capped at 12,000 chars, 25 s timeout. Return the parsed JSON. 429 passthrough as `{code:"rate_limited"}`.
- Modes: `json` (raw prompt from the app, unchanged), `captions`, `review` (below). Prompts for the new modes live
  in this file, in French.
- System instruction for every mode: Planet Sport is a Moroccan sports retailer (30+ stores, planetsport.ma),
  audience 16 to 35. For any copy: French, natural and direct, short lines stacked, no em dash, max 2 emojis,
  "on" rather than "nous", no repeated word within a caption, no salesy or sentimental clichés, promo copy ends
  with "en magasin & sur planetsport.ma".

## Phase 5. App edits and the two new AI features

Allowed edits in `app.js` (keep each small):
1. `blobUrl(id)` → `return id ? window.claude.assetSrc(id) : ""` (expose `assetSrc` on `window.claude`), and in
   `boot` add `window.addEventListener("ps:asset", debounce(render, 100))`.
2. Sync: when the db service resolves, keep the existing `setSync` calls. In platform.js, set "Enregistrement…"
   while writes are pending and "Hors ligne" on `offline`. Add an "Enregistrer" button beside `#sync`
   (same visual style) and Ctrl/Cmd+S: await `S.wq` then `flush()`, toast "Tout est enregistré". Add a small
   "Se déconnecter" control in the same area.
3. Hook the two features below into existing UI, reusing existing classes, dialogs (`dlgHost`) and `toast`.

**A. Légendes.** In the content-item editor (there are two `function paintPrev`; use the one whose upload sets
`it.assetId`), add a "Légende" textarea bound to a new `caption` field on the item, plus a button "3 propositions".
It calls mode `captions` with the item (brand name, category, format, title, notes, campaign name, intent).
Response `{options:[string,string,string]}`, three structurally different options, shown as plain clickable
cards with no labels; clicking one fills the textarea. Make sure `caption` survives save and the CSV/XLSX export
(add a column at the end).

**B. Analyser la semaine.** One button in the week view sub-bar. Calls mode `review` with the displayed week's
items, `S.cfg.brands` (with targets), `S.cfg.types`, `S.cfg.tolerance`, `S.cfg.storiesPerDay`.
Response `{suggestions:[{date, issue, fix}]}`, max 5, concrete swaps ("Mardi : 3 stories Asics, passe la 2e sur
New Balance"). Shown in a dismissible panel. No auto-apply.

The existing "idée → cartes" generator must work unchanged through the `sample` shim.

## Phase 6. Data, rules, PWA

- `scripts/firestore-rest.mjs`: sign in with REST (`accounts:signInWithPassword`, email + password from SETUP.env),
  then Firestore REST read/write helpers using the same `{ j, u }` encoding.
- `scripts/seed.mjs`: import `seed/seed.json`. Idempotent: skip any doc that already exists, never overwrite.
  Print counts.
- `firestore.rules`: everything readable/writable only if `request.auth.uid == "<OWNER_UID>"`. Deploy with
  firebase-tools if logged in, else put the rules text and console steps in `NEEDS.md`.
- Settings area: "Exporter une sauvegarde (JSON)" (all collections, same shape as seed.json) and
  "Importer une sauvegarde" (confirm dialog, skip existing docs unless the user ticks "remplacer").
- PWA: manifest (`name` "Planning Planet Sport", `short_name` "Planning PS", `display` standalone, theme color from
  the app tokens), 192/512 PNG icons and a 180 apple-touch-icon generated from a simple "PS" monogram SVG with
  whatever tool is available (python PIL, or skip PNGs and log it in NEEDS.md).

## Phase 7. Deploy

- `vercel.json`: `{ "outputDirectory": "public" }` plus no-store cache header for `/js/*` and `/css/*` only if
  needed. `.vercelignore`: SETUP.env, seed, reference, docs, scripts, .env*.
- `npx vercel link --yes` (project name `ps-planning`), add production env vars: `GEMINI_API_KEY`,
  `GEMINI_MODEL`, `FIREBASE_API_KEY`, `OWNER_UID`. `npx vercel --prod --yes`.
- If Vercel CLI is not logged in, run everything else and put the exact commands in `NEEDS.md`.

## Phase 8. Verify and report

`scripts/smoke.mjs <url>` prints PASS/FAIL for:
1. `/` returns 200 and contains the app title.
2. `/SETUP.env`, `/seed/seed.json`, `/reference/planning-editorial.html` return 404.
3. `/api/ai` without token → 401.
4. REST sign-in works; write, read back and delete `days/_smoke` with the `{ j }` encoding.
5. Unauthenticated Firestore REST read of `config/settings` is denied.
6. `/api/ai` with a token, mode `captions`, sample item → 3 options.
7. Seed counts present (days ≥ 20, campaigns ≥ 2, config 2).

Final message to the owner, in French, under 15 lines: live URL, PASS/FAIL list, contents of `NEEDS.md`,
and what to test first on his phone.

## Out of scope (don't build)
Instagram insights, Google Drive API, multi-user, notifications, redesign of existing screens.
