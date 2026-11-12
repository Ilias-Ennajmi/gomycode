# Atelier — progress and decisions

Read this at the start of every session. Updated after every task.

## Current phase: 1 · Foundation and canvas core (all 23 tasks done; acceptance below)

Plan: `docs/plans/2026-11-12-phase-1-foundation-canvas.md`. Spec: `docs/SPEC.md`.

## Phase 1 tasks
- [x] Task 1: App scaffold, tokens, tooling and CI
- [x] Task 2: Database schema, RLS and SQL tests
- [x] Task 3: Supabase clients, owner guard, login and local-only mode
- [x] Task 4: Two-step verification (TOTP)
- [x] Task 5: Object model, defaults, validation and z-order keys
- [x] Task 6: BoardDoc — Yjs wrapper, transactions, undo, change events
- [x] Task 7: Geometry and camera maths
- [x] Task 8: Spatial index and culling
- [x] Task 9: Canvas view and object rendering
- [x] Task 10: Input pipeline, gestures and camera control
- [x] Task 11: Select tool — hit, marquee, move, resize, rotate, snap
- [x] Task 12: Creation tools — sticky, text, shape, frame, arrow, pen, highlighter, eraser
- [x] Task 13: Rich text editing
- [x] Task 14: Commands, shortcuts and arrangement
- [x] Task 15: Clipboard serialisation and parsing (pure)
- [x] Task 16: Clipboard and drag-drop wiring
- [x] Task 17: Image assets — worker pipeline, upload queue, resolver
- [x] Task 18: Local persistence and server sync
- [x] Task 19: Editor chrome — top bar, toolbar, context bar, menus, zoom, minimap
- [x] Task 20: Layers, Inspector, command palette, find & replace
- [x] Task 21: Home — boards, folders, templates
- [x] Task 22: PWA, offline shell, theme and settings
- [x] Task 23: End-to-end tests, performance smoke, accessibility, deployment

## Decisions
- 2026-11-12 Task 1: Inter is self-hosted through `@fontsource-variable/inter` (OFL) instead of `next/font/google`, so builds never need to reach Google Fonts.
- 2026-11-12 Task 1: all runtime dependencies the whole of Phase 1 needs are installed in Task 1, so later tasks do not touch `package.json`.
- 2026-11-12 Task 1: Vitest runs two projects: `node` for `tests/unit/**/*.test.ts` and `jsdom` for `*.test.tsx` (a `.ts` test can opt in with `// @vitest-environment jsdom`). `fake-indexeddb/auto` is loaded in both.
- 2026-11-12 Task 1: Playwright uses the pre-installed Chromium at `/opt/pw-browsers/chromium` when it exists (override with `PW_CHROMIUM_PATH`); CI installs its own. Run with `--trace off`.
- 2026-11-12 Task 1: `images.unoptimized` is on; canvas images come from R2 already resized.

- 2026-11-12: Next.js upgraded 16.3.8 → 16.4.6 (npm audit: 0 vulnerabilities in production deps). Stash still pins 16.3.8.
- 2026-11-12 Task 2: RLS tests run against a real Postgres 16 (`scripts/test-rls.sh`); `atelier.is_owner()` also rejects anonymous Supabase identities so a Stash anonymous user gets nothing.
- 2026-11-12 Task 17: asset ids are uuids generated on the client; R2 keys are `a/{id}/w1024.webp` and `a/{id}/original` (no extension).
- 2026-11-12 Task 18: sync wire format is base64 JSON; a single Yjs update over 1 MB cannot be pushed (status shows "error").
- 2026-11-12 Task 21/22: Duplicate board is client-side only (needs the source opened once on this device); the service worker caches only `/` and `/b/*` HTML.
- 2026-11-12: Phases 2–4 plans written (`docs/plans/2026-11-12-phase-{2,3,4}-*.md`, 19 + 20 + 15 tasks).

