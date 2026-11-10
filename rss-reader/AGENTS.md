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
  sponsors.ts            sponsor segments: SponsorBlock for videos, chapters/transcript for episodes
  phrases.ts             transcript lines → short timed phrases for read along
  session.ts             reading sessions ("5 min"): the pile the reader steps through, minutes left
                         (TimePile: For You's "5 min" pill draws on Later + For You; Later's pill
                         and ⋯ open it on Later only, via requestAppEvent("time-pile", "later"))
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
A connection that neither answers nor fails no longer hangs the app: `networkFirst` waits
3.5 s for a page and 6 s for data, then serves the saved copy while the network answer
refreshes it (`PAGE_PATIENCE_MS`, `DATA_PATIENCE_MS`). And if the app still hasn't come
up after 12 s, a plain inline script in `app/layout.tsx` (no bundle needed) shows "Try
again / Reset the saved copy and reload / Keep waiting"; `Providers` sets
`window.__readerReady` to stand it down. `e2e/offline.spec.ts` stalls and cuts the
worker's requests (`PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS`).

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
- _Search by meaning_: the "By meaning" chip (only when AI is on) adds `meaning=1`;
  `searchByMeaning` embeds the query once (cached 10 min per instance), ranks the newest
  1,500 embedded articles by cosine (≥ 0.55, top 60), then appends word matches; out of
  quota it falls back to the words.
- _Search_: `Article.search` is a `tsvector` kept by the trigger `Article_search_update`
  (migration `v2_library`; `reader_fold()` strips accents). Prisma sees it as
  `Unsupported`, and search runs as raw SQL in `lib/search.ts`, which also matches
  highlight text and notes.
- _Newsletters_ split into "Substack & web" and "Email" (`Feed.platform`). Email-only ones
  get an address from Kill the Newsletter (`POST /feeds` needs the `CSRF-Protection: true`
  header); its Atom feed is then followed like any other.
- _Snooze_: `Article.snoozedUntil` hides an article from lists until
  `wakeSnoozedArticles()` (every refresh) brings it back to the top of Later with a push.
- _Month in review_: `buildRecap("month")` (`/api/recap?period=month`, the Week/Month
  switch in `RecapView`): 30 days, the 8 most-covered daily leads (`monthStories`), its own
  cached summary; a push on the 1st from 9:00 (`recapMonth` in the `push-sent` log).
- _Morning digest_: `sendScheduledPushes` sends the briefing's top three headlines plus
  what's waiting (Later, new episodes; `digestBody`) from the first refresh at or after
  `NotifyPrefs.digestHour` (5–11, chosen in Notifications), not past late morning.
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
  Transcripts are one line per sentence with its own start (read along stays exact); an
  answer cut off at the token limit is salvaged up to the last complete line
  (`salvageJson`). The background queue (`videoAiQueue`) goes: saved or started items
  (any age), then the last 30 days of shows and channels you play, then the newest two
  weeks. A spare slot redoes one old paragraph-style transcript (`isCoarseTranscript`,
  median gap ≥ 12 s) of something played or saved, once (`refineQueue`,
  `runVideoAi(..., { refine: true })`, no try used; made before 2026-11-10).
- The reader plays videos through the IFrame API (`lib/youtube-player.ts`,
  `components/video/VideoPlayer.tsx`): resume from `watchedSeconds`, speed remembered per
  device, marked read at 90% (not on open), mini player when scrolled away, up next (Later
  queue, then the channel). Times in descriptions and transcripts are `a[data-t]` links
  the reader turns into seeks. The transcript is part of the article body, so highlights
  work on it, and the search trigger indexes it (weight D).
