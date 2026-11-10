# Stash — progress and decisions

Read this at the start of every session. Updated after every task.

## Phase 3 · Projects, places, import — built on branch, not applied or deployed

Built in parallel with Phase 2 (which owns Today, Learn, reminders/push, syntheses and migration 0004).
Nothing was applied to Supabase, nothing deployed, nothing pushed.

### Phase 3 status (2026-11-10)
- `supabase/migrations/0005_projects_places_import.sql` (written, **NOT APPLIED**; apply after 0004):
  exports status/error/files/updated_at + column guard + `export` job trigger (collection links get their
  slug from the database at once, no worker needed), private bucket `stash-exports` (`<uid>/` policies),
  `stash.get_collection(slug)` + `stash.is_shared_thumb(path)` (security definer, the only two functions
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
| anon and `stash` | anon gets schema usage; EXECUTE revoked from PUBLIC on every function, re-granted to authenticated/service_role; anon may run only the two collection functions | Needed so PostgREST can serve the public page; nothing else opens up |
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
- Today's For-you row should render `<NearbyCard />` (Phase 2 owns Today). Today currently only links to
  /import and /triage from its empty state.
- TikTok links from exports are stored as `https://www.tiktok.com/@/video/<id>` (no username in the export);
  the worker rewrites it to the canonical URL after download.

## Phase 1 · Save, process, watch — built on branch, waiting for the database step and keys

### Phase 1 status (2026-10-08)
Built and pushed to `claude/magical-turing-jwi3nx` (not merged to `main` yet):
- `supabase/migrations/0003_pipeline.sql` — job queue + triggers, pg_net wake-up (Vault secrets `stash_worker_url` / `stash_worker_secret`), pg_cron sweep, `search_saves`, `related_saves`, `request_reprocess`, `usage` cost log, `media_trash`, Storage buckets `stash-thumbs` / `stash-voice` with per-user policies, client column grants on `saves`.
  **NOT APPLIED YET**: two `apply_migration` attempts were cancelled at the approval prompt. Apply it before merging (the new web app reads the new columns).
- `worker/` — Cloud Run worker (yt-dlp, ffmpeg 720p, R2, thumbnails, Groq transcription, Claude insights via tool-use JSON, filing, Voyage embeddings, owner gating, cost guard, trash cleanup). 37 pytest tests. Not deployed (needs Google Cloud + R2 accounts).
- Web: `/share` instant save sheet (IndexedDB outbox, Space chips, voice note, reminders), Library (Spaces, filters, word+meaning search via `/api/search`, paste a link), item detail (player, takeaways, to-dos, tappable transcript, notes, related, retry, delete with undo), Space page (stats, edit, archive), Play (full-screen pager, keep/archive swipes + undo, 1×/1.5×/2×, captions, hold for 2×, rail: Applied/Keep/To task/Note/Remind), `/api/media/[id]` (owner-checked redirect to a 6-hour signed R2 link), device id + monthly AI spend on You.
- Reviewer subagent pass: 10 findings, all fixed (usage rows shape, picked Space kept during processing, outbox race, unique realtime channels, Play waits for fresh data, budget → Retry, TikTok short links, embed audio, private media paths, voice re-record policy).
- tsc, eslint, 32 Vitest + 37 pytest tests, next build: all green. Screens checked at 360 px (dark).

### Phase 1 acceptance checks
- [ ] PENDING (needs DB step + worker + keys) — share a public reel → "Saved" < 1 s (built: local-first, verified offline in the browser) and key idea within ~60 s.
- [x] PASSED (browser) — saving works offline: the save waits in IndexedDB and syncs on `online`/app start, de-duplicated by `client_id`.
- [ ] PENDING (needs R2) — in-app full-screen playback; next item preloaded (2 ahead).
- [ ] PENDING (needs DB step + Groq) — search a spoken phrase, jump to that moment (`/item/[id]?t=`).
- [ ] PENDING (needs DB step) — failed download still shows the save with the embed player (worker falls back to page metadata; player falls back to the official embed).

### Owner setup checklist for Phase 1 (in order)
1. Approve the database step (or paste `supabase/migrations/0003_pipeline.sql` in the Supabase SQL editor).
2. Supabase → Authentication → Providers → turn on **Allow anonymous sign-ins**.
3. Open Stash on the phone → You → copy the **Device id**.
4. Create Cloudflare R2 bucket + token; Google Cloud project; Groq and Voyage keys (free tiers).
5. Deploy the worker (`worker/README.md`), with `OWNER_USER_IDS` = the device id; add the two Vault secrets.
6. Vercel env (Production): `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `VOYAGE_API_KEY`.
7. Merge the PR to `main` → Vercel deploys. No new APK needed (web-only change).

### Decisions added in Phase 1
| Topic | Decision | Why |
|---|---|---|
| Worker wake-up | pg_net request held open up to 15 min | Cloud Run only gives CPU while a request is open |
| Filing | Worker only files saves with no Space (`space_id=is.null`) | A Space picked mid-processing must win |
| Client writes | Column grants: phone writes only space/notes/voice/status/error | Media paths can't be pointed at other files |
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
- **Required:** Supabase → Authentication → Sign In / Providers → turn on **Allow anonymous sign-ins** → Save. Confirmed off on 2026-10-03 (auth log: `anonymous_provider_disabled`). Until then the app opens fine but nothing syncs to Supabase.
- Reader's Obtainium entry needs the title filter `^Reader for Android`, because Stash releases now also become the repo's "latest".
- Pre-existing Supabase advisor warnings belong to the other app in `public` (e.g. `public.rls_auto_enable()` callable by anon) — not touched by Stash.

## Known limits carried into Phase 1
- Anonymous identity is per device: clearing site data or a new phone starts empty. Phase 1 worker must only process jobs from the owner's identity (OWNER_USER_IDS env, filled once the phone's identity exists) so strangers can't spend the AI budget. Optional later: link Google for backup (`linkIdentity`).
- Placeholder screens have a teaching line but no action button yet (real actions arrive with the screens).
- Navigating away from inside an open sheet leaves its history entry; one extra back press. Revisit with the save sheet.
- `search_saves()` and the worker queue functions are Phase 1 migrations (0003, 0004).

## Log
- 2026-11-10 — Phase 3 built on the branch (migration 0005 written, worker exports + geocoding, Space/Export/collection, Map lens + Nearby, import, triage). Local checks green; migration not applied, nothing deployed.
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