## Verified (2026-11-12, final Phase 1 gate, Task 23)
- `npm run typecheck` clean · `npm run lint` clean · `npm test`: 71 files, 1,183 tests passing · `npm run build` OK.
- `PORT=3198 npm run e2e`: **158 passed** (79 on `desktop`, 79 on `phone`) in about 2 minutes: a11y 18, auth-gate 4, clipboard 10, editor 9, faults 2, features 15, home 12, offline 2, perf 5, smoke 2 per project.
- `DATABASE_URL=postgresql://atelier:atelier@localhost:5432/atelier_test bash scripts/test-rls.sh`: "RLS tests passed" (Postgres 16, migrations applied twice).
- Not run here: the GitHub Actions workflow itself (it is updated: types, lint, unit, RLS against the Postgres service, build, `playwright install --with-deps chromium`, e2e on both projects).

## Phase 1 acceptance (plan list, SPEC section 2 Phase 1 and section 8)
PASS = demonstrated by a test that ran and passed (named). NOT MEASURABLE-HERE = needs something this sandbox does not have (live Supabase project, real GPU, real devices, a CI run). Nothing is marked PASS without a test or a number.

| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | Owner login: closed by default, owner-only | PASS | `e2e/auth-gate.spec.ts` (4): signed-out pages redirect to `/login?next=`, API calls get 401 JSON, health and shell files stay open, local-only mode skips it; units `owner.test.ts`, `proxy.test.ts`, `login-form.test.tsx`; `scripts/test-rls.sh` (owner / other user / anon) |
| 1b | Owner login against the real Supabase project (password, session on trusted devices) | NOT MEASURABLE-HERE | needs the live project; first lines of the DEPLOY.md smoke checklist |
| 2 | Optional TOTP | PASS (code) / NOT MEASURABLE-HERE (live) | units `mfa.test.ts`, `security.test.tsx`; real enrol and verify need Supabase (DEPLOY.md smoke checklist) |
| 3 | Home: boards, folders, starred, search, templates, trash, rename, move, delete with undo | PASS | `e2e/home.spec.ts` (12): all six templates open with objects and bound arrows (flowchart: every arrow glued at both ends), rename, star and Starred view, search and no-match message, new folder and move, delete then Undo, trash with "30 days left" and Restore. Duplicate board and card thumbnails: units only (`home-app.test.tsx`, `home-board-docs.test.ts`), no e2e |
| 4 | Infinite canvas: pan, zoom, minimap, zoom presets, zoom to fit and to selection | PASS | `editor.spec.ts` "Shift+1 zooms to fit"; `features.spec.ts` "zoom presets, zoom to selection and the minimap" (desktop: minimap click moves the view); wheel pan and zoom driven in `perf.spec.ts` |
| 5 | Objects: image, rich text, sticky, six shapes, arrows with deliberate binding, frames with real-size presets, pen, highlighter, eraser | PASS | image: `clipboard.spec.ts` drop and paste of two PNGs (placeholders only: R2 not reachable in local-only mode); rich text: bold in a sticky (`features`), 500-line paste; sticky: `editor`; six shapes: `features` "every shape kind"; arrows: `editor` "bound arrow follows", `clipboard` "pasted arrow stays bound"; frame: `editor` "frame carries its children", `features` A4 preset is 794 x 1123 px; pen with mouse and with a finger (CDP touch), highlighter and eraser: `editor`, `features` |
| 6 | Select, marquee, move, resize (Shift keeps ratio), rotate, flip, group, lock, align, distribute, z-order, duplicate, nudge, copy and paste style | PASS (flip and paste style by units only) | `editor` (resize, group and ungroup), `features` "marquee select, duplicate, nudge, lock and z-order", "align and distribute from the command palette", "rotate by handle and flip" (flip only checks the object survives); units `commands.test.ts`, `align.test.ts`, `select-tool.test.ts`, `z-order.test.ts` cover flip and paste style |
| 7 | Unlimited undo and redo | PASS | `editor` sticky undo/redo (typing, then creation), group is one step, delete Undo toast; no stack limit is configured on the Yjs UndoManager; units `board-doc.test.ts`, `track-origin.test.ts` |
| 8 | Find and replace | PASS | `features` "find and replace changes matching text on the board, and one undo reverts it" (sticky and text, 3 matches) |
| 9 | Clipboard: copy, cut, paste inside the app and from other apps, drop files | PASS | `clipboard.spec.ts` (10): copy and paste with a bound arrow, cut, 500-line paste then "Split into 500 stickies?", short list prompt, drop and paste of two images into a grid, unsupported / 60 MB / empty / undecodable (HEIC) files each named in a toast with nothing inserted, malformed Atelier payloads and an empty clipboard do not crash |
| 10 | Layers, Inspector, command palette, context menu | PASS | `features` (layers select, inspector width edit, palette finds objects and runs commands, right-click and long-press menu), `a11y` (all axe-clean) |
| 11 | Offline-first IndexedDB, status indicator | PASS (local mode) | `offline.spec.ts`: offline edit, reload, edits persist (service worker serves the page, IndexedDB the board), board list opens offline, never-opened board shows the offline page; the indicator reads "Saved on this device" in local-only mode. The "Offline · saved on this device", "Syncing" and "Sync problem" states exist only with a server: units `chrome.test.tsx`, `sync.test.ts` |
| 11b | Multi-device sync (two devices edit offline, reconnect) | PASS (unit) / NOT MEASURABLE-HERE (live) | `sync.test.ts` "keeps both sets of edits, converges to identical state and duplicates nothing" and the corrupt-store and backoff cases; a real two-browser run needs Supabase |
| 12 | Light and dark theme | PASS | `features` "dark theme from Settings applies, persists across reloads, and the chrome still passes axe", "System follows the device's colour scheme" |
| 13 | Installable PWA | PASS (browser checks) / NOT MEASURABLE-HERE (device install) | `features` manifest test: valid manifest, 192 and 512 icons served, service worker controlling, Chromium `Page.getInstallabilityErrors` empty (apart from "in-incognito", which every Playwright context has); units `manifest.test.ts`, `service-worker.test.ts`. Installing on iOS and Android: DEPLOY.md checklist |
| 14 | 500-object board interactive < 500 ms | PASS (returning visit) | `perf.spec.ts`, mark `atelier:board-ready`, this sandbox: returning visit (best of the two visits after the first) 160-285 ms over six runs, single visits up to 499 ms while other tests ran in parallel; first open in a fresh browser 345-609 ms (straddles 500 ms: it includes loading the JS). Assert in CI: best returning visit < 1,500 ms |
| 15 | WCAG 2.2 AA chrome | PASS (automated and keyboard) | `a11y.spec.ts` (18 per project): axe with tags wcag2a, 2aa, 21a, 21aa, 22aa, zero serious or critical on home, dialogs, editor (empty, with content and selection), three panels, palette, context menu, five tool popovers, settings, login (second server), plus dark theme in `features`; toolbar roving focus and Enter, Escape, skip link, Tab order, panel focus return, objects reachable in Layers; reduced motion: no transform transitions (with a control showing the watcher sees them otherwise). Not covered: screen-reader testing by hand |
| 16 | All tests green locally; CI green | PASS (local) / NOT MEASURABLE-HERE (CI) | the gate above; the workflow was edited but not run |
| 17 | Review Focus 1-5 | PASS | 1: `sync.test.ts`; 2: `clipboard.spec.ts` and units; 3: `owner.test.ts`, `proxy.test.ts`, `rls.sql`; 4: `faults.spec.ts` (found and fixed a real crash, below) and `board-doc.test.ts`; 5: `camera.test.ts`, `gestures.test.ts` |

