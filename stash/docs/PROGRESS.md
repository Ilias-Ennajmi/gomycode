# Stash — progress and decisions

Read this at the start of every session. Updated after every task.

## Current phase: 4 · Delight — built on a branch (migration 0006 written, not applied; worker not deployed; APK 1.1.0 built, not signed)

## Phase 4 · Delight — built, waiting for 0004–0006, the worker deploy and the signed APK

### Phase 4 status (2026-11-10)
Built on the Phase 4 worktree branch (from `claude/magical-turing-jwi3nx` @ d5ae4f8). Nothing applied,
pushed or deployed.
- `supabase/migrations/0006_delight.sql` (**NOT APPLIED**; apply after 0004 and 0005): job type `galaxy`;
  `galaxy_points` / `galaxy_clusters` / `galaxy_layouts` (RLS owner read, phone read-only); trigger on
  `embeddings` → `maybe_galaxy()` queues a job after 5+ new embeddings since the last layout (one waiting
  job per user); storage policies so the phone can upload (insert/update) only into
  `stash-thumbs/<uid>/screenshots/`; `reminders.rule` (check: weekend_morning | evening_open | learn_open);
  `cron_due_reminders` also returns context reminders that carry a fire_at; `stash.wrapped(date)`
  (security invoker); `stash.cleanup_anonymous_users()` (security definer, refuses other callers) +
  pg_cron `stash-cleanup-anonymous` daily 03:23; usage kind `galaxy`; galaxy_layouts in Realtime;
  ends with the explicit EXECUTE block for the whole schema (0001–0006).
- Worker: `galaxy` jobs (stash_worker/galaxy.py), screenshots read with Claude vision in `_ingest`
  (`ai.read_screenshot`, `rules.normalize_screenshot`, `rules.screenshot_path`); `call_tool` accepts content
  blocks; numpy added. 95 pytest tests (75 before).
- Web: Galaxy lens (`components/library/GalaxyView.tsx`, math in `lib/galaxyMath.ts`), POST share target
  (`app/manifest.ts`, `public/sw.js` v4, `app/share/receive/route.ts`, `lib/shareInbox.ts`, outbox uploads
  images first, SaveSheet screenshot mode, player image mode), Saved Wrapped (`components/you/WrappedCard.tsx`,
  `lib/wrapped.ts`), context reminders (`lib/contextRules.ts`, RemindSheet "When it fits",
  `components/reminders/ContextCheck.tsx`), shortcuts (`?search=1`, `?space=inbox`), identity on the
  phone (`lib/supabase/session.ts`, `client.ts`, NativeBoot; proxy.ts only refreshes), motion pass
  (`lib/morph.ts`, `components/ui/WordReveal.tsx`, `lib/motionTokens.ts`, springy swipes).
- Android: SEND `image/*` filter, shareTarget POST multipart to `/share/receive`, versionCode 2 /
  versionName 1.1.0, e2e records an informational image share. **Unsigned** (no key here).
- Checks: tsc, eslint, 126 Vitest (18 files), 95 pytest, next build green; no raw colours in components/app;
  Android XML parsed with minidom, shareTarget JSON reproduced from build.gradle and parsed; 0001–0006
  applied in order (0006 twice) on local Postgres 16 with Supabase stubs, grant table checked, galaxy
  trigger (4 → 0 jobs, 6 → 1 job), phone can't write galaxy rows, screenshot folder policy, rule check,
  wrapped output, cleanup (deletes only the empty, old, anonymous, unchanged user), cron sees context
  reminders. Playwright at 360 px, dark + light: /library?lens=galaxy (seeded: 12 dots, 2 labels, label tap
  zooms + lists its 6 saves, dot tap opens /item/<that save>), /you (Wrapped), /share (3 states), /learn,
  /today, /library?space=inbox, /library?search=1 (field focused): no page errors, no horizontal scroll.
  Screenshot share end to end in Chrome (multipart POST with a PNG): through the service worker and
  through the route fallback → "Saved", preview, outbox holds a `screenshot` save with a JPEG.

