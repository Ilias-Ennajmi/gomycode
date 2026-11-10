# Stash — progress and decisions

Read this at the start of every session. Updated after every task.

## Current phase: 4 · Delight — built on a branch (migration 0006 written, not applied; worker not deployed; APK 1.1.0 built, not signed)

**Where things are (corrected 2026-11-10):** the Phase 2–4 work **is pushed**: `origin/claude/magical-turing-jwi3nx`
at 21289f5. Migrations 0004, 0005 and 0006 are **not applied** anywhere (0001–0003 are). Production is
**not deployed** with Phases 2–4 (it still runs Phase 1). The review fixes below sit on the local branch
`stash-review-fixes` (from 21289f5), not pushed.

## Free pipeline rework: contract (2026-11-10, branch `stash-free-contract` from 0be0c7f)

Goal: $0 per month, no card, one manual step for the owner (a Gemini key in Supabase Vault).
Written, not applied, nothing deployed: `supabase/migrations/0007_free_pipeline.sql`, regenerated
`lib/supabase/types.ts`, and the contract both builders implement: **`docs/CONTRACT_0007.md`**.

- Worker moves to a Vercel Python function and holds no secret: the database sends a Vault token in
  the wake-up, the Edge Function `stash-worker-proxy` checks it and relays PostgREST / Storage calls.
- Embeddings are 384 dims from an Edge Function (no key); videos live in Storage bucket `stash-video`
  with a retention job; R2 and Voyage go away.
- A save always ends `ready` (`process_step`, `video_state`, `playback`, `embed_url`, `ai_state`);
  insights arrive later when a key appears.
- New tables: `config`, `rate_limits`, `asks`, `highlights`, `backups`, `recovery`; `syntheses.tag`.
- Tested: 0001→0007 applied in order (and 0004–0007 twice) on a local Postgres 16 with the Supabase
  stubs; attack script passed (other device cannot read asks / highlights / backups / recovery /
  videos, call service RPCs or forge the worker token). tsc, eslint and 216 unit tests pass.
- Not verified here (needs the real project): the HNSW index on `vector(384)`, signed upload URLs,
  the admin API turning an anonymous user into one with an email, and whether Auth accepts the
  synthetic `.invalid` email domain. Listed as checks in the contract (section 10).

## Brand and UI refresh (2026-11-10, branch `stash-rebrand` from 64c30f1)

The owner asked for better branding, UX and UI and picked **Bold and playful**. Web changes ship with a
normal deploy; the launcher icon needs **Android 1.2.0** (versionCode 3), built from this branch and
signed with the owner's key like 1.1.0 (`android/README.md`). Nothing applied or deployed here.

### Decisions
- **Mark:** a rounded "S" built from three stacked cards (evolves the old three lime bars), electric
  lime `#c6ff34` on deep ink `#0c0e16`; the cards step from 55% to 80% to full lime so the stack reads.
  It never follows the accent picker. **Wordmark:** "stash" in Rubik ExtraBold, as outlines.
  Source of truth: `scripts/brand-paths.mjs`; `npm run icons` writes `public/icons/*` (any + maskable,
  SVG + 192/512 PNG), `public/favicon.ico`, `public/brand/{mark,lockup-light,lockup-dark}.svg` and the
  Android drawables (`ic_launcher_foreground/background`, `splash`, `ic_notification`). minSdk 26 means
  the adaptive vector icon covers every launcher, so no PNG mipmaps exist or are needed.
  `components/brand/paths.ts` mirrors the paths for the app (test `brand.test.ts`).
- **Type:** Rubik (via next/font, weights 600/700/800) for Hero 44/800, Display 34/800, Title 24/800,
  Heading 19/700, with negative tracking tokens; Manrope stays for body (Body 15/500, Label 14/700,
  Caption 13/600, Tab 12/700). `.text-hero/.text-display/.text-title` always use the display face.
- **Colour:** dark = deep ink (`#0c0e16` / `#161926` / `#202434`), light = warm paper `#f4f2eb`,
  black stays `#000`. Presets: lime `#c6ff34`, coral `#ff7059`, sky `#5cc8ff`, gold `#ffc83d`, mono;
  inks `#0c0e16` / `#f5f4ef`. Light-theme Space colours darkened slightly (teal, green, cyan, sand,
  inbox) so white ink on a solid block reaches 4.5:1. Insight in light `#a8440f` (4.5:1 on raised).