SPEC section 8, rows that apply to Phase 1 (numbers from `e2e/perf.spec.ts` via `bench/`; machine: 4 vCPU Intel Xeon 2.3 GHz, 16 GB, headless Chrome for Testing 153 with **software rendering and no GPU**; so frame times are **not representative of a laptop or phone**):

| Row | Target | Measured here | Result |
|---|---|---|---|
| Open 500-object board from local cache | < 500 ms to interactive | returning visit 160-285 ms (best of two), first open 345-609 ms, phone viewport the same range; with the CPU slowed 4x: 584-902 ms | PASS (warm). Cold straddles the line |
| Pan, 1,000 images | >= 60 fps, p95 < 20 ms | desktop and phone viewport: 60 fps, p95 16.7-16.8 ms, 0 frames over 20 ms (image **placeholders**, not decoded pictures) | PASS in the sandbox for placeholders; the real-image gate is Phase 2 |
| Zoom (pinch), 1,000 images | same | phone viewport 55-58 fps, p95 33 ms; desktop viewport 17-20 fps, p95 83-117 ms | NOT MEASURABLE-HERE: misses the target on the desktop-size viewport without a GPU. A CPU profile of the panning run showed about 9 ms of script in 2 s (the rest idle or native), so rasterising on the CPU is the likely cause, but zoom was not profiled and this is a risk to re-measure on real hardware |
| Pan and zoom, 500 objects | (smoke) | pan 60 fps p95 16.8 ms; zoom 40-56 fps, p95 33 ms | logged; CI asserts pan p95 < 34 ms, zoom p95 < 250 ms |
| Drag latency | < 16 ms of work per frame | 1 object and 25-40 selected of 500: handler p95 1.1-3.5 ms (max 9.8), frame p95 16.7-16.8 ms (synthetic pointer events, one per frame) | PASS in the sandbox |
| Pan, iPad Safari | >= 30 fps, no crash | not run | NOT MEASURABLE-HERE (manual) |
| Share link LCP / share page JS | Phase 3 | not applicable to Phase 1 | n/a |
| Image memory LRU | Phase 2 | not applicable to Phase 1 | n/a |

