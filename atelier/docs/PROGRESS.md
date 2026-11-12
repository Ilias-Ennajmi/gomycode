# Atelier — progress and decisions

Read this at the start of every session. Updated after every task.

## Current phase: 1 · Foundation and canvas core

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
- [ ] Task 12: Creation tools — sticky, text, shape, frame, arrow, pen, highlighter, eraser
- [ ] Task 13: Rich text editing
- [ ] Task 14: Commands, shortcuts and arrangement
- [x] Task 15: Clipboard serialisation and parsing (pure)
- [ ] Task 16: Clipboard and drag-drop wiring
- [x] Task 17: Image assets — worker pipeline, upload queue, resolver
- [x] Task 18: Local persistence and server sync
- [ ] Task 19: Editor chrome — top bar, toolbar, context bar, menus, zoom, minimap
- [ ] Task 20: Layers, Inspector, command palette, find & replace
- [x] Task 21: Home — boards, folders, templates
- [x] Task 22: PWA, offline shell, theme and settings
- [ ] Task 23: End-to-end tests, performance smoke, accessibility, deployment

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

## Verified (2026-11-12, lead's own run after Tasks 1–11, 15, 17, 18, 21, 22)
typecheck clean · lint clean · 771 unit tests passing (42 files) · production build OK (15 routes) · RLS SQL tests passing on Postgres 16.

## Known issues
- Not yet run: the full Playwright e2e suite (Task 23), real TOTP enrol/verify against live Supabase, R2 CORS (deploy step), nothing has been applied to the live Supabase project.
