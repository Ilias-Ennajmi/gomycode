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
    articles/            list (filters, search, paging), [id] update (incl. snooze), [id]/full (extract), [id]/summary
    highlights/          list/create, [id] note/colour/delete, export (Markdown), resurface
    newsletters/email    create an email-only newsletter (Kill the Newsletter address + feed)
    recap/               the weekly recap (stats, stories, highlights, AI summary)
    feeds/, categories/, filters/, later/, opml/
    discover/            catalog, search, suggest (AI), explore (live paging), follow, health
    news/                front page (hero + desks), insights (AI, cached hourly), prefs
    digest/              daily briefing v2 (GET current, POST more/shuffle/refresh)
    refresh/             fetch all stale feeds (cron: Bearer CRON_SECRET); refresh/tick is the public hourly ping
    weather/             Open-Meteo forecast, location from Vercel IP headers or saved city
    ai/                  AI status
middleware.ts            password gate (session cookie signed with APP_PASSWORD + AUTH_SECRET)
components/
  layout/                AppShell (panes, dialogs), TopBar (tabs, unread counts, "+" menu), SettingsPanel
  articles/              ArticleList, ArticleCard (swipe, list/cards layout), ArticleReader (next/prev, listen, resume), SnoozeMenu
  highlights/            ReaderHighlights (selection toolbar + panel), HighlightsList (Later → Highlights), resurfacing
  news/                  NewsView, HeroSlider, StoryParts, WeatherWidget, NewsSourcesDialog
  today/                 TodayView (the briefing page), RecapView (weekly recap)
  dialogs/               CommandPalette (⌘K), EmailNewsletterDialog, SaveLink, shortcuts...
  discover/, sources/, sidebar/, ui/ (shadcn)
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
  search.ts              full-text search (tsvector column + highlights), prefix queries, ranking
  highlights.ts, highlight-dom.ts   highlight colours/export, and anchoring/drawing marks in the reader
  newsletters.ts         platform detection, Kill the Newsletter inboxes, unsubscribe links, paywall previews
  refresh.ts             refreshFeeds() shared by /api/refresh and /api/refresh/tick
  recap.ts, snooze.ts, saved-links.ts, db.ts (sqlName for raw SQL)
  youtube.ts, extract.ts, reader.ts, clean-html.ts, favicon.ts, opml.ts, filters.ts
  discover/              catalog (curated sources), search providers (Feedly, YouTube), topics (Bing News RSS)
  news/                  news catalog, desks (+ MOROCCO_PATTERN), front-page builder, prefs
  hooks/                 SWR hooks (useArticles, useFeeds, useNews, useAi, useDiscover...) and useReaderState