- _DeArrow_ (`lib/dearrow.ts`): community titles from `sponsor.ajay.app/api/branding`,
  asked after each refresh for videos under 3 days old (every 6 h until one exists);
  `title` holds what's shown, `altTitle`/`originalTitle` both kept, and the Settings switch
  (`PUT /api/videos/dearrow`, Setting `dearrow`) swaps every row at once. The reader shows
  the creator's title under a plain one. Thumbnails aren't replaced (DeArrow renders them
  on demand and they're often missing).
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
- _Downloads_ (`lib/downloads.ts`, `components/audio/Downloads.tsx`): the page asks the
  service worker for `/episode-download?url=…` (the page's CSP only allows its own origin;
  the worker's allows any host), streams it into the `episodes-offline` cache (kept across
  `VERSION` bumps) under `/offline-audio/<id>`, which the worker serves with byte ranges.
  `sourceOf(episode)` gives the player that path when downloaded and a worker is in
  charge. Needs CORS on the show's server; a 502 from the worker means it isn't allowed.
  Downloads are listed in localStorage `episode-downloads` and removed once played to the
  end (on `ended` or the next load). Podcasts → ⋯ → Downloads lists them.
- _Car mode_ (`components/audio/CarMode.tsx`, app event `car-mode`): huge controls, Wake
  Lock while open.
- _Voice boost and silence trimming_ (`lib/audio-fx.ts`): Web Audio (high-pass, presence
  EQ, compressor, make-up gain; a ScriptProcessor meter speeds silences to 3×). Routing an
  element through Web Audio is permanent and silences non-CORS streams, so effects attach
  only to downloaded episodes, only from a tap (a context made without one is suspended),
  and `AudioProvider` swaps in a fresh `<audio>` (its `key`) before streaming anything else.
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
_Error log_ (`lib/errlog.ts`, `/api/errors`): server code reports problems with
`reportProblem(scope, error)`: a busy or unreachable outside service (`isTransient`:
Gemini 503/429, a site's 429, timeouts, dropped connections) is a `console.warn` and
nothing more; anything else is a `console.error`, goes in the `error-log` Setting and is
pushed to the owner once a day per kind (`problemSignature`, `error-alerts` Setting,
notify pref `problems`). A feed or page that fails to load is a warning (Sources shows
failing feeds). The client `ErrorBoundary` (around the list, the reader and each full page;
`app/error.tsx` for a whole page) records errors too. Don't add bare `console.error` in
server code. _Health_: `GET /api/health` (public, no data) answers 200 when the database
answers and the hourly refresh ran within 3 hours, else 503. `.github/workflows/reader-uptime.yml`
asks it every half hour and fails (GitHub emails the owner) after three bad answers; the
daily Vercel cron also reports a stale hourly refresh. _Voice check_ (`lib/voice-check.ts`,
after the hourly refresh): one sentence through the natural voice, weekly while it works,
twice a day while it doesn't; the System sheet shows the result. _System sheet_ (Settings →
Under the hood, `GET /api/system`): build, database size and counts, last tick summary
(`last-tick` Setting), offline state, the error log. _Backup_: `GET /api/backup` downloads
sources, categories, rules, highlights, saved articles and preferences as JSON. _French_:
`lib/i18n.tsx` (`useT`, `LocaleProvider`, localStorage `locale`) covers the whole interface
(about 900 strings; article text and What's new stay as written); strings not in the table
fall back to English. New visible text goes through `t("…")` in components (labels kept in
lists are translated where they're drawn: `t(item.label)`), and gets a French entry.
Search operators (`from:`, `tag:`…) are never translated. `e2e/french.spec.ts` opens the
main screens in French and fails on everyday English words. `tr()` is the
same lookup outside components (toasts, helpers). `tests/i18n.test.ts` fails when a
`t("…")`/`tr("…")` literal has no French entry; labels passed through props
(`MediaCard` titles, `ActionButton`/`RoundButton` labels) are translated where they're
drawn, so add those keys by hand. _Android_ 1.2.0 adds Podcasts and Review shortcuts (needs signing, see
`android/README.md`).

**Delight.** _Stories_ (`lib/stories.ts`, `components/stories/`): `StoryBubbles` lists
sources with unread (For You adds a "For you" bubble over the ranked pool) above For You and
each source tab; `StoriesPlayer` is a full-screen `role="dialog"` flow over
`/api/articles?feedId=…&unread=true&limit=8` with a 7 s clock per story driven by
`requestAnimationFrame` (hold pauses, tap left/right steps, sideways swipe changes source,
down closes), Read opens the reader, "seen" is local (`stories-seen`). _Magazine layout_
(`useListLayout`: `"magazine"`, the default for foryou and news): the first card of each day
or every fifth is a big picture card with a serif headline (`ArticleCard` `editorial`/`lead`),
the rest rows; `enterDelay` staggers the first ten cards in. _Cover story_: Today's lead
story with a picture renders full-bleed (`CoverStory`). _Goal ring_ (`GoalRing`,
`useReadingGoal`, `GET /api/stats/today`): minutes read today against a goal kept on the
device (`reading-goal`, Settings → Daily goal) plus the streak. _Accent colours_
(`useAccent`, `data-accent` on `<html>`, variables in `globals.css`; `AccentBoot` in
`Providers`). _Personalise_ (`usePersonal`, one JSON blob under `personal` read through
`useSyncExternalStore`; `PersonalBoot` puts `data-density` on `<html>`): switches for the
stories row, ring and briefing card, compact density (CSS under `[data-density="compact"]`),
haptics (`lib/native.ts` `haptic()` checks `hapticsEnabled()`), and the top tabs (`TopBar`
builds them from `personal.tabs` minus `hiddenTabs`, plus `pinnedCategories` as
`{type:"category"}` tabs). `StoryBubbles` takes `scope` (the source tab) so RSS never shows
the News desk, and folds away under `stories-collapsed`. `LayoutSwitch` in `ListToolbar` is
a radiogroup in the chip row; `"grid"` renders `TileGrid` (square artwork tiles, the default
for podcasts). Small life: shimmer skeletons, an equalizer on the now-playing artwork, a
source-colour wash at the top of the reader.

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

**Preferences.** `lib/prefs.ts` is the one store for everything the reader chooses:
`usePref(key, fallback)` reads through `useSyncExternalStore` (server render and first paint
use the fallback), `writePref` saves to localStorage and queues a debounced `PUT /api/prefs`;
`PrefsSync` (Providers) pulls on open, on return to the app (once a minute at most) and when
back online, newest timestamp per key winning. Keys in `SYNCED` travel; the rest stay local.
`usePersonal`, `useAccent`, `useReadingGoal`, `useHomeBlocks`, `useListLayout` (`layouts`
object), `useReaderPrefs`, the locale, start view, stories seen/collapsed, `useComfort`,
`useSavedSearches` and the snip window all sit on it.

**Snips.** `POST /api/articles/[id]/snip` { at, window } takes the transcript slice ending at
`at`, asks Gemini for a title and summary (first sentence when AI is off) and stores a
`Highlight` with `kind = "snip"`, `title`, `startSeconds`, `endSeconds`. `AudioProvider.snip()`
reads the position off the element; Media Session `previoustrack` twice within 700 ms snips.
`EpisodeNotes` lists snips and searches the transcript; `EpisodeSearch` (Podcasts → ⋯) hits
`/api/discover/episodes` (own episodes + Apple `entity=podcastEpisode`); catalogue episodes
play as `ext:<id>` and skip progress and extras calls.

**Collections.** `Collection` / `CollectionItem` tables; `/api/collections` (+`?articleId=`
for ticks), `/api/collections/[id]` (PATCH name/description/public → slug), `.../items`.
`CollectionPicker` from cards and the reader; `CollectionsView` under Later; `view.type ===
"collection"` lists one (`collectionId` on `/api/articles`); `/c/[slug]` is public (middleware
lets `/c/` through). `/api/later/epub` builds an EPUB 3 with `lib/zip.ts` (stored zip).

**Discussion, pinned searches.** `/api/articles/[id]/discussion` asks HN Algolia (by URL, then
title) and Reddit (often 403 server side); `Discussion` renders under the article once in view.
Pinned searches are the `saved-searches` pref, shown in the sidebar with a count from
`/api/articles?search=…&unread=true&limit=1`.

**Natural voice.** The Listen bar's "AI" switch (pref `listen-voice`) reads the article
with Gemini text-to-speech: `narrationParts` cuts it into passages under 900 characters
(about a minute, ~3 MB of WAV, under Vercel's 4.5 MB response limit), each posted to
`/api/narrate` (`narrate()` in `lib/ai.ts`, `GEMINI_TTS_MODEL` or the preview TTS models,
budget bucket `voice`, `GEMINI_VOICE_DAILY`, default 60), kept in the `narration` cache on
the device, the next fetched while one plays. Busy or out of quota, it carries on with the
device's voice from that passage.

**Passkeys** (`lib/passkeys.ts`, `/api/auth/passkey/*`, `@simplewebauthn`). Added from
Settings → App while signed in; the login page offers "Unlock with a passkey" when one
exists. User verification is required; public keys sit in the `passkeys` Setting; each
ceremony's challenge travels in a 5-minute signed cookie (`rss_passkey`). The password
still works. Tests use Chromium's virtual authenticator (`e2e/security.spec.ts`).

**Restore** (`lib/restore.ts`, `POST /api/backup`, Settings → Your data). Additive only:
categories by name, sources by feed address, rules (source rules by `feedUrl`), saved
articles and highlights by link (missing articles come back as saved links), settings
only where unset. Backups are version 2 (highlight anchors, snip fields, `feedUrl`).

**Highlight exports** (`lib/exports.ts`, `/api/highlights/send`, Highlights → Send to…).
Tokens are encrypted in the database (`lib/secret-box.ts`, AES-256-GCM keyed on
`AUTH_SECRET` + the password); each highlight records where it went (`exportedTo`), so
nothing is sent twice.
Readwise (token checked at `/auth/`, highlights posted in hundreds) and a Notion database
(integration secret + database link; one page per article in the database's title
property, quotes and notes as blocks; later highlights appended, page ids in the
`notion-pages` Setting). Tokens live in the `highlight-exports` Setting and never go back to
the browser. New highlights are sent after each hourly refresh (`runHighlightExports` in
maintenance). `READWISE_API_URL` / `NOTION_API_URL` point the calls elsewhere (the e2e
fixtures stand in for both and record what they get at `/_received`).

**Everything Reader can do** (`components/layout/FeaturesSheet.tsx`, Settings → Help): the
searchable list of features, each with where it lives and, where there's somewhere to go,
an Open button (a view or an app event). Add an entry when a feature ships.
`e2e/a11y.spec.ts` runs axe (serious and critical only) over the newer screens.

**Shorts and Listen to Later.** `ShortsPlayer` reuses one YouTube IFrame player
(`loadVideoById`) with swipe/keys/wheel; `ListenLater` reads the Later queue with the browser
voice (`lib/speech.ts` helpers shared with the reader's Listen button) and marks each article
read at its end.

**Player and tabs.** `NowPlayingSheet` is one scrolling page: header (turns into a mini bar
with play once scrolled), artwork, title, `ChapterScrubber` with the current chapter's
name, controls, actions; then cards from `components/media/MediaCards.tsx`: `MediaCard`
(folds with its chevron; folded ids in the synced `player-cards` pref), `ReadAlongCard`
(+ full-screen `TranscriptOverlay` with search), `TimeListCard` (chapters, key moments),
`AboutCard` (sanitised notes, `[data-t]` times seek, "see more" only when it overflows),
`MediaRow` (more from the show, similar), `DiscussionCard`, `Art` (picture with a letter
fallback). `AudioProvider.openPlayer(episode)` shows an episode without playing it
(`viewing`); a static `TimeStore` stands in for its position until Play. Phones open
episodes from lists this way (`ArticleList.handleSelect`); desktop keeps the reader, whose
episode player has a full-screen button. The reader's video and episode pages use the same
cards; the transcript left the page body. `useSectionTabs` (tabs, active, select, new dots)
feeds both the desktop `TopBar` and the phone `BottomNav` (five slots, or four + More
sheet); the phone `TopBar` shows the section's name.

**Comfort, pages, starter packs.** `useComfort` (bionic via `bionicHtml` after DOMPurify, big
targets as `data-targets`, dark after sunset via `ComfortBoot` and NOAA sun times from the
weather location); `usePagedLayout` turns the reader's scroll area into screen-tall CSS
columns (styles only on existing nodes) when `reader-prefs.mode === "pages"`, chosen from
`ReaderMenu` (⋯); `StarterPacks` + `POST /api/feeds/batch` follow a category's catalogue
bundle on first run and from Settings.

## Gotchas learned the hard way

- **Next.js 15.** Route `params` are promises (`props: { params: Promise<{ id: string }> }`,
  then `await props.params`), `fetch` isn't cached unless asked, and React 19 refs include
  `null` (`RefObject<HTMLElement | null>`). Read request bodies with `readJson` from
  `lib/http.ts`: a cut-off body throws `BadRequest`, which routes answer with 400
  (`if (error instanceof BadRequest) return badRequest(error)`), not a 500 and an alert.

- **Every push makes about seven deployments** (one per linked project; the ones the
  ignored-build step cancels and the three broken ones count too), so about fourteen
  pushes use up the day's hundred, and the next merge to main is silently not deployed.
  Push once per batch, not per commit.
- Vercel Hobby allows 100 deployments a day across the team. Every project linked to this
  repo has the Ignored Build Step `git diff --quiet HEAD^ HEAD -- .` (only builds when its
  own folder changed), so a Reader push builds Reader alone. Three projects (ps-planning,
  planet-sport-studio, culture-connected) point at folders that no longer exist here and
  fail on every push until they're unlinked. If a merge isn't picked up, deploy main with
  the Vercel API (`create_deployment` from the git source).
- Hide-on-scroll: toggling the bars resizes the list, and at the end of a short list the
  browser then clamps the scroll position, which reads as scrolling up. `useHideOnScroll`
  ignores moves for 350 ms after a toggle and upward moves pinned to the end.
- Squash merges leave the working branch with different commits from `main`; merge `main`
  back after each one and resolve `WhatsNew.tsx` / `i18n.tsx` with the branch's version.

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

- Types and lint: `npm run typecheck && npm run lint`.
- Unit tests: `npm test` (Node's test runner through tsx, `tests/*.test.ts`) for pure
  helpers. Add one when you write a pure function worth trusting.
- End-to-end: `npm run test:e2e` (Playwright, `e2e/`), on a phone (390 px, touch) and a
  desktop screen. It needs a local Postgres database for tests (`E2E_DATABASE_URL`,
  default `postgresql://rss:rss@localhost:5432/rss_e2e`; create it and run
  `prisma migrate deploy` against it once). `e2e/seed.ts` wipes and fills it (it refuses
  any non-local URL); `e2e/fixture-server.mjs` serves silent audio with Range, feeds and a
  cover so nothing touches the network; the config starts its own dev server on port 3200
  with its own build folder (`NEXT_DIST_DIR=.next-e2e`), so it runs next to `next dev`.
  Every new user-facing flow gets a spec there.
- CI: `.github/workflows/reader-ci.yml` runs types, lint, unit tests, a production build
  and the end-to-end suite on every pull request touching `rss-reader/` (no secrets). Keep
  it green before merging.
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
18. Delight pass: Stories, magazine layout and cover story, goal ring and streak, accent
    colours, shimmer, equalizer, reader wash.
19. Personalise: stories scoped per tab and collapsible, layout switch in the chip row with
    a square tile grid, Settings → Personalise (switches, density, haptics, tab order and
    hidden tabs, pinned categories).
20. Preferences synced through the server (`lib/prefs.ts`, `/api/prefs`), Settings on
    desktop.
21. Snips (player button, earbud double press, snip cards), episode notes, episode search.
22. Collections with public pages (`/c/<slug>`), discussion threads (HN, Reddit), pinned
    searches, EPUB export.
23. Vertical Shorts player, Listen to Later.
24. Pages mode, reading comfort (bionic, easy font, big targets, dark after sunset),
    starter packs, the reader's ⋯ menu.
25. Speed and accessibility pass: reader, Highlights and Collections loaded on demand,
    axe-clean lists, reader, Later, Settings and login (landmarks, heading order, no
    nested controls, contrast).
26. Full-screen podcast player with folding cards (also on video pages), bottom tab bar on
    phones, hide-on-scroll no longer shakes at the end of short lists.
27. Foundations: unit + end-to-end tests and CI, error triage with alerts, health check,
    Next.js 15. Then: sentence-level transcripts (exact read along), transcript queue
    by what you play, old transcripts redone, "5 min" from Later, more of the app in French.
    Then: DeArrow titles, episode downloads, car mode, voice boost and silence trimming.
    Then: natural AI voice for Listen, search by meaning, month in review, morning digest at
    a chosen hour, highlights to Readwise and Notion.
28. Reliability and security: worker patience and a stuck-screen way out, uptime workflow,
    voice check, passkeys, backup restore, encrypted export tokens, no double exports.
29. The whole interface in French, the "Everything Reader can do" page, axe checks.

## Open ideas (not built yet)

- "Mark read when scrolled past" in lists.
- Android shortcuts for Search, Highlights and Snoozed (needs a new APK).