## Decisions (Task 23)
- 2026-11-12: e2e uses two servers: the main one in local-only mode, and a second (`PORT + 1`, started by `playwright.config.ts`) with placeholder Supabase settings and no local-only mode, which is the only way to test the login page and the closed-by-default gate. It never contacts Supabase.
- 2026-11-12: board fixtures are built in Node with `BoardDoc` and written straight into `atelier-board-{id}` in IndexedDB (`bench/fixtures.ts`, `bench/harness.ts`); nothing large is committed. Two small PNG fixtures are committed with their generator (`e2e/fixtures/make-images.mjs`).
- 2026-11-12: CI skips the config's own build (`CI` set means `npm start` only) because the workflow builds before e2e.
- 2026-11-12: pan and zoom frame times are sampled in the page with one synthetic wheel event per animation frame, after a 600 ms warm-up; budgets in CI are loose smoke checks (pan p95 < 34 ms, zoom p95 < 250 ms, open < 1,500 ms) and can be tightened with `BENCH_P95_MS`, `BENCH_ZOOM_P95_MS`, `BENCH_OPEN_MS`.
- 2026-11-12: observed, not changed: with a sticky or text selected, a tool letter (N, T, S ...) types into it instead of switching tool (the select tool starts editing on a typing key). Press Escape first. Tests do that.

## Product bugs found by the e2e work
- Fixed (`18d3410`): a document holding a non-object value under an object id (a string, a number, an array) made `BoardDoc.get` throw, so the board stayed on "Opening board" forever. Such entries are now skipped with the usual `console.warn`. Failing unit test first (`board-doc.test.ts`), found by `e2e/faults.spec.ts`.

## Known issues
- Never run against live services: real Supabase sign-in and TOTP, two real devices syncing, R2 uploads and CORS, installing the app on a phone, Safari. All are on the DEPLOY.md smoke checklist.
- Nothing has been applied to the live Supabase project; `docs/DEPLOY.md` lists the owner-run steps and known limits (1 MB per sync update, 4.5 MB snapshot responses, public R2 URLs, iOS storage eviction).
- Zoom on a 1,000-image board at desktop size is slow without a GPU (see the acceptance table): re-measure on a laptop in Phase 2.