prisma/schema.prisma     Category, Feed, Article, Highlight, Topic, DailyDigest, FilterRule, Setting
android/                 the Android app: a Trusted Web Activity around the site (see android/README.md)
```

**Android app.** `android/` is a thin shell that opens the site in Chrome full-screen, so
web deploys update the app; a new APK is only needed when the shell changes. Releases
(details in `android/README.md`): CI (`.github/workflows/android.yml`, repo root) builds an
unsigned APK on branch pushes and publishes it as the `android-unsigned` prerelease;
`android/sign.sh` signs it offline with the release key into `android/releases/`; the next
push checks that signed APK, publishes it as the release `android-v<version>` (once per
version) and tests it on an emulator (screenshots and `summary.txt` in the `android-e2e` prerelease). The signing key
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

**Reader 2.0 features.**

- _Highlights_: `Highlight` rows anchor to text W3C-style (the quote plus 64 characters
  before and after), found again with whitespace-normalised matching and drawn as
  `<mark data-hl>`. `ArticleContent` memoises its `__html` object: a new object each
  render makes React reset innerHTML and wipes the marks.
- _Search_: `Article.search` is a `tsvector` kept by the trigger `Article_search_update`
  (migration `v2_library`; `reader_fold()` strips accents). Prisma sees it as
  `Unsupported`, and search runs as raw SQL in `lib/search.ts`, which also matches
  highlight text and notes.
- _Newsletters_ split into "Substack & web" and "Email" (`Feed.platform`). Email-only ones
  get an address from Kill the Newsletter (`POST /feeds` needs the `CSRF-Protection: true`
  header); its Atom feed is then followed like any other.
- _Snooze_: `Article.snoozedUntil` hides an article from lists until
  `wakeSnoozedArticles()` (every refresh) brings it back to the top of Later with a push.
- _Weekly recap_: rolling 7 days; each day's lead story comes from `DailyDigest`
  (topics are rebuilt every refresh). The AI summary is cached per week in `Setting`, and a
  Sunday-evening push goes out once per week.
- _Hourly refresh_: Supabase `pg_cron` + `pg_net` call `GET /api/refresh/tick` every hour
  (job `reader-hourly-refresh`). The endpoint is public but runs at most every 40 minutes
  and returns only counts.

**YouTube.** From servers, YouTube's player API answers "sign in to confirm you're not a
bot" and caption/transcript endpoints refuse, but its pages still load:

- `lib/youtube-video.ts` reads a channel's /videos, /streams and /shorts tabs (lengths,
  which videos are Shorts, live/upcoming badges) and a video's page (full description,
  the creator's chapters). `lib/video-maintenance.ts` runs them after the hourly refresh:
  channels every 2 hours (sooner when new videos arrive), new videos' pages once.
- Transcripts, summaries and key moments come from Gemini reading the YouTube URL itself
  (`generateFromVideo` in `lib/ai.ts`, `lib/video-ai.ts`): few frames, low resolution
  (about 3,000 tokens a minute), timestamps asked as "M:SS" (seconds drifted badly).
  The free tier is often overloaded (503): runs happen on opening a video
  (`POST /api/articles/[id]/video`) and from `/api/videos/tick` (public, 20-minute rate
  limit, Supabase pg_cron `reader-video-ai` at :47). Busy answers don't use up a video's
  4 tries. An empty transcript array means "done, none" (videos over 45 minutes).
- The reader plays videos through the IFrame API (`lib/youtube-player.ts`,
  `components/video/VideoPlayer.tsx`): resume from `watchedSeconds`, speed remembered per
  device, marked read at 90% (not on open), mini player when scrolled away, up next (Later
  queue, then the channel). Times in descriptions and transcripts are `a[data-t]` links
  the reader turns into seeks. The transcript is part of the article body, so highlights
  work on it, and the search trigger indexes it (weight D).
- Lists: `?video=long|short` (the YouTube tab's Videos/Shorts), `?length=short|medium|long`,
  and the `video-prefs` Setting (`hideShorts`) removes Shorts everywhere else.

**Podcasts.** A feed is a podcast when most of its items carry an audio enclosure (or it was
followed from an Apple Podcasts link, resolved through Apple's free lookup API). Episodes keep
`audioUrl`/`audioType`, `durationSeconds` (itunes:duration) and artwork; their show notes go
through `showNotesHtml` (`lib/podcast.ts`), which turns times into `a[data-t]` seek links,
and `chaptersFromNotes` fills `chapters` when the notes list three or more times. A newly
followed podcast stores only its newest 20 episodes.

- One player for the whole app (`components/audio/AudioProvider.tsx`): a single `<audio>`
  element above everything, the now-playing bar at the bottom of `AppShell`, Media Session
  (lock screen and notification controls), speed remembered per device, a sleep timer,
  progress saved every 15 s and on pause (`watchedSeconds`, `readProgress`), played at 95%,
  and continuous play (Later queue, then the same show) through the same
  `/api/articles/[id]/video` extras route as videos. The last episode is restored paused
  without downloading anything until play is pressed.
- Gemini listens to episodes (`generateFromAudio` in `lib/ai.ts`): Gemini can't fetch audio
  from podcast hosts, so the function downloads the file and puts it in Gemini's file store
  (resumable upload, deleted after use). Same runs, tries and tick as videos
  (`VIDEO_AI_CANDIDATE` covers both); transcripts for episodes up to an hour, summaries and
  key moments up to 2 h 15 (32 tokens per second of audio vs. the free per-minute limit).
- Discover's Podcasts channel searches Apple (`searchApplePodcasts`) and shows Apple's charts
  (`/api/discover/podcasts`, US and French stores by language).

**AI quota** (`lib/ai-budget.ts`). Every Gemini call goes through `callGemini`, which takes
from a daily budget per kind (embed, text, video; env `GEMINI_*_DAILY`), counted per Pacific
day like Google's quota. Background work (`priority: "background"`: embeddings, promo
screening, the hourly video run) stops at 75%, leaving the rest for things you open. A 429
pauses that model: for the day when Google says the daily quota is spent, else for its
`retryDelay`. Running out throws `AiError` 429, which every caller already treats as "later".
Settings shows today's use.

**Rules** (`lib/rules.ts`). `FilterRule` actions: hide, boost, alert, save; by keyword (whole
word, any case) or feed. After each refresh, `applyArrivalRules` checks the new articles:
alert matches get `alertedAt` (the Alerts view, `?alerts=1`) and one grouped push per rule
(4 at most per refresh); save matches go to Later. Hidden articles never trigger anything.

**Daily review** (`lib/review.ts`). Five due highlights a day (overdue first, then
never-reviewed ones a day old). Again → 1 day; Good → 4 days, then ×2.2; Easy → 10 days,
then ×3.5 (max a year); "never" sets `reviewDisabled`. The streak comes from the
`review-log` Setting. Highlights have lowercase `tags` (filter chips, `?tag=` on the list and
the Markdown export).

**Smart layer** (`lib/smart.ts`, all optional: every call throws `AiError` when AI is off).
_Ask your reader_ (`components/ask/AskView.tsx`, `POST /api/ask`): the question is embedded
at user priority, the 12 closest articles of the last 60 days (plus saved ones, plus
full-text hits) go to Gemini, and the answer cites them as `[n]`; the conversation lives in
`sessionStorage`. _Catch me up_ (`CatchUpSheet`, `POST /api/catchup`): 4–6 bullets over up
to 40 unread articles of the list's scope, each pointing at its articles, and "Mark these
read" (`/api/articles/mark-all-read` with `ids`). _Why this_: For You adds a `reason` per
story (boosted, covered by N sources, a feed you read often, close to what you read).
_Selection help_ (`SelectionHelp`, `POST /api/ai/selection`): Explain / Define / Translate
a selected passage. _Translate_ (`TranslateMenu`, `POST /api/articles/[id]/translate?to=`):
the whole article, kept in `Article.translations[lang]` so it's made once. _Tag ideas_
(`POST /api/highlights/[id]/suggest-tags`): the sparkle in `TagEditor`. _Story timelines_
(`StoryTimeline`, `GET /api/articles/[id]/timeline`, no AI): the same topic, or cosine ≥ 0.8
with a shared capitalised name in the headline, within 21 days, grouped by day. _Near
duplicates_: `markDuplicates` in `lib/enrich.ts` sets `Article.duplicateOf` when two fresh
articles have the same folded title or cosine ≥ 0.97 within 3 days; `hiddenArticleClauses`
drops them from every list and count.

**Home and sources.** _Today_ (`components/today/TodayView.tsx`, view type `briefing`) is
made of blocks rendered from `useHomeBlocks` (`lib/hooks/useHomeBlocks.ts`, localStorage
`home-blocks`: order and hidden ids; the Customise sheet in `HomeBlocks.tsx`). Briefing
blocks skip when there is no briefing; "Continue where you left off" (`GET /api/home`:
part-read articles, part-played media) and "Tidy up" (`useUnusedSources` →
`GET /api/feeds/unused`, `lib/unused-sources.ts`: followed 60+ days, nothing read, saved or
highlighted in 60 days) work without AI. Settings → "Start on" (`start-view` in
localStorage, read once in `useReaderState` when the URL has no `?view`/`?article`).
_Stats_ (`lib/stats.ts`, `GET /api/stats`, `components/stats/StatsView.tsx`, view `stats`):
the last 30 days by day and hour (app time zone), top sources, kinds, streak. _Source
pages_: `components/sources/SourceHeader.tsx` sits above any feed's list (replaced the
YouTube-only ChannelHeader); its settings sheet toggles `Feed.inForYou` (For You candidates
require it), `Feed.fullPage` (`needsFullArticle` returns true), and the existing mute /
alert rules. The sources manager has a "Never read" channel. _Search operators_
(`lib/search-query.ts`, applied in `/api/articles`): `from:name` (`from:"two words"`),
`tag:x`, `is:unread|saved|highlighted`, `in:rss|youtube|newsletters|podcasts|news`; the
remaining words are the full-text search, and operators alone give a date-ordered list.
`SearchSuggestions` under the sidebar box shows recents (`search-recents`) and, while
typing, matching sources and tags as operator chips.

**Under the hood.** _Instant open_: `lib/swr-cache.ts` (`SwrPersistence`, mounted in
`Providers`) restores first pages, counts, feeds and the briefing from localStorage
(`swr-cache`) right after mount, then saves them when the page is hidden; restoring during
render would break hydration. _Outbox_: `lib/outbox.ts`; `patchArticle` queues a change when
the network is down and answers optimistically; `OfflineSupport` replays the queue when back
online and shows the count in the offline bar. `cache-article` (service worker) keeps one
article offline ("Save offline" on cards); the System sheet counts what's cached. _Adaptive
refresh_ (`lib/refresh.ts`): sources quiet for a week are read every 6 h, for a month (or
failing) once a day; `skipped` is reported. _Link cleaning_ (`lib/links.ts`): utm and
friends are stripped at ingest (existing articles still match by their old link) and when
sharing. _Security headers_ in `next.config.mjs` (CSP, HSTS, nosniff, frame-ancestors
none; the CSP allows YouTube frames and scripts, any image/audio host, api.github.com).
_Error log_ (`lib/errlog.ts`, `/api/errors`): the hourly tick, the refresh route and the
client `ErrorBoundary` (around the list, the reader and each full page; `app/error.tsx`
for a whole page) record errors in the `error-log` Setting. _System sheet_ (Settings →
Under the hood, `GET /api/system`): build, database size and counts, last tick summary
(`last-tick` Setting), offline state, the error log. _Backup_: `GET /api/backup` downloads
sources, categories, rules, highlights, saved articles and preferences as JSON. _French_:
`lib/i18n.tsx` (`useT`, `LocaleProvider`, localStorage `locale`) covers the chrome (tabs,
sidebar, settings, list menus, common actions); strings not in the table fall back to
English. _Android_ 1.2.0 adds Podcasts and Review shortcuts (needs signing, see
`android/README.md`).

**Screen space** (phones). Two thin rows on top: `TopBar` (tabs, with search, add and settings
on the right) and `components/articles/ListToolbar.tsx` (every filter as a chip in one
sideways-scrolling row, plus a single "⋯" menu for add, refresh, layout, sort, mark all
read). A title row appears only where there's a back button (feed, category, Today, All,
Alerts, a News section, search). Both rows live in `ChromeCollapse` and slide away while the
list scrolls down (`lib/hooks/useChrome.ts`; a restored scroll position calls
`syncChromeScroll` so it doesn't count as scrolling). Chips use `components/ui/chip.tsx`;
category chips come from `useCategoryOptions`. Tab badges are dots, "new since this tab was
last open" (`useNewSinceLastLook` in TopBar). Every number on tabs and in the sidebar comes
from one request, `/api/articles/counts` (`lib/counts.ts`, `useCounts()`); its key starts with
`/api/articles`, so refreshing the lists refreshes it. Don't add a request per badge.

**List behaviour.** Each list remembers its scroll position (`ArticleList`, keyed by its
params); a line marks where articles you haven't seen start (`useLastVisit`, dated lists
only); a "N new" pill shows when the list gains articles while you're scrolled down; tapping
the current tab scrolls to the top (`scroll-top` app event); cards have a long-press menu, a
bouncing bookmark and `content-visibility: auto` so long lists stay light; pressing a card
prefetches the full page of an excerpt-only article. Dialogs and secondary screens are
loaded with `next/dynamic` in `AppShell` (keep heavy components out of its static imports).

**Housekeeping** (`lib/maintenance.ts`, run after the hourly tick and the daily cron):
articles dated in the future move to when they arrived; an article stored by two feeds
(same link) keeps one copy; recent articles without a picture get their page's share
image (`imageCheckedAt` marks the attempt; a picture reused across a feed is a logo and is
ignored); once a day, articles past retention are deleted (`lib/retention.ts`: News 14 days,
the rest 60, never saved/archived/snoozed/highlighted ones, and each feed keeps its newest
10). Ingest skips links already stored and backlog older than retention, so deleted
articles don't come back. The free database is 500 MB and about a thousand articles arrive
a day: keep retention in mind before storing more per article.

**Data model in one paragraph.** A `Feed` has a `type` (rss, youtube, newsletter, podcast) and, when
it's a news outlet, a `newsDesk` (morocco, world, europe, africa, economy, sports, tech) and
`region` ("ma"). News feeds show only in the News tab, not in RSS. `Article` holds reading
state (isRead, isSaved, archivedAt, readProgress), AI data (embedding, aiSummary, isPromo) and
an optional `topicId` that groups articles about the same story, plus `snoozedUntil` and
its `Highlight`s. `DailyDigest` stores the
briefing as JSON (`version: 2`). `Setting` is a key/value store (news prefs, cached news
insights, weather city).

**State on the client.** `useReaderState` holds the current view (`type`: foryou, briefing,
recap, news, rss, youtube, newsletters, podcasts, alerts, review, ask, stats, later, all,
today, saved, feed, category), the Later
sub-tab (queue, snoozed, archive, highlights), the newsletter kind, the search with its
scope and time filter, the selected article and the mobile pane (sidebar, list, reader,
settings). Data comes from SWR hooks in `lib/hooks`.

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
- **Vercel Hobby cron runs once a day.** The hourly refresh comes from Supabase pg_cron
  calling `/api/refresh/tick` (see Reader 2.0 features); refresh-on-open still helps.
- **Never let a Prisma migration touch `Article.search`.** It's filled by a trigger; a
  generated column made `prisma migrate diff` want to drop its default every time. Raw SQL
  must name tables with `sqlName()` (schema from `DATABASE_URL`), and SQL functions use
  `SET search_path FROM CURRENT`, because Supabase's pooler doesn't keep the search path.
- **Bing News topic feeds** need `setlang` and `mkt` (e.g. `fr-FR`) or results come back in
  other languages; article links are wrapped and unwrapped via the `url` param.
- **lucide-react has no YouTube icon** in this version; the code uses `Play` or `MonitorPlay`.
- **Restart `next dev` after `prisma generate`.** The running server keeps the old client, so
  new columns or enum values fail with "Unknown argument" until it restarts.
- **Testing audio needs HTTP ranges.** Python's `http.server` doesn't support them, so the
  browser can't seek; serve fixtures with a range-capable server.
- **`aspect-ratio` boxes grow with their content.** Put the image in an `absolute inset-0`
  frame (see ArticleCard's cards layout) or a tall picture stretches the 16:9 box.
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
8. Android app (TWA), offline mode, push notifications.
9. Reader 2.0: highlights and notes, full-text search, newsletters split into Substack &
   web / Email (email-only via Kill the Newsletter), snooze, weekly recap, reading time,
   hourly refresh, card layout, resume reading, ⌘K command palette, skeletons.
10. Data health (retention, duplicates, pictures, dates, dead feeds), notification prompt.
11. YouTube upgrade: Shorts, lengths, progress, player, chapters, AI transcripts.
12. UX pass: two-row phone header that hides on scroll, one counts request, long-press menu,
    scroll memory, greeting, review swipe, picture cards.
13. v3: AI quota budget, Podcasts (app-wide player, Apple search, AI on episodes),
    Alerts and auto-save rules, Daily review with tags.
14. Premium pass 1: Now Playing screen (queue, chapters, live transcript, per-show speed,
    share a moment), view transitions, bottom sheets, paper theme, focus mode, contents,
    lightbox, "More like this", what's new sheet.
15. Premium pass 2 (smart): Ask your reader, Catch me up, why-this reasons, selection
    Explain/Define/Translate, article translation, tag ideas, story timelines, near-duplicate
    removal.
16. Premium pass 3 (home): Today as a configurable home (continue, tidy up, start page),
    reading stats, source pages with per-source settings, "Never read" sources, search
    operators with recents and suggestions.
17. Premium pass 4 (under the hood): instant open, offline outbox and per-article offline
    copies, adaptive refresh, link cleaning, security headers, error boundaries and log,
    System sheet, backup export, French interface, Android shortcuts for Podcasts and Review.

## Open ideas (not built yet)

- "Mark read when scrolled past" in lists.
- Highlights export to Readwise / Notion.
- Android shortcuts for Search, Highlights and Snoozed (needs a new APK).
