# Atelier
Private, offline-first infinite-canvas moodboard and whiteboard for one creative director: collect references, compose boards, present, get decisions back.

- Spec (source of truth): docs/SPEC.md
- Phase 1 plan: docs/plans/2026-11-12-phase-1-foundation-canvas.md
- Progress and decisions: docs/PROGRESS.md. Read it at the start of every session. Update it after every task.

## Stack
Next.js 16 (App Router, TypeScript, Tailwind 4) on Vercel. Supabase: existing project, schema `atelier`, RLS on every table, owner-only auth. Cloudflare R2 for images (presigned PUT). A framework-light canvas engine in `lib/engine/` over a Yjs document per board, persisted to IndexedDB first and synced to Supabase second. Tiptap for rich text.

## Rules
- Colours, fonts, radii, spacing, elevation, z-index and motion come only from tokens in styles/tokens.css. No raw hex in components.
- Local-first: every edit is written to the Yjs doc (and IndexedDB) before any network call. Optimistic UI first, network second.
- Selection and focus accent is the brand ink-blue; the canvas is never pure white or pure black.
- Every new dependency must be MIT, Apache-2.0, ISC, BSD or OFL. Check the licence before adding it.
- Owner-only: Supabase `auth.uid() = owner_id` and the server-side `ATELIER_OWNER_ID` check. `ATELIER_LOCAL_ONLY=1` (no auth, no sync, for dev and e2e) must be refused when `VERCEL_ENV=production`.
- Secrets live only in Vercel env and `.env.local` (see `.env.example`). Never commit or print them.
- Small commits, one feature each. No force pushes. No AI model names in code, commits or files.
- A task is done only when `npm run typecheck`, `npm run lint`, `npm test` (and `npm run build` for tasks touching `app/`) pass. Then update docs/PROGRESS.md.
- If the spec asks for something technically unwise, say so and propose an alternative before building it.

## Commands
All from `atelier/`:
- `npm run dev` — local dev server (use `ATELIER_LOCAL_ONLY=1` to skip login and sync)
- `npm test` — unit tests (Vitest; `*.test.ts` in node, `*.test.tsx` in jsdom)
- `npm run lint` — ESLint
- `npm run typecheck` — tsc
- `npm run build` — production build
- `npm run e2e` — Playwright (desktop and phone projects, builds and starts the app with local-only mode)
- Migrations: SQL files in `supabase/migrations/`, applied in order

Next.js here is 16.x: read the guide in `node_modules/next/dist/docs/` before using an API (see AGENTS.md). `proxy.ts` replaces `middleware.ts`.
