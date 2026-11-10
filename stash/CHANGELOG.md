# Changelog

## Phase 3 · Projects, places, import (2026-11-10)
- Project Spaces: due date, icon, description; "Project · due 30 Oct" chip in the Space colour; Applied saves first with a badge; "What these saves say" card (latest synthesis); hold the chip (or any Space chip in the Library) to change its colour
- Export a Space: creative brief (PDF and Word, written by the AI from your saves, optional transcript quotes), moodboard (PDF of key frames), reference deck (PowerPoint, one slide per idea), shared collection (read-only web link at `/c/…`); live progress, then the Android share sheet
- Library lenses: Grid, Map (OpenStreetMap, pins in Space colours, Nearby sorts by distance) and Galaxy (coming in Phase 4)
- Places found in saves get map coordinates automatically
- "Next time I'm nearby" reminders are checked when the app opens (Settings → Enable Nearby; never asks on its own)
- Import your Instagram Saved and TikTok Favorites from their data downloads: duplicates skipped, works offline, history kept
- Sort old saves: one old, unwatched save at a time, Let go (with Undo) or Keep, swipe left or right, 20 a day

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