### Phase 4 acceptance checks
- [ ] BUILT, NEEDS DEPLOY + WORKER — "Galaxy clusters are labelled and open the right saves": layout and
  labelling tested in pytest (deterministic with the seed, topics separate, fallback labels, over-budget
  path); the lens verified in the browser with a seeded layout (labels drawn, label → zoom, dot → the right
  `/item/<id>`). Needs 0006 applied, the worker redeployed (numpy) with `CLAUDE_FAST_MODEL`, and 5+ processed
  saves (or `select stash.maybe_galaxy('<device id>')` once after 0006 for an owner who already has them).
- [ ] BUILT, NEEDS DEPLOY + WORKER + SIGNED APK — "Sharing a screenshot of a post creates a save filed in the
  right Space": share → save sheet → outbox → upload path verified in Chrome; the worker's vision path
  tested with a stubbed model (image block sent, creator/caption read, filed into the suggested Space at
  confidence ≥ 0.75, Inbox below). Needs 0006 (upload policy), the worker deploy, and Android **1.1.0 signed
  with the owner's key** (1.0.0 only accepts text shares).

### Owner setup for Phase 4 (after Phase 2/3's lists)
1. Apply 0004, 0005, then `supabase/migrations/0006_delight.sql`.
2. Redeploy the worker (`gcloud run deploy …`; the image now installs numpy). No new env vars.
3. Deploy the web app. No new Vercel variables.
4. Push the branch → the workflow publishes the unsigned 1.1.0 build → `./sign.sh stash-release.jks password.txt`
   → commit `android/releases/Stash-1.1.0.apk` → push → release `stash-android-v1.1.0` + e2e.
5. On the phone: update through Obtainium, then share a screenshot of a post (gallery → Share → Stash).

