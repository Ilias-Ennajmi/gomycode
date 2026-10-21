# Reader

A personal, Feedly/Readwise-style reader for one user: RSS sites, YouTube channels,
newsletters and a News front page, with AI summaries and a daily briefing on
Google Gemini's free tier.

- **Live:** https://rss-reader-jet.vercel.app (password-protected)
- **Code:** `rss-reader/` in [Ilias-Ennajmi/gomycode](https://github.com/Ilias-Ennajmi/gomycode).
  The rest of the repo (`mallathon/`, `nbrc-gala/`, notebooks) is unrelated.
- **Coding agents:** read [`AGENTS.md`](./AGENTS.md) before changing anything.

## What it does

| Area        | What's there                                                                                                                                                                                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tabs        | For You (ranked by reading history) · News · RSS · YouTube · Newsletters · Podcasts · Later; at the bottom of the screen on phones                                                                                                                            |
| Stories     | A row of that tab's sources with something new (collapsible); tap one to flip through its latest full screen, Instagram-style, and read or save from there                                                                                                    |
| Views       | Per-tab layout switch in the chip row: compact list, magazine, big pictures, or a grid of square tiles (podcasts default)                                                                                                                                     |
| Personalise | Settings: stories row, goal ring, briefing card, compact density and haptics switches; reorder or hide the top tabs; pin categories as tabs; start page, accent, goal, language                                                                               |
| Player      | A full-screen podcast player with chapter-aware scrubber and Skip ahead, then folding cards: read along, chapters, key moments, snips, show notes, the show, up next, more from the show, similar episodes, discussion; video pages share the cards           |
| Triage      | ⋯ → Triage unread: one card at a time, swipe right to keep for Later, left to skip (marked read), Undo; "Got 5 minutes?" on For You builds a pile that fits 5–30 minutes                                                                                      |
| Sponsors    | Sponsor reads skipped as they come, with Undo: SponsorBlock segments on YouTube, ad-named chapters and "brought to you by…" transcript stretches on episodes; shown in amber on the scrubber                                                                  |
| Snips       | Tap the scissors (or press "previous" twice on earbuds) while an episode plays to keep the last half-minute as a note with a title, replayable from Highlights; episode notes with transcript search; search episodes across your shows and Apple's catalogue |
| Collections | Named sets of saved articles, each publishable as a read-only page; Later → ⋯ → EPUB of the queue for an e-reader                                                                                                                                             |
| Discussion  | The Hacker News and Reddit threads about an article, at its end; pin any search to the sidebar as a smart folder                                                                                                                                              |
| Shorts      | A full-screen portrait player for YouTube Shorts: swipe up for the next, save and share from the side                                                                                                                                                         |
| Listen      | Listen to Later reads your queue aloud as a playlist with player controls; the reader's Listen button and Listen to Today share the voice                                                                                                                     |
| Comfort     | Pages mode (⋯ → Pages), bionic reading, an easy-to-read font, larger tap targets, dark after sunset; starter packs to follow a topic's best sources in one tap; settings synced between devices                                                               |
| Look        | Magazine layout (big picture cards with serif headlines leading each day), a cover story on Today, a daily reading-goal ring with a streak, seven accent colours, paper/dark/light themes                                                                     |
| News        | Hero slider of the biggest stories, desks (Maroc, Monde, Europe, Afrique, Économie, Sport, Tech), AI "What's happening", Morocco in the world press, local weather                                                                                            |
| Today       | The home page: briefing blocks (top stories, numbers, interests, videos, newsletters), continue where you left off, review, highlights, sources to tidy; hide or reorder any block; "Start on"                                                                |
| Stats       | Your reading over 30 days: articles, time, highlights, streak, by day and hour, top sources                                                                                                                                                                   |
| Discover    | Curated catalog (~230 sources) scoped by channel, live search (Feedly + YouTube), AI suggestions, follow a topic (Bing News search feed); a preview pop-up before following, also from episode search and starter packs                                       |
| Reader      | Full-article extraction, clutter removal, reading settings, up next / previous, swipe between articles, listen (browser text-to-speech)                                                                                                                       |
| Phone UX    | Two thin bars that slide away while scrolling, filters as one row of chips, one options menu, long-press quick look on cards, a pop-up for any source (open, mute, unfollow), a line for what's new since your last visit                                     |
| Lists       | Rows with the picture on the left; swipe sideways for the next tab (or, in Settings, for Later / mark read), Undo toasts, unread counts per tab, story grouping ("also covered by")                                                                           |
| Sources     | A page for every source with its settings (For You, full page, mute, alerts); manager to rename, move, unfollow, health, "Never read" in two months                                                                                                           |
| Highlights  | Select text to highlight in 4 colours and add notes; all highlights in Later → Highlights, Markdown export, old ones resurface on Today                                                                                                                       |
| Search      | Full-text search over titles, text and your highlights, with where-to-look and time filters; operators `from:`, `tag:`, `is:unread`, `in:youtube`; recents and suggestions; ⌘K palette                                                                        |
| Newsletters | "Substack & web" and "Email" sub-tabs; email-only newsletters get their own sign-up address (Kill the Newsletter)                                                                                                                                             |
| YouTube     | Videos / Shorts / length filters, lengths and watch progress on cards, resume, remembered speed, chapters, AI summary + key moments + searchable transcript, mini player, up next, channel pages                                                              |
| Podcasts    | Continue listening shelf, Apple Podcasts search and charts, one player for the whole app (now-playing bar, lock-screen controls, speed, sleep timer, resume), chapters, AI summary + transcript                                                               |
| Alerts      | Notifications when new articles mention a word or come from a source; matches listed in Alerts; rules that save matches to Later                                                                                                                              |
| Review      | Daily review of highlights with spaced repetition and a streak; tags on highlights (with AI tag ideas), export by tag                                                                                                                                         |
| Ask         | "Ask your reader": questions answered from your own feeds, with the articles behind each answer; "Catch me up" bullets over any list's unread, then mark them read                                                                                            |
| Smart       | Why For You picked a story, select text to Explain / Define / Translate, translate whole articles, "How this story unfolded" timelines, near-duplicate articles folded away                                                                                   |
| Later       | Reading queue with total reading time, snooze (back at a chosen time with a notification), archive, weekly recap                                                                                                                                              |
| Offline     | Opens instantly from the last visit, lists and Later articles cached, "Save offline" per article, changes made offline sent when back online                                                                                                                  |
| Settings    | Start page, English / French interface, theme, "Under the hood" (build, database, last refresh, errors), one-file backup of everything that's yours                                                                                                           |
| Android app | Installable app (`android/`): share links to Later, icon shortcuts (Search, News, Later, Podcasts, Review, Highlights, Add), back gesture, deep links                                                                                                         |

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

| Name                                                     | Needed      | Where to get it                                                                                                                                                                    |
| -------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                           | yes         | Local: `postgresql://rss:rss@localhost:5432/rss_reader`. Production: Supabase → Connect → Prisma, the **transaction pooler** (port 6543) with `?pgbouncer=true&connection_limit=1` |
| `DIRECT_URL`                                             | yes         | Local: same as above. Production: Supabase **session pooler** (port 5432), used by migrations                                                                                      |
| `APP_PASSWORD`                                           | yes         | The login password. Any value locally                                                                                                                                              |
| `AUTH_SECRET`                                            | recommended | Any long random string (signs the session cookie)                                                                                                                                  |
| `CRON_SECRET`                                            | optional    | Any random string; protects `/api/refresh` for cron calls                                                                                                                          |
| `GEMINI_API_KEY`                                         | optional    | Free key from https://aistudio.google.com/apikey. Without it AI features switch off                                                                                                |
| `APP_TIMEZONE`                                           | optional    | Default `Europe/Paris`; when a new daily briefing starts                                                                                                                           |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | optional    | Web Push keys for notifications; generate with `web-push` (see `.env.example`). Without them notifications are off                                                                 |
| `NEXT_PUBLIC_APP_URL`                                    | optional    | `http://localhost:3000` locally                                                                                                                                                    |

**Never commit real values.** `.env`, `.env.local` are gitignored. In Vercel all
variables are stored as _sensitive_, so they can't be pulled with `vercel env pull`;
use local values for development, and a separate Gemini key if you like.

## Deploy

Vercel project `rss-reader` (root directory `rss-reader`, region `cdg1`). The build
command is `npm run vercel-build` = `prisma migrate deploy && next build`, so new
migrations are applied on every deploy. `vercel.json` has a daily cron hitting
`/api/refresh`, Supabase pg_cron pings `/api/refresh/tick` every hour, and the app also
refreshes stale feeds when opened.

- Pushes to `main` deploy to production once the PR is merged; pushes to other
  branches create preview deployments.
- Other Vercel projects (culture-connected, planet-sport-studio, gala-nbrc,
  mallathon-2026) build from the same repo; their failures don't concern this app.

## Scripts

`npm run dev` · `npm run build` · `npm run lint` · `npx tsc --noEmit` ·
`npm run db:migrate` (create a migration in development) · `npm run db:seed`