- **New tokens:** `--brand-lime/ink/paper`, `--on-space`, `--tint-amount` (16% light, 22% dark),
  `--accent-line` (accent as a line or dot on the page; the ink in light, where lime is invisible),
  `--type-hero-*`, `--type-*-tracking`, `--dur-press` (120 ms), `--motion-ease-out`, `--press-scale`,
  `--elev-pop`, `--edge` (4px Space edge). Durations now 160 / 260 / 380 ms; spring curve has more
  overshoot. Radii 12 / 18 / 24 / 32 / 32 sheet; buttons and chips are pills.
- **Motion:** utility `press` (squish on press, spring back) on every tappable thing; `rise-in` and
  `pop-in` entrances (fill-mode backwards so drags and press still apply afterwards); named springs in
  `lib/motionTokens.ts` (`sheet`, `fling`, `snap`, `pop`) through `spring(name, motionOK)`, instant with
  reduce motion. Every CSS duration is a token, so reduce motion zeroes them.
- **Colour roles kept:** accent only for act-now (Start, Play, primary, Undo, Play all); selected states
  are ink pills (tab bar, lens toggle, segmented, filter chips); Space colours as solid blocks and tints;
  insight orange only for AI labels.

### What changed per screen
- **Shell:** tab bar with a springing ink pill behind the active icon, Play 60px with a background ring
  (due day: an accent-line outline); headers with a raised back button.
- **Today:** brand tile + date, chunky weekly segments; lime hero ("3 to watch · about 3 min", streak
  pill, Keep going / Start, a length pill); For you cards filled with their Space tint; "4 saves to
  sort" block with a fanned stack of thumbnails and an ink Sort button; recall block.
- **First run (no saves):** new `components/today/Welcome.tsx`: animated lockup, one line on what Stash
  is, "How to save a reel" in three coloured steps with the share illustration, Paste a link, Bring the
  saves you already have.
- **Library:** accent Play in the header, springing lens toggle, the picked Space as a solid colour block
  (count, open), bolder search pill, empty / no-match / filter-empty states with illustrations, Galaxy
  dots bigger; **fixed** Galaxy staying blank when the layout arrived before the saves (the size
  observer now re-attaches once points exist). Map pins bigger.
- **Item:** accent Play, the Space as a solid chip, numbered takeaways in Space-coloured circles,
  Applied (ink, pops) and Remind side by side, to-dos and transcript in cards; "This save is gone" state.
- **Space:** the whole header is a block of the Space colour with big Hero stats; "This Space is gone".
- **Learn:** the recall question sits on its Space colour; answers on the tint; caught-up and empty
  states with illustrations; syntheses as tinted cards with numbered points and a "Try" box.
- **You:** Saved Wrapped as a deep-ink poster (forced dark tokens), Hero numbers, Space bars with
  labels on chips, numbered creators; settings list with icon tiles.
- **Settings:** each section in a card; switches spring.
- **Save sheet:** brand tile with a check that pops, "Back takes you where you were", ink Done; error
  state with an illustration.
- **Play:** Keep / Archive stamps that grow with the swipe and pop when they would commit; the card
  flings off (keep right, archive left) and wobbles back if it doesn't; rail buttons pop when on;
  title-size key idea; solid Space chip; finish screen with the done illustration.
- **Quick sort / Sort old saves:** progress segments, cards drop into the chips when filed or fly left
  when skipped; triage cards fling with a spin and the next springs up.
- **Import, public collection `/c/[slug]`, not-found, offline banner, offline page:** restyled, with the
  lockup on public pages.
- **/design:** new Brand section (lockup, mark, tile sizes 16–96, illustrations, rules); type, radii,
  motion and elevation tables updated.

### Screenshot harness (no backend)
`scripts/fixtures/mock-supabase.mjs` answers REST, RPC, auth and storage signing with invented fixtures
(`scripts/fixtures/data.mjs`); `scripts/screens.mjs` captures the main screens at 412×915 @2x in light
and dark (`ONLY=today,play` to pick). Run the dev server with
`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54399 NEXT_PUBLIC_SUPABASE_ANON_KEY=fixture`. Development
only; nothing in the app imports it.

### Checks
- tsc, eslint (0 warnings), Vitest (216 tests, 23 files; new `palette.test.ts` checks text 4.5:1 on
  background / surface / raised, accent ink 4.5:1 and accent line 3:1 for every preset, Space dots 3:1,
  ink on solid Space blocks 4.5:1 and text / AI text on Space tints 4.5:1, in light, dark and black;
  `brand.test.ts` keeps the paths, icon files, Android colours and version in sync), next build: green.
- No raw colours or arbitrary px sizes in `components/` or `app/` (grep).

### Not done here
- The worker's export renderer (`worker/stash_worker/render.py`) still uses the old paper colour for
  briefs and decks; worth retuning with the next worker deploy.
- Android 1.2.0 is not built or signed (no key here); the old 1.1.0 icon stays until it is.