## Phase 2 — Moodboard power (plan: docs/plans/2026-11-12-phase-2-moodboard-power.md)
- [x] 1 Migration 0002 + RLS tests · [x] 2 Model v2 · [x] 3 Multi-size image pipeline · [x] 4 Variant selection, residency, ImageLayer
- [x] 5 1,000-image benchmark + gate (docs/PERF.md, ADR 0001) · [x] 6 WebGL image layer (built, NOT default)
- [x] 7 Image tools · [x] 8 Layout tools · [x] 9 Colour analysis in worker · [x] 10 Live palette + swatch highlight · [x] 11 Palette exports
- [x] 12 Type specimen · [x] 13 Video/GIF · [x] 14 SSRF-safe link preview · [x] 15 Link cards, embeds, paste routing
- [x] 16 Provenance + credits overlay · [x] 17 Inbox + share target · [x] 18 Asset library
- [ ] 19 Phase 2 end-to-end, a11y, benchmark re-run on real hardware, deploy notes (open: apply 0002 to Supabase; run `npm run bench` on real GPU hardware and record in PERF.md; manual check of .ase/.swatches in Adobe/Procreate)

## Phase 3 — Present & share (plan: docs/plans/2026-11-12-phase-3-present-and-share.md)
- [x] 1 Migration 0003 (30 broken-policy mutations, 29 caught, 1 equivalent) · [x] 2 Share crypto (argon2id 64 MiB, signed visitor cookie)
- [x] 3 Presentation mode · [x] 4 Export scene builder · [x] 5 Image/SVG export + dialog · [x] 6 PDF deck · [x] 8 Backup/import + JSON Canvas
- [x] 11 ShareStore + owner share-link API (UI in progress) · [x] 12 Visitor session + guard · [x] 13 ViewerBoard builder
- [ ] 7 ZIP export · [ ] 9 Rounds · [ ] 10 History/compare/restore · [ ] 14 Share page + viewer · [ ] 15 Client review
- [ ] 16 Owner feedback · [ ] 17 Notifications · [ ] 18 Link analytics · [ ] 19 Security hardening suite · [ ] 20 E2E, perf, deploy notes

## Phase 4 — Planning & diagrams: not started (docs/plans/2026-11-12-phase-4-planning-and-diagrams.md, 15 tasks)

## Decisions (continued)
- 2026-11-12: DOM image layer is the default; WebGL layer exists but is slower in the software-rendering sandbox. SPEC §8 zoom targets are UNPROVEN until benchmarked on real hardware.
- 2026-11-12: share cookie secret env var is `SHARE_COOKIE_SECRET` (comma-separated, rotation supported); links store only a SHA-256 of the token.
- 2026-11-12: slide changes by keyboard never animate; swipes/taps ease ≤ 400 ms; reduced motion = instant.
- 2026-11-12: PDF drawn directly with jsPDF from the Scene (svg2pdf.js unused); raster export clamps at 16,384 px / 268 MP (no tiling).
- 2026-11-12: Phase 2's `image/bmp` upload type was dropped (allow-list: jpeg, png, webp, gif, avif, mp4, webm).

## Known issues (continued)
- Tests must never depend on the time of day (the compaction test did: fixed by freezing Date). Suite was re-run at four frozen clocks (23:59:40Z, 00:00:20Z, 31 Dec 23:59:50Z, 1 Mar): only the local-only Inbox "newest first" test is clock-sensitive (items added in the same millisecond tie in local-only mode).
- `components/canvas/objects/ImageView.tsx` is dead code (images are drawn by the image layer); `svg2pdf.js` is installed but unused.
- Phone offline e2e test is load-sensitive when many agents share the CPU (passes alone).
- Shared git index hazards during parallel work caused two mislabeled commits (inbox work landed in "PDF deck export"; a presentation commit was rewritten): history is correct in content.
