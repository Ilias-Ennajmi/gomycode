# Atelier

A private, offline-first infinite canvas for moodboards and whiteboards: collect references, compose boards, and (in later
phases) present them and get decisions back. One owner, one Supabase project, files in Cloudflare R2.

Phase 1 (this folder today) is the foundation and the canvas: sign-in with an optional second step, a home with folders,
starred boards, search, starter templates and a trash; an infinite canvas with pan, zoom and a minimap; images, rich text, sticky
notes, shapes, arrows that stay attached, frames, pen, highlighter and eraser; selection, grouping, alignment, undo and redo,
find and replace, a layers panel, an inspector and a command palette; copy, cut, paste and drop from other apps; saving on the
device first and syncing to the server second; light and dark themes; and an installable app that opens offline.

## Run it locally

```sh
cd atelier
npm install
ATELIER_LOCAL_ONLY=1 npm run dev        # http://localhost:3000
```

`ATELIER_LOCAL_ONLY=1` is for development and tests only: there is no sign-in and no sync, and boards live in this browser's
IndexedDB. The server refuses the flag when `VERCEL_ENV=production`. To run with accounts, copy `.env.example` to `.env.local`
and fill in the Supabase and R2 values (see `docs/DEPLOY.md`).

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm run typecheck` | TypeScript, no emit |
| `npm run lint` | ESLint |
| `npm test` | Unit tests (Vitest; `*.test.ts` in Node, `*.test.tsx` in jsdom) |
| `npm run e2e` | Playwright on a desktop and a phone screen; builds the app and starts it in local-only mode, plus a second server with sign-in on for the login checks |
| `bash scripts/test-rls.sh` | Row-level-security tests against a real Postgres (`DATABASE_URL=postgresql://user:pass@host:5432/db`) |

Browsers for Playwright: `npx playwright install --with-deps chromium`. In sandboxes with a pre-installed Chromium at
`/opt/pw-browsers/chromium` the config uses it (override with `PW_CHROMIUM_PATH`). Run one server on a free port with
`PORT=3198 npm run e2e`.

### Performance bench

`bench/` holds a reusable harness (`bench/harness.ts`: seed a board into IndexedDB, read the `atelier:board-ready` mark, sample
frame times while panning and zooming) and seeded board builders (`bench/fixtures.ts`: 500 mixed objects, 1,000 image
placeholders, a board with deliberately invalid objects). `e2e/perf.spec.ts` uses them and writes the numbers it measured to
`test-results/bench/<project>-<name>.json`. Its limits are smoke thresholds; real budgets (SPEC section 8) are judged on real hardware.

## Structure

```
app/            Next.js routes: home, /b/[boardId], /login, /settings, /api/*
components/     chrome/ (top bar, toolbar, menus), canvas/, panels/, home/, editor/
lib/engine/     the canvas engine: model, doc (Yjs), geometry, input, commands, clipboard, spatial index, layout
lib/sync/       IndexedDB persistence, sync client, board list cache
lib/assets/     image pipeline (worker), upload queue, resolver
lib/server/     owner guard, updates and compaction, R2 presign, MFA check
supabase/       migrations/ and tests/ (SQL)
e2e/            Playwright specs; e2e/fixtures/ small image fixtures and their generator
bench/          performance harness and board fixtures
tests/unit/     Vitest
docs/           SPEC, PROGRESS, DEPLOY, plans/
```

## Documents

- `docs/SPEC.md`: the specification (source of truth).
- `docs/plans/`: the implementation plan for each phase.
- `docs/PROGRESS.md`: what is done, decisions, and the Phase 1 acceptance table.
- `docs/DEPLOY.md`: owner-run deployment steps, smoke checklist and known limits.
- `CLAUDE.md` and `AGENTS.md`: working rules for coding agents.
