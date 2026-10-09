# Stash
Personal app: save Instagram and TikTok videos, watch them in-app, remember and use them.

- Spec (source of truth): docs/SPEC.md
- Android packaging and releases: docs/ANDROID_PLAYBOOK.md. Follow its rules exactly.
- Progress and decisions: docs/PROGRESS.md. Read it at the start of every session. Update it after every task.

## Stack
Next.js (App Router, TypeScript) on Vercel. Supabase: schema `stash`, pgvector, Storage, Auth, Realtime, pg_cron + pg_net. Python worker in /worker (yt-dlp, ffmpeg). TWA shell in android/. Releases through GitHub Releases + Obtainium.

## Rules
- Colours, fonts, radii and spacing come only from tokens in styles/tokens.css. No raw hex in components.
- Optimistic UI first, network second, for every user action.
- Secrets live only in Vercel env, Supabase secrets, the worker's env and .env.local. Never commit or print them.
- AI model IDs come from env vars, never hard-coded.
- Small commits, one feature each. No force pushes. No model names in commits or files.
- A phase is done only when tsc, lint and build pass and every acceptance check is reported as passed or failed.
- If the spec asks for something technically unwise, say so and propose an alternative before building it.

## Commands
All from `stash/`:
- `npm run dev` — local dev server (needs `.env.local`, see `.env.example`)
- `npm test` — unit tests (Vitest)
- `npm run lint` — ESLint
- `npm run typecheck` — tsc
- `npm run build` — production build
- `npm run icons` — regenerate PNG icons from `public/icons/icon.svg`
- Migrations: SQL files in `supabase/migrations/`, applied in order with the Supabase MCP `apply_migration` (or `supabase db push`)
- Worker (Phase 1): see `worker/README.md`

Next.js here is 16.x: read the guide in `node_modules/next/dist/docs/` before using an API (see AGENTS.md). `proxy.ts` replaces `middleware.ts`.
