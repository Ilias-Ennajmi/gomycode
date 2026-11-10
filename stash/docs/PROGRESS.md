# Stash — progress and decisions

Read this at the start of every session. Updated after every task.

## Current phase: 1 · Save, process, watch — live on production, waiting for the owner's accounts and keys

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
