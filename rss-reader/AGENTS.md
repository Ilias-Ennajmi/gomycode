# Guide for coding agents

Read this file and `README.md` before making changes. The app lives in `rss-reader/`
inside the `Ilias-Ennajmi/gomycode` repo. Run every command from `rss-reader/`.
Don't touch the other folders (`mallathon/`, `nbrc-gala/`, notebooks): they are
separate projects with their own Vercel deployments.

## Ground rules

1. **Secrets never go in git.** No passwords, API keys, or database URLs in code,
   docs, commits, or logs. Real values live only in `.env.local` / `.env` (gitignored)
   and in Vercel's environment settings. Before each commit, check
   `git diff --cached` for anything that looks like a key or password.
2. **Keep it working at every commit:** `npx tsc --noEmit` and `npm run lint` must pass,
   and `npm run build` for larger changes.
3. **Database changes go through Prisma migrations** (`npx prisma migrate dev --name <what>`),
   never manual SQL on production. Migrations must be additive/safe: production
   applies them automatically on deploy (`prisma migrate deploy`).
4. **Test phones and desktop.** It's used mostly on a phone. Check 360–390px wide
   (no sideways page scroll) and 1440px wide, dark and light themes.
5. **Small, descriptive commits.** Don't force-push, and don't rewrite history.
6. Format only the files you touch: `npx prettier --print-width 100 --trailing-comma es5 --write <files>`.
7. Match the surrounding code: its comment density, naming and idioms. Comments explain _why_.

## Architecture

```
app/
  reader/page.tsx        the single-page app shell (AppShell)
  login/                 password gate page
  api/                   route handlers (all JSON, all behind the password middleware)
    articles/            list (filters, paging), [id] update, [id]/full (extract), [id]/summary
    feeds/, categories/, filters/, later/, opml/
    discover/            catalog, search, suggest (AI), explore (live paging), follow, health
    news/                front page (hero + desks), insights (AI, cached hourly), prefs
    digest/              daily briefing v2 (GET current, POST more/shuffle/refresh)
    refresh/             fetch all stale feeds (cron: Bearer CRON_SECRET)
    weather/             Open-Meteo forecast, location from Vercel IP headers or saved city
    ai/                  AI status
middleware.ts            password gate (session cookie signed with APP_PASSWORD + AUTH_SECRET)
components/
  layout/                AppShell (panes, dialogs), TopBar (tabs, unread counts, "+" menu), SettingsPanel
  articles/              ArticleList, ArticleCard (swipe), ArticleReader (next/prev, listen), DailyBriefing banner
  news/                  NewsView, HeroSlider, StoryParts, WeatherWidget, NewsSourcesDialog
  today/TodayView.tsx    the briefing page
  discover/, sources/, sidebar/, dialogs/, ui/ (shadcn)
lib/
  prisma.ts              Prisma client singleton
  rss.ts                 fetch + parse feeds (rss-parser on XML fetched with fetch)
  ingest.ts              store new articles (the refresh route then runs the AI pipeline)
  enrich.ts              Gemini embeddings, story grouping (Topic), summaries, promo detection
  ai.ts                  Gemini client: generateText (JSON mode), embeddings, isAiEnabled, AiError
  digest.ts              briefing generation (ranked stories, batched summaries, cached per day)
  ranking.ts             For You ranking from reading history
  articles.ts            article query building (tabs, news desks, filters)
  follow.ts              follow a source (site, feed, YouTube handle, topic) with readable errors
  youtube.ts, extract.ts, reader.ts, clean-html.ts, favicon.ts, opml.ts, filters.ts
  discover/              catalog (curated sources), search providers (Feedly, YouTube), topics (Bing News RSS)
  news/                  news catalog, desks (+ MOROCCO_PATTERN), front-page builder, prefs
  hooks/                 SWR hooks (useArticles, useFeeds, useNews, useAi, useDiscover...) and useReaderState
prisma/schema.prisma     Category, Feed, Article, Topic, DailyDigest, FilterRule, Setting
android/                 the Android app: a Trusted Web Activity around the site (see android/README.md)
```

**Android app.** `android/` is a thin shell that opens the site in Chrome full-screen, so
web deploys update the app; a new APK is only needed when the shell changes. Releases
(details in `android/README.md`): CI (`.github/workflows/android.yml`, repo root) builds an
unsigned APK on branch pushes and publishes it as the `android-unsigned` prerelease;
`android/sign.sh` signs it offline with the release key into `android/releases/`; pushing
the tag `android-v<version>` checks and publishes that signed APK, then tests it on an
emulator (screenshots and `summary.txt` in the `android-e2e` prerelease). The signing key
is never committed or given to CI. Bump `appVersionCode`/`appVersionName` in
`android/app/build.gradle` for every release. The web side:

- `public/.well-known/assetlinks.json` must stay public (excluded in `middleware.ts`) and
  keep the signing key's SHA-256, or the app shows a browser bar.
- `/share` saves links shared from other apps; `?view=`, `?article=` and `?add=1` open parts
  of the app (shortcuts, deep links).
- `lib/hooks/useHistorySync.ts` mirrors navigation into browser history so Android's back
  gesture closes the article, pane or dialog. Use `useBackToClose` for new dialogs.
- Always spread `window.history.state` when writing history entries: Next.js reloads the
  page when going back to an entry without its `__NA` field.

