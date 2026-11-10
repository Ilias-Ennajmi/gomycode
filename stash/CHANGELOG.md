# Changelog

## Free pipeline + features, app side (2026-11-10)
- **Costs nothing to run**: the website needs only the Supabase address and public key. The R2 video route and the server search route are gone
- **Videos** play from Supabase Storage through links the phone signs itself (kept until shortly before they end); Play signs the next two ahead so they start at once
- **Every save plays somehow**: the saved copy, or the official TikTok / Instagram / YouTube player inside Stash with a clear "Open in …" button, or a card that opens the original. When a saved copy was cleared or couldn't be made, one quiet line says why
- **Live progress** on a new save: Fetching, Watching, Reading, Filing. The title and picture show within seconds
- **No AI key yet?** Saves still play and can be searched; they say "Summaries turn on once an AI key is added" and fill in by themselves later
- **Search by meaning** without any key: words answer at once, meaning joins a moment later, and search still works on the phone's own copy when offline
- **Ask your saves** (Today, and the sparkle in Library search): a question in, an answer from your saves with the saves it came from as cards
- **Smart groups** in the Library: topics, creators, why you saved it, places. A topic shows what its saves agree on
- **Highlights**: tap a line of a transcript or an article to keep it; turn any highlight into a recall card; all highlights in Learn
- **YouTube and articles**: share or paste any link. Articles get a reading view (key idea, takeaways, the text) instead of a player. Import a list of links (pasted, a file, bookmarks, a YouTube Takeout playlist)
- **Settings → Setup**: what is switched on, in plain words, with the one step left for the owner
- **Move to a new phone**: a recovery code (shown once, with copy and a QR); "I have a recovery code" in Settings and on the first-run screen; weekly backups to download
- **Saved Wrapped** shares as a picture; **Galaxy** follows the Space and filter chips; several screenshots can be shared at once; topic syntheses in Learn
- **Faster**: lighter first load on every screen, Map and Galaxy load only when opened, screens paint from the phone's copy first, the app shell opens instantly offline or on a weak connection

## Brand and UI refresh (2026-11-10)
- New brand, bold and playful: a rounded "S" built from three stacked cards, electric lime on deep ink; a wordmark in Rubik ExtraBold; new app icon, maskable icon, favicon and offline page
- Headlines in Rubik (heavy, softly rounded); body stays in Manrope. Bigger, heavier type scale with a new Hero size for big numbers
- Retuned colours: deep-ink dark theme, warm paper light theme, a punchier lime and brighter coral, sky and gold; every theme × accent checked for contrast in the tests
- Bigger radii, pill buttons, cards with a crisp lift; Spaces as confident colour blocks (Space header, picked chips, For you cards, recall cards)
- Springy motion everywhere through the motion tokens: press feedback on every tap, the tab pill and lens toggle spring between options, swipe stamps that pop, cards fling off on keep / archive / sort and wobble back when a swipe doesn't commit; all off with reduce motion
- Every screen reworked: Today hero, For you, Inbox and recall blocks; Library lens toggle, Space block, search; item page; Space page; Learn; You and Wrapped (a deep-ink poster); Settings in cards; save sheet; Play overlays and finish screen; Quick sort; Sort old saves; Import; the public collection page
- First open with no saves now says hello and shows how to share a reel to Stash, step by step
- Brand illustrations (SVG, theme-aware) for empty, done, search and error states
- Fixed: the Galaxy map stayed blank when the layout loaded before the saves
- Android app **1.2.0** (versionCode 3): the new launcher icon, splash and bar colours. Needs a build and signing with the owner's key

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