## Review fixes (2026-11-10, on top of 21289f5)

A reviewer pass over Phases 2–4 found 4 blocking findings and 12 concerns. 0004–0006 were not applied
yet, so they were **edited in place** (no 0007). Verified on a throwaway local Postgres 16 with Supabase
stubs: 0001→0006 in order, then 0004–0006 again, plus an attack script run as role `authenticated`
with a second identity's `auth.uid()` (results in "Checks" below).

| # | Finding | Fix |
|---|---|---|
| F1 | `settings.timezone` took any string; one bad zone made `cron_daily_candidates` and `wrapped()` throw for everyone | 0004: trigger `guard_settings_timezone` (BEFORE INSERT/UPDATE OF timezone) refuses names not in `pg_timezone_names`; the cron CTE joins `pg_timezone_names` and skips unknown zones; `wrapped()` falls back to Africa/Casablanca |
| F2a | Push endpoints could be any https (or http via the table) URL, and the cron route POSTs to each | 0004: check constraint `push_subscriptions_endpoint_host` (https on fcm.googleapis.com, updates.push.services.mozilla.com, *.notify.windows.com, web.push.apple.com, *.push.apple.com). Same list in `lib/pushHosts.ts` (unit-tested), used by `/api/push/subscribe` and the cron sender (`parseTargets`) |
| F2b | Cron candidates covered every identity | `stash.owner_ids()` (service_role only) reads Vault secret `stash_owner_ids` (comma-separated device ids, the same value as the worker's `OWNER_USER_IDS`). `cron_due_reminders` (0004 and 0006), `cron_daily_candidates` and `cron_store_daily` return/store nothing for other ids; **nothing at all while the secret is missing or empty** |
| F2c | Reminders were marked fired after sending, pushes sent one by one | `cron_mark_fired` now claims (returns only the ids it flipped); the route claims first, then sends. Both cron routes send in parallel (`sendPushes`: 8 s per push, 40 s overall, maxDuration 60); the daily route stops building after 25 s (the next hourly run continues) |
| F3a | Worker trusted the row a job pointed at | Ingest/reprocess, grade, synthesize and export fail the job with `owner_mismatch` (no AI call, the other row untouched) unless `job.user_id` owns the save/card/Space/export; an export's Space must belong to the export's owner. Galaxy reads only `job.user_id`'s rows. pytest covers each |
| F3b | RLS checks a row's `user_id`, not the ids it references | 0004: one generic trigger `stash.guard_same_owner()` (SECURITY DEFINER, `zz_same_owner`, runs after the other BEFORE triggers) on saves, insights, transcripts, embeddings, places, states, cards, reviews (card_id), syntheses (space_id + source_save_ids[]), reminders, jobs, exports, usage, daily_queues (save_ids[], done_ids[]); 0006 adds galaxy_points. The worker's own inserts pass (it sets user_id from the row) |
| F3c | `get_collection` published raw save ids | Removed; `/c/<slug>` keys rows by position and signs thumbnails by path only |
| F4 | Learn took the 100 earliest cards, then filtered kept on the phone | `fetchDueCards` filters in the query (`saves!inner(states!inner(kept))`, `saves.states.kept = true`); the client filter stays as a net. Vitest |
| C1 | Collection joins | `get_collection` / `collection_save_ids` / `is_shared_thumb` join the Space on `sp.user_id = e.user_id`; `guard_export_columns` refuses a Space that isn't the caller's |
| C2 | A lost session silently made a new, empty identity | localStorage flag `stash.identity`; with no session and the flag set, `refreshSession()` first; if that fails a new identity is made and a 10 s toast says so (never blocks). **Known risk, still open:** if the refresh token is gone (site data cleared), the old saves stay with the old device id and the worker's `OWNER_USER_IDS` / Vault `stash_owner_ids` must be updated by hand |
| C3 | Time zone kept current only from Settings → Reminders | NativeBoot syncs the device zone once per session, only when different, only once the identity has saves (so the cleanup still sees empty identities as untouched) |
| C4 | Empty queues frozen while items process; late queue times skipped | Neither the app (`shouldStoreQueue`) nor `cron_store_daily` stores an empty queue while saves are queued/processing; the cron builds once local time ≥ queue_time **or** the local hour is 23 |
| C5 | Archived Space kept thumbnails shared | `is_shared_thumb` (and `collection_save_ids`) require `not sp.archived` |
| C6 | A galaxy crash aborted `run()`; a running galaxy job swallowed new embeddings | Galaxy errors back off like other jobs; `run()` catches any per-job exception; `maybe_galaxy` only skips when a job is **queued**, so a running one gets exactly one queued follow-up |
| C7 | A late worker grade could overwrite a newer self-grade | The card update is conditional on the `due_at` it read (`due_at=eq.<old>`) |
| C8 | Cached REST responses survived an identity change; share inbox grew | The page posts `identity-changed` to the service worker (new identity, or a different stored id) and it deletes the REST cache; shared images older than 1 h are deleted on activate and on each share (sw v5) |
| C9 | Raw 160px in Play; Galaxy labels not marked as AI | Token `--play-rail-bottom`; Galaxy labels in the insight colour plus `AI · Group names` |
| C10 | Tag-based syntheses | **Not built** (see limits): needs a tag trigger, a worker path and a Learn view; not small |
| C12 | Cleanup could delete an owner device | `cleanup_anonymous_users` never deletes ids in `stash.owner_ids()` |
| — | Found while testing: 0006 re-read the usage kinds from a constraint Postgres prints as `'{a,b}'::text[]`, so after 0005 the list collapsed to `{galaxy}` and every worker usage insert would have failed | 0005 and 0006 now merge the full known list with both printed forms |

### Checks (review fixes)
- Local Postgres 16 + stubs: 0001→0006 apply, and 0004→0006 again; usage kinds = embed, export, galaxy,
  grade, search, synthesize, transcribe, understand.
- As `authenticated` with device B's uid: unknown time zone refused; `http://…`, `https://evil.example/…`,
  `https://169.254.169.254/…` and a lookalike `fcm.googleapis.com.evil.example` refused (RPC and direct insert);
  FCM and WNS endpoints accepted; a job, reminder, card, review, states row, save-in-Space and daily queue
  pointing at device A's save/Space/card refused; an export of A's Space refused; B's own rows still insert;
  `owner_ids()` not executable. As service_role: the worker's inserts for A pass, a mis-owned usage row fails.
- Cron: without `stash_owner_ids` both candidate functions return 0 rows; with it only A's reminders;
  `cron_mark_fired` twice → 1 then 0; hour-23 rule builds at 23:xx local with a 23:59 queue time and not at
  12:xx; empty store while processing → false, for a non-owner → false, after ready → true; cleanup keeps an
  empty owner device and deletes it once it's no longer listed; `wrapped()` and the candidates survive a bad
  zone written behind the trigger's back; galaxy: one running + 7 new embeddings → exactly one queued job.
- Grants: `owner_ids`, `guard_same_owner`, `guard_settings_timezone`, `cleanup_anonymous_users`:
  not executable by anon/authenticated, executable by service_role.
- tsc, eslint, Vitest (160 tests, 21 files), pytest (104), next build: green.

### Owner setup added by the review fixes
- **Add Vault secret `stash_owner_ids`** = your device id (Settings → This device, or You; several ids
  comma-separated, the same value as the worker's `OWNER_USER_IDS`). SQL editor, after 0004:
  `select vault.create_secret('<device id>', 'stash_owner_ids', 'Stash owner devices');`
  Until it exists, reminders and the daily queue are never pushed or built by the cron (Today still builds
  the queue on open).

## Phase 4 · Delight — built, waiting for 0004–0006, the worker deploy and the signed APK

### Phase 4 status (2026-11-10)
Built on the Phase 4 worktree branch (from `claude/magical-turing-jwi3nx` @ d5ae4f8) and later pushed
(see the correction at the top). Not applied or deployed.
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
1. Apply 0004, 0005, then `supabase/migrations/0006_delight.sql`. Then add the Vault secret
   `stash_owner_ids` = your device id (see "Owner setup added by the review fixes").
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
- Tag-based syntheses (spec: a tag reaching 5+ saves) are not built: the schema allows them
  (`syntheses.space_id` null + `topic`), but it needs a trigger on `insights.tags`, a worker path that
  selects saves by tag and a place in Learn to show them. Space syntheses work.
- Losing the session's refresh token (site data cleared) still means a new, empty identity; the app now
  says so, but moving the old saves over is manual (see C2 above).
- Running 0004 again after 0006 puts back 0004's `cron_due_reminders` (time reminders only) until 0006
  runs again: apply the files in order.
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
- 2026-11-10 — Review fixes on branch `stash-review-fixes` (from 21289f5): 0004–0006 edited in place (time
  zone guard, push host check, owner ids from Vault, same-owner trigger, collection without save ids, claim
  before send, usage-kind bug), worker owner checks + crash safety + conditional grade, Learn query, push
  allowlist module, identity refresh + SW cache clear, time zone sync, Settings device id. Local checks
  green; nothing applied, pushed or deployed. Correction: the Phase 2–4 branch was already pushed
  (origin/claude/magical-turing-jwi3nx @ 21289f5).
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