**Offline.** `public/sw.js` (registered by `components/layout/OfflineSupport.tsx`, production
builds only) caches the app shell and Next assets, serves lists/articles network-first with a
cached fallback, keeps images stale-while-revalidate, and pre-caches everything in Later on
the "cache-later" message. Uncached pages fall back to the static `public/offline.html`
(it can't be a Next page: its scripts wouldn't be cached). Bump `VERSION` in `sw.js` when
its rules change. Pull-to-refresh lives in `lib/hooks/usePullToRefresh.tsx`.

**Notifications.** Web Push with VAPID keys (`VAPID_*` env vars): devices subscribe from
`components/layout/NotificationSettings.tsx` (Settings, and the bell in the desktop
sidebar) through `/api/push`; `lib/push.ts` sends and drops expired subscriptions.
`/api/refresh` calls `sendScheduledPushes`: the morning briefing from the daily cron (GET),
and a breaking-news alert when a story reaches 4+ News outlets within 6 hours (any
refresh). Sent articles are remembered in the `push-sent` Setting, because story groups
get new ids on every refresh. `public/sw.js` shows them and opens the app on tap; in the
Android app they appear as the app's own notifications.

**Data model in one paragraph.** A `Feed` has a `type` (rss, youtube, newsletter) and, when
it's a news outlet, a `newsDesk` (morocco, world, europe, africa, economy, sports, tech) and
`region` ("ma"). News feeds show only in the News tab, not in RSS. `Article` holds reading
state (isRead, isSaved, archivedAt, readProgress), AI data (embedding, aiSummary, isPromo) and
an optional `topicId` that groups articles about the same story. `DailyDigest` stores the
briefing as JSON (`version: 2`). `Setting` is a key/value store (news prefs, cached news
insights, weather city).

**State on the client.** `useReaderState` holds the current view (`type`: foryou, briefing,
news, rss, youtube, newsletters, later, all, today, saved, feed, category), the selected article and
the mobile pane (sidebar, list, reader, settings). Data comes from SWR hooks in `lib/hooks`.

## Gotchas learned the hard way

- **Feed fields can be arrays.** xml2js returns `image`, `language`, etc. as arrays for many
  feeds (Substack, WordPress). Always normalise with `firstText()` in `lib/rss.ts` before saving.
- **Mobile grid blowout.** A CSS grid without a column template sizes to its widest child,
  so one horizontal strip makes the page scroll sideways. Use `grid-cols-1` (not a bare
  `grid`) plus `min-w-0` on grid/flex children.
- **Article HTML is unpredictable.** Clutter and trackers are stripped in `lib/clean-html.ts`, and
  `.reader-content` rules in `app/globals.css` keep images/iframes/tables inside the column.
- **Gemini free tier is rate-limited.** Batch calls (JSON mode), cache results (insights
  hourly, briefing per day, refresh at most every 3h), and keep every AI feature optional:
  the app must work when `GEMINI_API_KEY` is empty or the quota is spent (`AiError`).
- **Vercel Hobby cron runs once a day.** Freshness comes from refresh-on-open plus the
  daily cron. An hourly external ping to `/api/refresh` with `Authorization: Bearer
$CRON_SECRET` is the way to go further.
- **Bing News topic feeds** need `setlang` and `mkt` (e.g. `fr-FR`) or results come back in
  other languages; article links are wrapped and unwrapped via the `url` param.
- **lucide-react has no YouTube icon** in this version; the code uses `Play`.
- The repo-root `.gitignore` ignores `lib/` (Python template); `rss-reader/.gitignore`
  re-includes it. Don't remove that line.
- Toasts with Undo must stay clickable over Radix dialogs (see `components/ui/sonner.tsx`).
- **NULL-safe filters.** `NOT (summary ILIKE …)` is NULL when summary is NULL, which hides the
  row. Guard nullable columns (`summary: { not: null }`) inside any `NOT` clause.
- The production minifier breaks at least one highlight.js grammar; `ArticleContent` drops
  grammars that fail to compile. Playwright's `setOffline` doesn't affect the service worker's
  own requests: test offline mode by stopping the server instead.

## Testing

- Types and lint: `npx tsc --noEmit && npm run lint`.
- Run locally against a local Postgres (see README), then check in a browser at phone
  and desktop sizes. Playwright works well for scripted checks (log in at `/login`).
- For anything that reads external feeds, test against the real feed once; many sites
  block default user agents or send odd XML.
- After a deploy, check the Vercel deployment is READY and the runtime logs have no new errors.

## History

Built in this order (see `git log -- rss-reader`):

1. Postgres + password gate, YouTube channels, content filters, PWA, mobile tab bar.
2. AI layer on Gemini (summaries, story grouping, briefing), For You ranking.
3. Readwise-style redesign with top tabs and Read Later; full-article reader.
4. Discover (catalog, search, AI suggestions, languages), category chips.
5. Fix for "can't add most sources" (array feed fields), Discover per channel, topic
   follows, Undo, sources manager.
6. News tab (hero, desks, insights, weather, curated FR/EN sources), Today briefing page.
7. UX polish: mobile layout fits the screen, reader up next/listen/swipe, list swipe
   actions, one "+" menu, unread counts.

## Open ideas (not built yet)

- Skeleton loaders everywhere spinners remain.
- Card layout option (big images) for News and YouTube lists; "mark read when scrolled past".
- Email-only newsletters through an inbound email service (e.g. Postmark inbound webhook).
- An hourly refresh (GitHub Actions schedule, which only runs from the default branch) so
  breaking-news alerts arrive promptly; today they fire when a refresh happens.