### Decisions added in Phase 4
| Topic | Decision | Why |
|---|---|---|
| Identity | Created on the phone by `ensureSession()` (one shared in-flight call, skipped on /design, /c, /offline and for crawler user agents, backed off 30 s after a failure); every Supabase REST/Storage request waits for it through a session-aware fetch; proxy.ts only refreshes | proxy.ts made a user per GET (link previews, bots: ~50 users). Headless browsers still count as users so `scripts/e2e-smoke.mjs` works |
| Cleanup | Daily: anonymous users > 3 days old with no saves, no non-Inbox Space, no push subscription and settings never changed | Only empty identities; the project's other app has no anonymous users |
| Share target | POST multipart to `/share/receive` (Next can't put route.ts next to app/share/page.tsx); the service worker keeps the image in Cache `stash-share-inbox` and redirects to `/share?shared-image=<id>`; before the SW is installed the route hands the image back in a tiny page (nothing stored server-side) | No identity is needed to accept a share; a text share still lands on `/share?…` (the e2e check holds) |
| Screenshot files | JPEG ≤ 1600 px, < 2 MB (bucket limit) at `stash-thumbs/<uid>/screenshots/<client_id>.jpg`; source_url `screenshot:<client_id>.jpg`; uploaded before the row so the worker never sees a save without its file; one image per share | The worker derives the path from its own user id, so a client can't point it at another folder |
| Galaxy layout | k-means on unit embeddings (seed 7), PCA 2D, members pulled 45 % toward their centre, clusters numbered by size | Semantic groups that also read as groups on a phone |
| Galaxy labels | One fast-model call for all clusters; fallback = top tag (also over budget, without AI spend) | Spec |
| Context reminders | weekend_morning has a fire_at (cron + push); evening_open and learn_open fire on the phone (fired = true, fire_at = now → For you card) | A TWA can't see Wi-Fi or other background context |
| Wrapped colours | Bars neutral, accent only on Applied, Space colours for Spaces | Accent means "act" |
| Motion | `document.startViewTransition` thumbnail → item player (plain navigation without support or with reduce motion); JS animations read `--dur-*` tokens; key idea word reveal in CSS | One source of truth; reduce motion zeroes the tokens |

### Not done / limits (Phase 4)
- Wrapped shares text only (no PNG card).
- Several images in one share: only the first is saved (the Android filter is SEND, not SEND_MULTIPLE).
- Galaxy shows every processed save; it doesn't follow the Space chip filter.
- The view-transition morph targets the item page only (Play opens without it).
- The e2e image-share step is informational (the emulator's media store may not pass the file).

## Phase 2 · The loop — built, waiting for migration 0004 and the worker deploy

### Phase 2 status (2026-11-10)
Built and merged into `claude/magical-turing-jwi3nx`:
- `supabase/migrations/0004_loop.sql` (**not applied**): `daily_queues`, `push_subscriptions`, `settings.timezone`, `reviews.feedback`, job types `grade` / `card_gen`, usage kind `grade`; kept → unreviewed cards due in 3 days; `maybe_synthesize` queues a `synthesize` job when a Space has 5+ ready saves since its last synthesis; leftover items of yesterday's queue get `skip_count + 1`; `mark_queue_done`, `save_push_subscription`; Vault secrets `stash_cron_secret` (random) and `stash_app_url` created if missing; `cron_*` functions (SECURITY DEFINER, callable by `anon`, refuse unless the caller holds the Vault secret); pg_cron `stash-reminders` (*/5) and `stash-daily` (hourly) through `call_app()` (no-op until Vault has both values); `vapid_public_key()`; Realtime on reviews, daily_queues, syntheses. Also revokes the default PUBLIC execute on every `stash` function and re-grants explicitly (needed because `anon` now has schema usage).
  Checked locally against Postgres 16 with Supabase stubs (auth, vault, cron, net, storage): applies twice cleanly; triggers, cron gate, VAPID storage, daily candidates/store and anon lock-out behave as intended.
- Web: Today (hero "Your N for today", streak, 5-segment week progress, Start · N min, Change length 2/6/10/30 saved to settings, For you row, Inbox Quick sort card stack, pull to rebuild, Play ring when due), Play queues `?queue=today|space:<id>|search:<q>|item:<id>` (old params still work) with done marks on today's queue and a finish screen (N done, streak, Start recall), Learn (recall card in its Space colour: hold to answer, Type it, Show me, Show answer, Got it / Partly / Missed always available; SM-2 optimistic; 10 a day; syntheses list with "1 save disagrees · watch it"), Settings → Reminders (queue time, quiet hours, Enable notifications), `/api/push/subscribe`, `/api/cron/reminders`, `/api/cron/daily`, service worker push + notificationclick (VERSION v3).
- Pure modules with tests: `lib/dailyQueue.ts`, `lib/sm2.ts`, `lib/streak.ts`, `lib/quietHours.ts` (58 Vitest tests in total).
- Worker: `grade` and `synthesize` handlers, owner gate + cost guard on every job type, `CLAUDE_SMART_MODEL`; Claude calls use `tool_choice: auto` (forced tool choice is rejected by some models) and treat a reply without the tool call as invalid (one retry). 52 pytest tests.

### Phase 2 acceptance checks
- [ ] BUILT, NEEDS DEPLOY — "The daily 5 builds every morning at my chosen time and respects the length I set": the hourly cron builds it once `settings.queue_time` has passed in `settings.timezone` (the phone keeps the zone current); the length comes from `settings.queue_minutes` (Change length saves it). Today also builds it on open if the cron hasn't yet. Builder unit-tested (length, mix, skips, stable per day). Needs 0003 + 0004 applied and the Vercel deploy.
- [ ] BUILT, NEEDS DEPLOY — "Kept saves turn into recall cards a few days later": the worker writes cards at ingest; keeping a save moves its unreviewed cards to now + 3 days (trigger tested locally); Learn shows due cards of kept saves only. Needs the worker deployed (cards come from the AI) and the migrations.
- [x] BUILT (Phase 1 + Play) — "Applied saves show up on their Space's stats": Play's Applied writes `states.applied_at`; the Space page counts it in the "applied" tile and lists applied saves first. Verify on the phone after deploy.

### Owner setup for Phase 2 (after the Phase 1 list)
1. Apply `0004_loop.sql` (0003 is already applied; 0004 creates the Vault secrets and the two cron jobs by itself).
2. Worker env: add `CLAUDE_SMART_MODEL` (and its price if not 3 / 15 per million tokens); redeploy the worker.
3. Deploy the web app. **No new Vercel variables**: reminders and notifications use only Supabase Vault.
4. On the phone: You → Reminders → Enable notifications (works a few minutes after the first cron run, which creates the push keys).

### Decisions added in Phase 2
| Topic | Decision | Why |
|---|---|---|
| Cron auth | pg_cron sends the Vault secret; routes pass it to `cron_*` SQL functions that check it | No service-role key or cron secret in Vercel; secrets never pass through a person |
| VAPID keys | Generated by the first cron run, stored in Vault; phone reads the public key by RPC | Nothing to configure |
| Daily queue | Same TS builder in the app and the cron route; frozen per local day in `daily_queues` | One source of truth, stable all day |
| Recall cards | Created at ingest, shown only once the save is kept; keeping sets due = +3 days | "Kept saves turn into recall cards a few days later" |
| Grades | Self-grade applies SM-2 in the app; worker grades write the review and apply SM-2 only if the card is still due | A late worker grade can't undo a hand grade |
| Skips | Items left undone in yesterday's queue get `skip_count + 1` (trigger), so they sink | Matches "skipped items sink" without asking anything |

## Phase 3 · Projects, places, import — built on branch, not applied or deployed

Built in parallel with Phase 2 (which owns Today, Learn, reminders/push, syntheses and migration 0004).
Nothing was applied to Supabase, nothing deployed, nothing pushed.

### Phase 3 status (2026-11-10)
- `supabase/migrations/0005_projects_places_import.sql` (written, **NOT APPLIED**; apply after 0004):
  exports status/error/files/updated_at + column guard + `export` job trigger (collection links get their
  slug from the database at once, no worker needed), private bucket `stash-exports` (`<uid>/` policies),
  `stash.get_collection(slug)` + `stash.is_shared_thumb(path)` (security definer, the only Phase 3 functions
  anon can execute; anon gets schema usage but still no table privileges), `stash.nearby_places(lat,lng)`,
  `places.geocoded_at`, `stash.imports`, `settings.triage_daily_limit`, `states.triage_seen_at`,
  `usage.kind` + 'export' (keeps whatever 0004 allows), exports in the Realtime publication.
- Worker: `export` jobs (brief PDF + DOCX written by `CLAUDE_SMART_MODEL`, moodboard PDF, deck PPTX),
  owner gating + budget guard + usage log, retry once; Nominatim geocoding after ingest. 60 pytest tests.
- Web: Space page (kind chip with due date, icon, stats, Play N unwatched + Export, AI card from the latest
  synthesis, Applied first + badge, Edit sheet with kind/colour/icon/due date/description, hold chip → colour),
  Export sheet (4 options, 2 toggles, live progress via Realtime + 5 s poll, Web Share with files, download
  fallback, collection link share/copy/stop sharing with Undo), `/c/[slug]` public page, `/api/exports/[id]`,
  Library lenses (Grid · Map · Galaxy placeholder), `NearbyCheck` in the tabs layout, Enable Nearby in
  Settings, `components/places/NearbyCard.tsx` for Phase 2's For-you row, `/import`, `/triage`.
- tsc, eslint, 61 Vitest + 60 pytest tests, next build: green. Playwright at 360 px (dark + light):
  /library?lens=map, /library?lens=galaxy, /s/<fake id>, /import, /triage, /c/doesnotexist (404 page),
  /settings, /today, /you render with no page errors and no horizontal scroll, without Supabase env;
  Space page, Export sheet and triage cards also checked with cached data.

### Phase 3 acceptance checks
- [ ] PENDING (needs 0005 applied + worker redeployed with the new libraries) — "Exporting a Space of 20 saves
  produces a usable brief PDF in under 2 minutes". Verified locally: the job for 20 saves (fake database,
  real files) writes a PDF + DOCX that open; rendering 20-save brief + moodboard + deck takes ~0.6 s; the
  only other cost is one smart-model call (typically 15–40 s) and a few Storage uploads. Not yet run end to end.
- [ ] PENDING (needs 0005 applied) — "Importing an Instagram data export queues every saved post link".
  Verified locally: parsers read the old (`string_map_data`), newer (`string_list_data`, `label_values`) and
  HTML shapes from fixtures; the ZIP is streamed (only `saved_posts.*` is inflated); in the browser the
  fixture file shows "Found 2 saved posts → Import 2 saves". Not yet run against a real export + Supabase.

### Owner setup for Phase 3 (in order)
1. Apply 0004 (Phase 2), then `supabase/migrations/0005_projects_places_import.sql`.
2. Worker env: add `CLAUDE_SMART_MODEL` (+ optional `CLAUDE_SMART_USD_PER_MTOK_IN/_OUT`), then rebuild and
   redeploy (`gcloud run deploy …`, new Python libraries and fonts). No new Vercel env, no new APK.
3. On the phone: You → Settings → **Enable Nearby** once.

### Decisions added in Phase 3
| Topic | Decision | Why |
|---|---|---|
| Maps | **Leaflet + OpenStreetMap tiles** (spec said Google Maps JavaScript API) | No API key, no billing account, free; pins only need tiles and markers. Attribution shown on the map |
| Geocoding | OpenStreetMap Nominatim in the worker, ≤ 1 req/s, cached, custom User-Agent | Free; Google Places would need a key and billing |
| Collection links | Slug minted by the database trigger (16 URL-safe chars, 96 bits); public page reads through a security-definer function with the anon key | Works without the worker and without a service key on Vercel; only share-safe fields leave the database |
| Shared thumbnails | Storage policy for anon on `stash-thumbs`, limited by `stash.is_shared_thumb()` to saves inside a live collection | Thumbnails stay private otherwise |
| Function privileges | 0005 ends with one explicit block for the whole schema: EXECUTE revoked from PUBLIC/anon/authenticated on every `stash` function, then granted per function. authenticated (every phone, anonymous devices included): search_saves, related_saves, request_reprocess, mark_queue_done, save_push_subscription, vapid_public_key, nearby_places. anon: vapid_public_key, the 7 `cron_*` functions (each checks the Vault secret), get_collection, is_shared_thumb. service_role: all. Nobody else: wake_worker, claim_jobs, sweep, cron_ok, call_app, maybe_synthesize, collection_save_ids, guard and trigger functions | `alter default privileges … in schema` can't revoke the global PUBLIC default, so functions created after a revoke were callable by anyone, and anonymous devices are `authenticated`. Verified on a local Postgres 16 with Supabase stubs (0001–0005 in order, 0005 twice) |
| Brief formats | One export row writes PDF + DOCX (`exports.files`), file_path = PDF | Spec: "PDF and DOCX" |
| Deck and moodboard | No AI; built from key ideas, takeaways and thumbnails | Fast and free; only the brief needs writing |
| Without the smart model | Brief is assembled from the saves' insights | An export never fails for lack of a key |
| Import | Parsed on the phone (fflate, streamed), queued through the existing outbox in batches of 50 per request; `saved_at` = original save date | Offline-safe, big exports don't load into memory, old imports appear in triage |
| Nearby | Checked on app open and when the app comes back after ≥ 10 min, only if permission is already granted; one toast, reminder marked fired | No background geofencing in a TWA (spec) |
| Triage | Oldest first; Let go = archive (Undo 4 s), Keep = kept; a skipped card returns after 30 days | Spec: daily limit 20 |

### Known limits / follow-ups (Phase 3)
- Every imported save is a full ingest job (AI cost per save); the budget guard stops processing when the
  month's budget is reached. A 500-post import at ~$0.01/save ≈ $5.
- Each inserted save's job wakes the worker through pg_net (one call per row on bulk inserts); the worker's
  per-instance lock makes extra calls return `busy`. Could batch wake-ups in a later migration.
- Today's For-you row renders `<NearbyCard />` (merged into Phase 2's `TodayView`); Today links to /import (empty state) and /triage.
- TikTok links from exports are stored as `https://www.tiktok.com/@/video/<id>` (no username in the export);
  the worker rewrites it to the canonical URL after download.


