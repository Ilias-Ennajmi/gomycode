# Atelier — progress and decisions

Read this at the start of every session. Updated after every task.

## Current phase: 1 · Foundation and canvas core

Plan: `docs/plans/2026-11-12-phase-1-foundation-canvas.md`. Spec: `docs/SPEC.md`.

## Phase 1 tasks
- [x] Task 1: App scaffold, tokens, tooling and CI
- [ ] Task 2: Database schema, RLS and SQL tests
- [ ] Task 3: Supabase clients, owner guard, login and local-only mode
- [ ] Task 4: Two-step verification (TOTP)
- [ ] Task 5: Object model, defaults, validation and z-order keys
- [ ] Task 6: BoardDoc — Yjs wrapper, transactions, undo, change events
- [ ] Task 7: Geometry and camera maths
- [ ] Task 8: Spatial index and culling
- [ ] Task 9: Canvas view and object rendering
- [ ] Task 10: Input pipeline, gestures and camera control
- [ ] Task 11: Select tool — hit, marquee, move, resize, rotate, snap
- [ ] Task 12: Creation tools — sticky, text, shape, frame, arrow, pen, highlighter, eraser
- [ ] Task 13: Rich text editing
- [ ] Task 14: Commands, shortcuts and arrangement
- [ ] Task 15: Clipboard serialisation and parsing (pure)
- [ ] Task 16: Clipboard and drag-drop wiring
- [ ] Task 17: Image assets — worker pipeline, upload queue, resolver
- [ ] Task 18: Local persistence and server sync
- [ ] Task 19: Editor chrome — top bar, toolbar, context bar, menus, zoom, minimap
- [ ] Task 20: Layers, Inspector, command palette, find & replace
- [ ] Task 21: Home — boards, folders, templates
- [ ] Task 22: PWA, offline shell, theme and settings
- [ ] Task 23: End-to-end tests, performance smoke, accessibility, deployment

## Decisions
- 2026-11-12 Task 1: Inter is self-hosted through `@fontsource-variable/inter` (OFL) instead of `next/font/google`, so builds never need to reach Google Fonts.
- 2026-11-12 Task 1: all runtime dependencies the whole of Phase 1 needs are installed in Task 1, so later tasks do not touch `package.json`.
- 2026-11-12 Task 1: Vitest runs two projects: `node` for `tests/unit/**/*.test.ts` and `jsdom` for `*.test.tsx` (a `.ts` test can opt in with `// @vitest-environment jsdom`). `fake-indexeddb/auto` is loaded in both.
- 2026-11-12 Task 1: Playwright uses the pre-installed Chromium at `/opt/pw-browsers/chromium` when it exists (override with `PW_CHROMIUM_PATH`); CI installs its own. Run with `--trace off`.
- 2026-11-12 Task 1: `images.unoptimized` is on; canvas images come from R2 already resized.

## Known issues
- `next@16.3.8` is flagged by `npm audit` (advisories fixed in 16.4.x: image optimiser with SVG, Server Actions DoS, `use cache` typed arrays). The version is pinned to match Stash; the image optimiser is off and `use cache` is not used. Revisit when Stash moves.
