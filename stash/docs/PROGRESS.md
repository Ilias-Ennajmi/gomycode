# Stash — progress and decisions

Read this at the start of every session. Updated after every task.

## Current phase: 0 · Foundation (in progress)

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
| Auth | Supabase Google sign-in, single allowed email (`ALLOWED_EMAILS`) | Personal app |
| `/design` | Public (no data) | Owner can review without signing in |
| RLS | Every table has `user_id` + one `owner_all` policy | Simple, uniform RLS |
| Next.js | 16.x — `proxy.ts` replaces `middleware.ts` | Next 16 convention |
| Vercel | Project `stash` (`prj_UsWUJ5MKv6TbjsY7HKAnvqcMscXJ`), root `stash/`, Vercel Authentication off | assetlinks.json must be public |

Estimated running cost at ~300 saves/month: ≈ $2.70 (Claude only). See the approved plan in the session for the breakdown.

### Phase 0 tasks
- [x] Docs copied into `stash/`, PROGRESS.md created
- [x] Next.js 16 scaffold + deps
- [ ] Tokens + theming (4 themes, accents, Space palette, pre-paint script)
- [ ] Components + `/design`
- [ ] Navigation shell + placeholder screens + Settings → Appearance
- [ ] Manifest, icons, service worker, native.ts, proxy.ts
- [ ] Supabase: restore, migrations 0001/0002, types, advisors
- [ ] Google sign-in (code) + README steps
- [ ] Vercel project, env, production deploy
- [ ] Android shell + workflow
- [ ] Signing key generated and sent to owner; assetlinks.json live
- [ ] Release `stash-android-v1.0.0` + e2e "full screen (verified)"
- [ ] Reviewer pass, tsc/lint/test/build green

### Acceptance checks (Phase 0)
- [ ] `/design` shows every token and component; switching theme and accent restyles everything instantly.
- [ ] Release `stash-android-v1.0.0` exists with the signed APK, and e2e reports "full screen (verified)".
- [ ] Owner installed it through Obtainium and has the key file and its password.

## Log
- 2026-10-02 — Plan approved. Supabase project restore started. Vercel project `stash` created, Vercel Authentication disabled. Next 16.3.8 scaffolded.
