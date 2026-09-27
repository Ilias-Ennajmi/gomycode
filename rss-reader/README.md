# Reader

A personal, Feedly/Readwise-style reader for one user: RSS sites, YouTube channels,
newsletters and a News front page, with AI summaries and a daily briefing on
Google Gemini's free tier.

- **Live:** https://rss-reader-jet.vercel.app (password-protected)
- **Code:** `rss-reader/` in [Ilias-Ennajmi/gomycode](https://github.com/Ilias-Ennajmi/gomycode).
  The rest of the repo (`mallathon/`, `nbrc-gala/`, notebooks) is unrelated.
- **Coding agents:** read [`AGENTS.md`](./AGENTS.md) before changing anything.

## What it does

| Area     | What's there                                                                                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tabs     | For You (ranked by reading history) · News · RSS · YouTube · Newsletters · Later                                                                                   |
| News     | Hero slider of the biggest stories, desks (Maroc, Monde, Europe, Afrique, Économie, Sport, Tech), AI "What's happening", Morocco in the world press, local weather |
| Today    | A daily briefing page: top stories with bullets and "why it matters", per-interest picks, more on demand                                                           |
| Discover | Curated catalog (~230 sources) scoped by channel, live search (Feedly + YouTube), AI suggestions, follow a topic (Bing News search feed)                           |
| Reader   | Full-article extraction, clutter removal, reading settings, up next / previous, swipe between articles, listen (browser text-to-speech)                            |
| Lists    | Swipe right for Later, left to mark read, Undo toasts, unread counts per tab, story grouping ("also covered by")                                                   |
| Sources  | Manager for every followed source: rename, move, unfollow, health                                                                                                  |

## Stack

Next.js 14 (App Router) · TypeScript (strict) · Tailwind + shadcn/Radix · SWR ·
Prisma 5 on Postgres (Supabase) · Gemini API (optional) · Vercel hosting.

## Run it locally

Requirements: Node 20+ (22 recommended) and a Postgres database (local, Docker, or Supabase).

```bash
cd rss-reader
npm install                 # also runs prisma generate
cp .env.example .env.local  # then fill it in (see below)
cp .env.local .env          # Prisma CLI reads .env
npx prisma migrate deploy   # create the tables
npm run dev                 # http://localhost:3000, log in with APP_PASSWORD
```

Quick local Postgres with Docker:

```bash
docker run -d --name rss-pg -p 5432:5432 -e POSTGRES_USER=rss -e POSTGRES_PASSWORD=rss \
  -e POSTGRES_DB=rss_reader postgres:16
```

### Environment variables

| Name                  | Needed      | Where to get it                                                                                                                                                                    |
| --------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`        | yes         | Local: `postgresql://rss:rss@localhost:5432/rss_reader`. Production: Supabase → Connect → Prisma, the **transaction pooler** (port 6543) with `?pgbouncer=true&connection_limit=1` |
| `DIRECT_URL`          | yes         | Local: same as above. Production: Supabase **session pooler** (port 5432), used by migrations                                                                                      |
| `APP_PASSWORD`        | yes         | The login password. Any value locally                                                                                                                                              |
| `AUTH_SECRET`         | recommended | Any long random string (signs the session cookie)                                                                                                                                  |
| `CRON_SECRET`         | optional    | Any random string; protects `/api/refresh` for cron calls                                                                                                                          |
| `GEMINI_API_KEY`      | optional    | Free key from https://aistudio.google.com/apikey. Without it AI features switch off                                                                                                |
| `APP_TIMEZONE`        | optional    | Default `Europe/Paris`; when a new daily briefing starts                                                                                                                           |
| `NEXT_PUBLIC_APP_URL` | optional    | `http://localhost:3000` locally                                                                                                                                                    |

**Never commit real values.** `.env`, `.env.local` are gitignored. In Vercel all
variables are stored as _sensitive_, so they can't be pulled with `vercel env pull`;
use local values for development, and a separate Gemini key if you like.

## Deploy

Vercel project `rss-reader` (root directory `rss-reader`, region `cdg1`). The build
command is `npm run vercel-build` = `prisma migrate deploy && next build`, so new
migrations are applied on every deploy. `vercel.json` has a daily cron hitting
`/api/refresh`; the app also refreshes stale feeds when opened.

- Pushes to `main` deploy to production once the PR is merged; pushes to other
  branches create preview deployments.
- Other Vercel projects (culture-connected, planet-sport-studio, gala-nbrc,
  mallathon-2026) build from the same repo; their failures don't concern this app.

## Scripts

`npm run dev` · `npm run build` · `npm run lint` · `npx tsc --noEmit` ·
`npm run db:migrate` (create a migration in development) · `npm run db:seed`
