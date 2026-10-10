# Planning Éditorial Planet Sport — web app

Single-user planning app for Planet Sport's Instagram (stories + posts). UI language is French. Owner: Ilias.
The product already exists: `reference/planning-editorial.html` (~4,000 lines, built as a Claude artifact).
The job is to port it to Vercel + Firebase, add a login and two AI features. Full spec: `docs/BUILD.md`.

## Stack (fixed)
- Static vanilla HTML/CSS/JS. No framework, no bundler, no TypeScript, no frontend npm deps.
- Firebase JS SDK **compat** build from the gstatic CDN (app, auth, firestore). Pin one exact version.
- One serverless function `api/ai.js` (Node, zero deps, native fetch) calling Google Gemini.
- Hosting on Vercel: site in `public/`, functions in `api/`.

## Token rules
- Port, never rewrite. Keep every feature, label, layout and design token of the existing app.
- Never read a large file whole. `grep -n` for the anchor, then read about 40 lines around it.
- Never retype code to move it. Use a script (python or sed) for mechanical splits.
- Targeted edits only. If a change to `app.js` exceeds about 30 lines, it belongs in `platform.js` instead.
- Don't ask questions mid-run. Write blockers to `NEEDS.md`, use a placeholder, keep going.
- Verification is text-only: `node --check`, `curl`, `scripts/smoke.mjs` printing PASS/FAIL. No screenshot loops.
- Commit after each phase.

## Never
- Gemini key in client code or in git. Server env only.
- Commit `SETUP.env`, `.env*`, `.vercel/`, `seed/`, `reference/`.
- Serve anything outside `public/` (check after deploy).
- Add Firebase Storage, Google Drive API, React, Tailwind, shadcn, or a service worker.

## Commands
- Local: `npx vercel dev`
- Deploy: `npx vercel --prod --yes`
- Rules: `npx firebase-tools deploy --only firestore:rules --project <FIREBASE_PROJECT_ID>`
- Smoke: `node scripts/smoke.mjs <base-url>`
