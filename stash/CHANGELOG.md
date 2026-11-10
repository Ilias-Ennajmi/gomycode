# Changelog

## Phase 3 · Projects, places, import (2026-11-10)
- Project Spaces: due date, icon, description; "Project · due 30 Oct" chip in the Space colour; Applied saves first with a badge; "What these saves say" card (latest synthesis); hold the chip (or any Space chip in the Library) to change its colour
- Export a Space: creative brief (PDF and Word, written by the AI from your saves, optional transcript quotes), moodboard (PDF of key frames), reference deck (PowerPoint, one slide per idea), shared collection (read-only web link at `/c/…`); live progress, then the Android share sheet
- Library lenses: Grid, Map (OpenStreetMap, pins in Space colours, Nearby sorts by distance) and Galaxy (coming in Phase 4)
- Places found in saves get map coordinates automatically
- "Next time I'm nearby" reminders are checked when the app opens (Settings → Enable Nearby; never asks on its own)
- Import your Instagram Saved and TikTok Favorites from their data downloads: duplicates skipped, works offline, history kept
- Sort old saves: one old, unwatched save at a time, Let go (with Undo) or Keep, swipe left or right, 20 a day
## Phase 2 · The loop (2026-11-10)
- Today: "Your 5 for today" built at your chosen time and length (2, 6, 10 or 30 min), streak and weekly progress, For you (pattern spotted, reminders that fired, an old save worth another look), Inbox quick sort, pull to rebuild
- Play: today, Space, search and single-item queues; keep, archive (Undo), applied; finish screen with streak and Start recall
- Learn: recall cards from kept saves, answered out loud, typed or self-graded; SM-2 scheduling, 10 a day; syntheses with agreements and the saves that disagree
- Reminders: notifications for Tonight / This weekend / Pick a date, respecting quiet hours; Settings → Reminders
- Worker: grades recall answers, writes Space syntheses; Claude calls no longer force a tool choice
- Database: daily queues, push subscriptions, kept saves schedule their cards, syntheses queued automatically, cron jobs with secrets kept in Supabase Vault

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
