# Stash — progress and decisions

Read this at the start of every session. Updated after every task.

## Current phase: 0 · Foundation — built, waiting for the owner's phone test and go for Phase 1

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
- 2026-10-03 — Owner asked for no authentication. Removed /login, /auth/*, sign-out and the email allowlist; proxy.ts now creates an anonymous Supabase session on the first page load (document requests only, so prefetches can't create duplicates). Vercel var ALLOWED_EMAILS is now unused.
- 2026-10-02 — Reviewer subagent pass. Fixed: custom-accent ink lost after sync (FAIL), remote settings overwriting newer local choice (FAIL), android/README host text (FAIL); back-gesture stack, service-worker redirect/quota/query issues, proxy (public pages skip auth, getClaims, cookies on redirect, fail closed), min text sizes at 90%, /design coverage (shell, sizes, elevation, ink, easing, scrim), preset Space-clash warning, spacing on 4px steps, back chevrons use history, Supabase Site URL guidance.
- 2026-10-02 — Release stash-android-v1.0.0 published by CI; e2e PASS with "full screen (verified)" on launch, share and site link.
- 2026-10-02 — Production host is `stash-drab-kappa.vercel.app` (auto-assigned by Vercel; changing it later needs a new APK + assetlinks). Verified through Vercel: assetlinks.json → 200 application/json without login; /today → redirects to /login. Android shell host set, CI build green, unsigned APK from 3daa732 signed offline with sign.sh (v2, cert matches assetlinks, aligned) and committed as releases/Stash-1.0.0.apk.
- 2026-10-02 — Local checks: tsc, eslint, 13 unit tests, next build all green. Playwright at 360px: /design, /today, /settings render in light/dark/black with no horizontal scroll and no console errors.
- 2026-10-02 — Supabase: project already held another app's tables in `public` (planet-sport content studio) and the owner's auth user. Stash is isolated in schema `stash`; nothing in `public` was touched. Large migrations timed out through the MCP, so 0001 was applied in chunks (stash_0001a…j); the SQL files in `supabase/migrations/` are the canonical, re-runnable version. Security advisor: no findings for `stash` (pre-existing findings are on the other app's `public` tables). The Supabase type generator only covers `public` here, so `scripts/gen-types.py` writes `lib/supabase/types.ts`.
- 2026-10-02 — Vercel env set: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY (publishable key), ALLOWED_EMAILS.
- 2026-10-02 — Signing key generated (alias `stash`, RSA 4096, 100 years) and sent to the owner; never committed.
- 2026-10-02 — Plan approved. Supabase project restore started. Vercel project `stash` created, Vercel Authentication disabled. Next 16.3.8 scaffolded.