## Previous phase: 1 · Save, process, watch — live on production, waiting for the owner's accounts and keys

### Phase 1 status (2026-10-09)
Merged to `main` (PR #8, merge commit 2885568) and deployed to production (stash-drab-kappa.vercel.app, deployment `dpl_ApM9hJqSB9eGVRcPGSmUo6hkxkyN`).
- `supabase/migrations/0003_pipeline.sql` — **applied**. Job queue + triggers, pg_net wake-up (Vault secrets `stash_worker_url` / `stash_worker_secret`), pg_cron sweep, `search_saves`, `related_saves`, `request_reprocess`, `usage` cost log, `media_trash`, Storage buckets `stash-thumbs` / `stash-voice` with per-user policies, column guard trigger on `saves`. Verified read-only: objects, caller checks, PostgREST exposure, storage policies, cron.
- `worker/` — Cloud Run worker (yt-dlp, ffmpeg 720p, R2, thumbnails, Groq transcription, Claude insights via tool-use JSON, filing, Voyage embeddings, owner gating, cost guard, trash cleanup). 37 pytest tests. **Not deployed** (needs the owner's Google Cloud + R2 accounts and Groq/Voyage keys).
- Web: `/share` instant save sheet (IndexedDB outbox, Space chips, voice note, reminders), Library (Spaces, filters, word+meaning search via `/api/search`, paste a link), item detail (player, takeaways, to-dos, tappable transcript, notes, related, retry, delete with undo), Space page (stats, edit, archive), Play (full-screen pager, keep/archive swipes + undo, 1×/1.5×/2×, captions, hold for 2×, rail), `/api/media/[id]` (owner-checked redirect to a 6-hour signed R2 link), device id + monthly AI spend on You.
- Reviewer subagent pass: 10 findings, all fixed.
- tsc, eslint, 32 Vitest + 37 pytest tests, next build: all green. Screens checked at 360 px (dark).
- `scripts/e2e-smoke.mjs` — end-to-end test against production: device identity → share → outbox flush → Library → item page → delete.

### Test results on production (2026-10-09)
- PASS — every page answers 200 (`/today`, `/library`, `/share`, `/play`, `/you`); `/` redirects to `/today`; `/.well-known/assetlinks.json` public.
- PASS — `/api/search` (POST) and `/api/media/[id]` answer 401 without a session.
- PASS — share sheet shows "Saved" instantly with no session; the save waits in the outbox and shows as a "Saving" tile in the Library.
- BLOCKED — device identity, outbox → server, Library row, item page, delete: anonymous sign-ins are still **off** (`/auth/v1/settings` → `anonymous_users: false`), so the phone gets no session and Supabase answers 401. Re-run `node scripts/e2e-smoke.mjs` once it is on.

### Phase 1 acceptance checks
- [ ] PENDING (needs anon sign-ins + worker + keys) — share a public reel → "Saved" < 1 s (PASSED on production) and key idea within ~60 s.
- [x] PASSED (production browser) — saving works offline / without a session: the save waits in IndexedDB and syncs on `online`/app start, de-duplicated by `client_id`.
- [ ] PENDING (needs R2) — in-app full-screen playback; next item preloaded (2 ahead).
- [ ] PENDING (needs Groq + Voyage) — search a spoken phrase, jump to that moment (`/item/[id]?t=`).
- [ ] PENDING (needs worker) — failed download still shows the save with the embed player (worker falls back to page metadata; player falls back to the official embed).

### Owner setup checklist for Phase 1 (in order)
1. ~~Database step~~ — done.
2. Supabase → Authentication → Sign In / Providers → turn on **Allow anonymous sign-ins** → Save.
3. Open Stash on the phone → You → copy the **Device id**.
4. Create a Cloudflare R2 bucket + API token; a Google Cloud project with billing; Groq and Voyage keys (free tiers). Anthropic key: already have.
5. Deploy the worker (`worker/README.md`), with `OWNER_USER_IDS` = the device id; add the two Vault secrets.
6. Vercel env (Production): `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `VOYAGE_API_KEY`, then redeploy.
7. ~~Merge the PR~~ — done. No new APK needed (web-only change).

### Decisions added in Phase 1
| Topic | Decision | Why |
|---|---|---|
| Worker wake-up | pg_net request held open up to 15 min | Cloud Run only gives CPU while a request is open |
| Filing | Worker only files saves with no Space (`space_id=is.null`) | A Space picked mid-processing must win |
| Client writes | Guard trigger: the phone can't set media paths, caption, source or processing columns | Media paths can't be pointed at other files |
| Budget reached | Save marked failed with a Retry message | Raising the budget + Retry resumes it |
| Video links | `/api/media/[id]` checks ownership + `<uid>/` prefix, 302 to 6 h signed URL | Videos never public |

## Previous phase: 0 · Foundation — done

### Decisions (agreed with the owner)
| Topic | Decision | Why |
|---|---|---|
| Repo | Same repo `Ilias-Ennajmi/gomycode`, folder `stash/` | Reuses Reader's shell + CI; tag prefix `stash-android-v` + title filter keep releases apart |
| Supabase | Project `rvbllpkhwakjuahxyfff` (was paused "Ilias-Ennajmi's Project", restored), schema `stash` | Keeps rss-reader's project untouched; free tier allows 2 active |
| Video storage | Cloudflare R2 (spec said Supabase Storage) | Free tier 10 GB + free egress; Supabase free is 1 GB |
| Thumbs / voice notes | Supabase Storage | Small files |
| Worker | Google Cloud Run (free tier), push-triggered by pg_net + pg_cron sweep (spec said "polls") | Scale-to-zero can't poll; $0 |
| Transcription | Groq whisper-large-v3-turbo (free tier) | Free; EN/FR/AR, Darija best-effort |
| Embeddings | Voyage `voyage-3.5-lite`, 1024 dims (free tokens) | Multilingual, free at this volume |
| Claude | `CLAUDE_FAST_MODEL` / `CLAUDE_SMART_MODEL` env vars, set by owner | Spec |
| Auth | **No login** (owner's request, 2026-10-03; spec said Google). Silent Supabase anonymous identity per device, created by proxy.ts on the first page load; RLS unchanged | Personal app, zero taps; data stays private because the URL is public |
| `/design` | Never creates an identity (no data) | — |
| RLS | Every table has `user_id` + one `owner_all` policy | Simple, uniform RLS |
| Next.js | 16.x — `proxy.ts` replaces `middleware.ts` | Next 16 convention |
| Vercel | Project `stash` (`prj_UsWUJ5MKv6TbjsY7HKAnvqcMscXJ`), root `stash/`, Vercel Authentication off | assetlinks.json must be public |

Estimated running cost at ~300 saves/month: ≈ $2.70 (Claude only). See the approved plan in the session for the breakdown.

### Phase 0 tasks
- [x] Docs copied into `stash/`, PROGRESS.md created
- [x] Next.js 16 scaffold + deps
- [x] Tokens + theming (4 themes, accents, Space palette, pre-paint script)
- [x] Components + `/design`
- [x] Navigation shell + placeholder screens + Settings → Appearance
- [x] Manifest, icons, service worker, native.ts, proxy.ts
- [x] Supabase: restore, migrations 0001/0002, types, advisors
- [x] ~~Google sign-in~~ → replaced by silent anonymous identity (no login screen)
- [x] Vercel project, env, production deploy — https://stash-drab-kappa.vercel.app
- [x] Android shell + workflow
- [x] Signing key generated and sent to owner (SHA-256 6F:E2:EF:39:…:93:B1); assetlinks.json live and public
- [x] Release `stash-android-v1.0.0` + e2e "full screen (verified)"
- [x] Reviewer pass (3 FAILs + concerns fixed), tsc/lint/test/build green

### Acceptance checks (Phase 0)
- [x] PASSED — `/design` shows every token and component; switching theme and accent restyles everything instantly (browser-tested: same document, no reload, persists across reload).
- [x] PASSED — Release `stash-android-v1.0.0` exists with Stash-1.0.0.apk; e2e: launch, share and site link all "full screen (verified)", domain verified, RESULT: PASS.
- [ ] PENDING (owner) — install through Obtainium; key file + password were sent, owner to confirm saved.

## Open items for the owner
- **Required:** Supabase → Authentication → Sign In / Providers → turn on **Allow anonymous sign-ins** → Save. Still off on 2026-10-09; first seen off on 2026-10-03 (auth log: `anonymous_provider_disabled`). Until then the app opens fine but nothing syncs to Supabase.
- Reader's Obtainium entry needs the title filter `^Reader for Android`, because Stash releases now also become the repo's "latest".
- Pre-existing Supabase advisor warnings belong to the other app in `public` (e.g. `public.rls_auto_enable()` callable by anon) — not touched by Stash.

## Known limits carried into Phase 1
- Anonymous identity is per device: clearing site data or a new phone starts empty. Phase 1 worker must only process jobs from the owner's identity (OWNER_USER_IDS env, filled once the phone's identity exists) so strangers can't spend the AI budget. Optional later: link Google for backup (`linkIdentity`).
- Placeholder screens have a teaching line but no action button yet (real actions arrive with the screens).
- Navigating away from inside an open sheet leaves its history entry; one extra back press. Revisit with the save sheet.
- `search_saves()` and the worker queue functions are Phase 1 migrations (0003, 0004).

## Log
- 2026-11-10 — Phase 4 built (migration 0006, galaxy + vision in the worker, Galaxy lens, screenshot share target, Wrapped, context reminders, shortcuts, identity on the phone + cleanup, motion pass, Android 1.1.0 unsigned). Local checks green; nothing applied, pushed, deployed or signed.
- 2026-11-10 — Phase 3 built on the branch (migration 0005 written, worker exports + geocoding, Space/Export/collection, Map lens + Nearby, import, triage). Local checks green; migration not applied, nothing deployed.
- 2026-11-10 — Phase 2 built (loop database, queue builder + SM-2, Today, Play queues, Learn, reminders + Web Push, worker grade/synthesize). tsc, eslint, 58 Vitest, 52 pytest, next build green; Playwright at 360 px (/today, /learn, /play, /settings, /you) renders empty and seeded states with no errors or horizontal scroll. Not applied, pushed or deployed.
- 2026-10-09 — Migration 0003 applied; PR #8 merged; production deployed and smoke-tested (pages, auth walls, offline save PASS; synced steps blocked by anonymous sign-ins being off). Added scripts/e2e-smoke.mjs.
- 2026-10-08 — Phase 1 built (6 commits), reviewed, fixed and pushed. Migration 0003 waiting for approval; worker waiting for Google Cloud + R2.
- 2026-10-03 — Owner asked for no authentication. Removed /login, /auth/*, sign-out and the email allowlist; proxy.ts now creates an anonymous Supabase session on the first page load (document requests only, so prefetches can't create duplicates). Vercel var ALLOWED_EMAILS is now unused.
- 2026-10-02 — Reviewer subagent pass. Fixed: custom-accent ink lost after sync (FAIL), remote settings overwriting newer local choice (FAIL), android/README host text (FAIL); back-gesture stack, service-worker redirect/quota/query issues, proxy (public pages skip auth, getClaims, cookies on redirect, fail closed), min text sizes at 90%, /design coverage (shell, sizes, elevation, ink, easing, scrim), preset Space-clash warning, spacing on 4px steps, back chevrons use history, Supabase Site URL guidance.
- 2026-10-02 — Release stash-android-v1.0.0 published by CI; e2e PASS with "full screen (verified)" on launch, share and site link.
- 2026-10-02 — Production host is `stash-drab-kappa.vercel.app` (auto-assigned by Vercel; changing it later needs a new APK + assetlinks). Verified through Vercel: assetlinks.json → 200 application/json without login; /today → redirects to /login. Android shell host set, CI build green, unsigned APK from 3daa732 signed offline with sign.sh (v2, cert matches assetlinks, aligned) and committed as releases/Stash-1.0.0.apk.
- 2026-10-02 — Local checks: tsc, eslint, 13 unit tests, next build all green. Playwright at 360px: /design, /today, /settings render in light/dark/black with no horizontal scroll and no console errors.
- 2026-10-02 — Supabase: project already held another app's tables in `public` (planet-sport content studio) and the owner's auth user. Stash is isolated in schema `stash`; nothing in `public` was touched. Large migrations timed out through the MCP, so 0001 was applied in chunks (stash_0001a…j); the SQL files in `supabase/migrations/` are the canonical, re-runnable version. Security advisor: no findings for `stash` (pre-existing findings are on the other app's `public` tables). The Supabase type generator only covers `public` here, so `scripts/gen-types.py` writes `lib/supabase/types.ts`.
- 2026-10-02 — Vercel env set: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY (publishable key), ALLOWED_EMAILS.
- 2026-10-02 — Signing key generated (alias `stash`, RSA 4096, 100 years) and sent to the owner; never committed.
- 2026-10-02 — Plan approved. Supabase project restore started. Vercel project `stash` created, Vercel Authentication disabled. Next 16.3.8 scaffolded.
