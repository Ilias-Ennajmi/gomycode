# Changelog

## Phase 4 · Delight (2026-11-10)
- Library → **Galaxy**: your saves as dots in their Space colours, grouped by meaning and labelled by topic; pinch or wheel to zoom, drag to pan, tap a label to zoom into its group, tap a dot to open the save; the groups are also a list below the map
- **Screenshots shared to Stash**: share an image from the gallery (Android app 1.1.0, or the installed web app); the AI reads the post in it (who posted it, caption, what it is, places) and files it like a reel
- You → **Saved Wrapped**: saved / watched / applied for the month, top Spaces, top creators, previous months, Share my month
- **Context reminders**: Weekend morning, Next evening in Stash, When I open Learn
- Long-press shortcuts (Play my 5, Search, Inbox) checked end to end; Search focuses the field on a cold start, Inbox filters before the Spaces load
- Motion: the thumbnail grows into the item's player, the key idea arrives word by word when processing finishes, swipes follow the finger and spring back, every duration from the motion tokens (off with reduce motion)
- Identity: the phone creates its own identity once JavaScript runs (link previews and crawlers no longer create users); empty anonymous users older than 3 days are removed daily
- Android app **1.1.0** (versionCode 2): screenshots share target (SEND image/*, POST multipart). Needs signing with the owner's key before release
- Worker: `galaxy` jobs (PCA + k-means, one AI call for labels), screenshots read with Claude vision; numpy added

## Phase 3 · Projects, places, import (2026-11-10)
- Project Spaces: due date, icon, description; "Project · due 30 Oct" chip in the Space colour; Applied saves first with a badge; "What these saves say" card (latest synthesis); hold the chip (or any Space chip in the Library) to change its colour
- Export a Space: creative brief (PDF and Word, written by the AI from your saves, optional transcript quotes), moodboard (PDF of key frames), reference deck (PowerPoint, one slide per idea), shared collection (read-only web link at `/c/…`); live progress, then the Android share sheet
- Library lenses: Grid, Map (OpenStreetMap, pins in Space colours, Nearby sorts by distance) and Galaxy (Phase 4)
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
