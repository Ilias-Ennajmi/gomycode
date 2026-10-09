# Changelog

## Phase 1 · Save, process, watch (2026-10-08)
- Instant save from the share sheet, offline-safe, with optional Space, voice note and reminder
- Processing worker: download, 720p video, thumbnail, transcript, key idea + takeaways + to-dos + tags + places + recall cards, auto-filing, embeddings, cost guard
- Library with Spaces, filters and search by what was said; item detail; Space page; full-screen Play feed
- Private video links (signed, short-lived); device id and monthly AI spend on You

## Unreleased — Phase 0 · Foundation
- Next.js 16 web app scaffold in `stash/`.
- Design tokens, four themes (System, Dark, Light, Black), accent presets and custom accent.
- `/design` page, navigation shell with placeholder screens.
- Supabase schema `stash` with row-level security on every table.
- No login: each device silently gets a private anonymous identity.
- Android TWA shell, signing, and the first release `stash-android-v1.0.0`.
