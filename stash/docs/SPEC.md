# Stash — Spec

Source of truth for what to build. Android packaging and releases: `docs/ANDROID_PLAYBOOK.md`.

## Context and goal

You are building **Stash**, an Android app (a web app wrapped in a Trusted Web Activity) that turns saved Instagram and TikTok videos into things I watch, remember and use. I am the first and main user: a marketing manager in Casablanca who saves hundreds of reels and never goes back to them.

**The core loop:** Save → Process → Resurface → Watch → Learn → Apply or Archive. Every screen serves one step of this loop.

**Product principles**

- Every action takes zero or one tap. The app never asks for a decision it can guess.
- I never leave the app to watch. Videos play in our own player, full-screen, with TikTok-level smoothness.
- I pick the **Space** (topic or project). The AI handles everything else invisibly: tags, intent, places, takeaways, flashcards.
- The app comes to me: a daily queue, reminders and resurfacing pull me back at the right moment.
- Success metric: the share of saves that get watched, learned or applied. Every feature should push this up.

**Non-goals for v1:** iOS, multi-user accounts, social features, monetisation, a public release on the Play Store. It is a personal app, released on GitHub Releases and kept up to date on my phone by Obtainium.

**Language:** UI in English. Content (captions, transcripts) may be in English, French, Arabic or Darija, so the AI pipeline must handle all four.

## Tech stack and architecture

Build a Next.js web app on Vercel, wrap it in a TWA Android shell, and release it through GitHub Releases and Obtainium, exactly as `docs/ANDROID_PLAYBOOK.md` describes. Supabase holds the data, and a small Python worker does the downloads.

**How a save flows**

1. The Android app (Next.js in a TWA) saves a link.
2. The backend (Vercel API routes, Supabase with pgvector) stores it and creates a job.
3. The download worker (Python, yt-dlp, ffmpeg) picks up the job and sends audio and caption to the AI services (transcription, Claude, embeddings).
4. The worker stores the video and the insights back in Supabase.
5. Supabase Realtime pushes a live update to the app.

The phone only ever sends a link. The worker does the heavy lifting, and Supabase Realtime pushes the result back so the card fills in live. Only Android shell changes need a new APK; everything else ships with a normal web deploy.

| Layer | Choice | Notes |
| --- | --- | --- |
| Web app | Next.js (App Router, TypeScript), Tailwind on top of CSS-variable tokens | Hosted on Vercel |
| Android | TWA shell copied from Reader's `android/` | Package `io.github.iliasennajmi.stash`, tag prefix `stash-android-v`, release title "Stash for Android" |
| Releases | GitHub Actions build, offline signing, GitHub Releases, Obtainium | Exactly as the playbook |
| Video | Native `<video>`, MP4 720p H.264 with faststart, from Supabase Storage through signed URLs | Vertical pager with CSS scroll-snap; preload the next 2 videos in hidden elements |
| Motion | Framer Motion; View Transitions API for thumbnail to player | Respect `prefers-reduced-motion` |
| Offline | Service worker (playbook step 3.8) plus an IndexedDB queue for saves made offline | Background Sync retries until the save lands |
| Data | Supabase Postgres in schema `stash`, pgvector, Storage, Auth (Google), Realtime | Row-level security on every table |
| Scheduled jobs | Supabase pg_cron + pg_net calling the app's API routes | Daily queue, syntheses, reminders |
| Notifications | Web Push with VAPID keys, shown as app notifications by the TWA's DelegationService | Playbook step 3.9 |
| Worker | Python 3.12, yt-dlp, ffmpeg on Fly.io or Railway | Vercel functions can't run ffmpeg and yt-dlp within their limits; the worker polls `jobs` |
| Transcription | A Whisper-class API behind an interface | English, French, Arabic and Darija |
| Understanding | Claude API: a fast, low-cost model per save, a stronger one for syntheses and exports | Model IDs in env vars `CLAUDE_FAST_MODEL` and `CLAUDE_SMART_MODEL`, set by me |
| Embeddings | Voyage AI or OpenAI behind an interface | Stored in pgvector |
| Maps | Google Maps JavaScript API | Pins in Space colours |
| Icons | lucide-react | One set only |

**Repo layout:** `app/` (routes `/today`, `/play`, `/library`, `/learn`, `/s/[space]`, `/item/[id]`, `/share`, `/settings`, `/design`), `components/`, `styles/tokens.css`, `lib/`, `public/` (icons, `sw.js`, `.well-known/assetlinks.json`), `supabase/` (migrations), `worker/`, `android/`.

**Playback fallback chain:** stored copy in Storage → official embed (TikTok embed player, Instagram oEmbed iframe) → summary and transcript card. Never a dead end.

**What a TWA can't do, and the workaround**

| Not possible in a TWA | Do this instead |
| --- | --- |
| A share sheet floating over Instagram | Sharing opens Stash on `/share`; it saves instantly, and back returns to Instagram |
| Background geofencing | Check "Nearby" when the app opens, plus a daily reminder for saved places |
| Material You wallpaper colours | Accent presets and a custom picker |
| Home-screen widget | Long-press shortcuts: Play my 5, Search, Inbox |
| On-device OCR of the camera roll | I share screenshots to Stash; the server reads them with Claude vision |

## Data model

Create these tables as Supabase migrations in the `stash` schema, with row-level security on every table (owner = `auth.uid()`). The service worker and IndexedDB cache what the app reads offline.

| Table | Key fields | Purpose |
| --- | --- | --- |
| `spaces` | id, name, kind (`topic` \| `project` \| `inbox`), color_token, icon, due_date, sort_order, archived | Topics and projects; one Inbox per user |
| `saves` | id, source_url, platform (`instagram` \| `tiktok` \| `youtube` \| `web` \| `screenshot`), space_id, status (`queued` \| `processing` \| `ready` \| `failed` \| `dead_link`), video_path, thumb_path, duration_s, creator_handle, caption, saved_at, user_note, voice_note_path | One saved item |
| `insights` | save_id, title, key_idea, takeaways (jsonb), actions (jsonb), intent (`learn` \| `try` \| `visit` \| `buy` \| `inspire` \| `fun`), tags (text[]), language, suggested_space_id, confidence | The AI's reading of a save |
| `transcripts` | save_id, segments (jsonb: start, end, text), full_text | Searchable, tappable transcript |
| `embeddings` | save_id, vector (pgvector), model | Semantic search and related saves |
| `places` | save_id, name, lat, lng, address, maps_place_id | Pins on the Map |
| `states` | save_id, watched_at, kept, archived_at, applied_at, skip_count, last_shown_at | Where a save sits in the loop |
| `cards` | id, save_id, prompt, answer, ease, interval_days, due_at | Spaced-repetition recall cards (SM-2) |
| `reviews` | card_id, answered_at, grade, voice_answer_text | Recall history |
| `syntheses` | id, space_id, topic, points (jsonb), disagreements (jsonb), source_save_ids, created_at | Cross-save summaries |
| `reminders` | save_id, kind (`time` \| `place` \| `context`), fire_at, geofence (jsonb), fired | Remind me later |
| `jobs` | id, save_id, type (`ingest` \| `reprocess` \| `synthesize` \| `export`), state, attempts, error, locked_at | Worker queue |
| `exports` | id, space_id, kind (`brief` \| `moodboard` \| `deck` \| `collection`), options (jsonb), file_path, share_slug | Export outputs |

Add a Postgres function `search_saves(query_embedding, text, space_id, filters)` that combines vector similarity with full-text search on transcripts and returns the best transcript segment for each hit.

## Processing pipeline

A save must feel instant on the phone and be fully processed within about 60 seconds in the background.

1. **Capture (phone, under 1 second):** write the save to IndexedDB with status `queued`, show "Saved", then sync the row to Supabase and insert an `ingest` job. Works offline: Background Sync retries until it lands.
2. **Fetch (worker):** resolve the URL, download the video with yt-dlp, extract caption, creator, duration and thumbnail. Transcode to 720p H.264 MP4 with faststart, upload to Storage. On failure, retry 3 times with backoff, then mark `failed` and fall back to the embed.
3. **Transcribe:** extract audio with ffmpeg and send it to the transcription API. Keep timestamped segments.
4. **Understand:** one Claude call with caption, transcript and my existing Space names. Return strict JSON matching the `insights` schema plus 1–3 recall cards and any places. Validate the JSON; reprocess once if invalid.
5. **File:** if I picked a Space, keep it. Otherwise use the suggested Space when confidence is 0.75 or higher, else leave it in Inbox.
6. **Embed:** embed the title, key idea and transcript, store the vector, then compute the 5 most related saves.
7. **Notify:** set status `ready`. Realtime updates the card; the shimmer turns into the key idea.

**Claude prompt rules for step 4**

- Write the key idea as one actionable sentence of 16 words or fewer, in English, whatever the source language.
- Takeaways: exactly 3 bullets. Actions: only if the video truly contains something to do.
- Never invent facts that are not in the caption or transcript. If the audio is music only, say so and rely on the caption and on-screen text.
- Places only when a real, named venue is mentioned.

**Syntheses:** run a `synthesize` job when a Space or a tag gains 5 or more saves since the last synthesis. Use the stronger model (`CLAUDE_SMART_MODEL`); return points of agreement, disagreements with the save IDs behind each, and one suggested action.

**Cost guard:** log tokens and minutes per save. Show the monthly total in Settings. Cap processing at a monthly budget I set.

## Design system and theming

Build every colour, type style and shape as a CSS variable in `styles/tokens.css`, mapped into Tailwind. No component may use a raw hex value; that is what makes the theme and colour picker possible. Phase 0 starts with a `/design` page that shows every token and component in every theme, for me to approve before any screen is built.

**Colour rules (these give the colours meaning)**

- **Accent = "act now" only:** the Play button, Start, primary buttons, Undo, due items. Nothing else.
- **Insight orange = AI only:** labels like "AI · Pattern spotted" and syntheses.
- **Space colours = categorisation:** each Space has one colour that follows its saves everywhere (chips, thumbnail top edge, Play label, Map pins, recall cards).
- Active tab and selected states use the primary text colour, not the accent.

**Core tokens**

| Token | Dark | Light |
| --- | --- | --- |
| background | #0E0E10 | #F6F4EF |
| surface | #17171B | #FFFFFF |
| surfaceRaised | #1F1F25 | #EFECE6 |
| border | #2A2A31 | #E4E1DA |
| textPrimary | #F2F0EB | #141413 |
| textSecondary | #B4B1AA | #5E5B55 |
| textTertiary | #9B988F | #6E6B65 |
| accent (default Lime) | #C8F05A | #C8F05A |
| onAccent | #0E0E10 | #0E0E10 |
| insight | #FF9C66 | #B44A12 |
| danger | #FF6B6B | #C62828 |
| scrim over video | #0E0E10 at 80% | same |

**Space palette** (dark value / light value): Violet #B79CFF / #6B4FD8 · Teal #5FD4C0 / #0F8A78 · Amber #F2B64B / #8A5A00 · Blue #7FA8FF / #2F5FD0 · Rose #FF8FB1 / #C0365F · Green #8ED47A / #3C7D2B · Cyan #6FD3E8 / #0B7A90 · Sand #D9C3A0 / #7A6440 · Inbox grey #B4B1AA / #5E5B55. Each Space also gets a tint (its colour at 15% over surface) for chip backgrounds.

**Typography:** Bricolage Grotesque for display, Manrope for everything else (loaded with next/font). Scale: Display 30/700, Title 22/700, Heading 18/700, Body 15/500, Label 14/600, Caption 13/500. Nothing smaller than 13px, except tab labels at 12px. Respect the system font scale.

**Shape and spacing:** spacing steps of 4px (4, 8, 12, 16, 20, 24, 32). Radii: 10 small, 14 buttons and cards, 20 large cards, 24 hero, 28 bottom sheets. Every tap target at least 48px; inputs at least 16px font so the page never zooms. Icons from lucide-react only, 24px, 2px stroke. No emoji in the UI. Safe-area padding on every bottom bar (playbook step 3.7).

**Theme and colour picker (Settings → Appearance)**

- **Theme:** System (default), Dark, Light, Black (AMOLED, background #000000). Switching is instant, with no reload.
- **Accent colour:** presets Lime (default), Coral #FF7A59, Sky #6CC4FF, Gold #F5C542, Mono (text colour), plus a custom colour picker. The app computes `onAccent` automatically for 4.5:1 contrast and warns if the chosen accent is too close to a Space colour.
- **Space colours:** pick from the Space palette when creating or editing a Space. Long-press a Space chip to change it.
- **Display:** text size (90–130%), grid density (2 or 3 columns), reduce motion, haptics on/off.
- A live preview card at the top of Appearance shows a mini Today card and a Space chip in the current choices.
- Apply the theme with a `data-theme` attribute and CSS variables on `<html>`, set by a tiny inline script before first paint, so there is never a flash of the wrong theme. Save choices in localStorage and in a `settings` row in Supabase so they follow me to a new phone.
- Update `<meta name="theme-color">` when the theme changes. In the Android shell, set `barColor` to the light background and `barColorDark` to the dark background, so the status bar follows the system theme.

## Screens, page by page

Match the mockup canvas for layout and hierarchy. Where this text and the canvas disagree, this text wins.

### Navigation shell

- Bottom bar with 5 slots: **Today · Library · Play (centre) · Learn · You**. Play is a 56px accent circle raised 18px above the bar.
- Play shows a soft accent ring when anything is due today.
- Play opens with the queue of wherever I am: the daily 5 from Today, the current Space or search results from Library, a single item from detail.
- The bar hides inside Play, the save sheet and full-screen flows.

### 0 · Save sheet (Android share target)

- The Android shell declares a SEND `text/plain` intent filter, and the web manifest a `share_target` (GET `/share` with title, text and url), as in the playbook. Images (screenshots) use a POST share target.
- Sharing opens Stash directly on `/share`: a compact bottom sheet over a dimmed background, not the full app.
- The sheet says "Saved" with a check within 1 second, before any network call. The save is written to IndexedDB first.
- Below: a preview row (thumbnail, caption, platform, duration, "AI is reading it…").
- "Add to a Space (optional)": my 3 most-used Spaces, 1 AI suggestion from the caption (marked with a spark icon, outlined in its Space colour), and "+ New".
- Two buttons: **Why I saved it** (hold to record a voice note with MediaRecorder, up to 30 seconds) and **Remind me** (Tonight, This weekend, Pick a date, Next time I'm nearby).
- Android back, or tapping outside the sheet, closes `/share` and returns to the source app. Nothing is ever lost.

### 1 · Today

- Header: the date, then "3 of 5 this week" with a 5-segment progress bar, and my initial in a circle that opens You.
- **Hero card** in the accent colour: "Your 5 for today", the streak, 5 thumbnails with their Space colour on the top edge, a **Start · 6 min** button and a **Change length** button (2, 10 or 30 min).
- **For you**: one horizontal row of swipeable cards (AI pattern spotted, place nearby, a reminder that fired, an old save worth another look). Max 5 cards.
- **Inbox** card when unsorted saves exist: "4 saves in your Inbox" and **Quick sort · 30 s**.
- Pull to refresh rebuilds the queue.

### 2 · Play

- Full-screen vertical pager, one video per page, no tab bar. Swipe up for next.
- Top: segmented progress for the queue, a chevron to close (swipe down also closes), a label like "Playing · Marketing · 3 of 5", and 1×/1.5×/2× and captions toggles.
- Right rail with labelled buttons: **Applied**, **To task**, **Note**, **Remind**.
- Bottom band, collapsed: creator, duration, Space chip, and the key idea on one line. Tap expands to the 3 takeaways and the transcript. Thin scrubber at the very bottom.
- Swipe right = Keep (comes back later via spaced repetition). Swipe left = Archive, with an Undo toast for 4 seconds. Long-press = speed up to 2× while held.
- Hints for swipes show only the first 3 sessions.
- Ending a queue shows a finish screen: "5 done", streak, and **Start recall** which opens Learn.

### 3 · Library

- Header: "Library" and a 3-icon lens toggle: **Grid · Map · Galaxy**.
- One horizontal chip row: Inbox (with unsorted count), every Space with its colour dot and count, a divider, then filters (Unwatched, Kept, Applied, Places, Platform).
- Grid: 2 columns (3 in compact density). Each card shows the thumbnail, the Space colour on the top edge, duration, a dot when unwatched, and the AI key idea over the bottom. Long-press previews with sound.
- Map: Google Map with pins in Space colours; tap a pin for a card; "Nearby" sorts by distance.
- Galaxy (Phase 4): saves as dots clustered by embedding similarity, labelled by topic. Tap a cluster to zoom, tap a dot to open it.
- Floating search bar at the bottom: "Search what was said…". Results show the matching transcript line and jump to that moment.

### 4 · Item detail

- Player on top, then: key idea, 3 takeaways, actions with checkboxes ("send to TickTick" through the Web Share API), the tappable transcript, related saves, my note and voice note, the Space and reminder controls, its recall cards.
- Overflow menu: Open original, Reprocess, Move to Space, Delete.

### 5 · Learn

- Header "Learn" and the streak.
- **Recall card**: a question generated from a kept save. Hold the mic to answer out loud; the app transcribes and grades against the key idea (Got it / Partly / Missed). Buttons: **Show me** (plays the video) and **Type it**.
- **Syntheses**: a card per synthesis with the points of agreement, the save count, and "1 save disagrees · watch it".
- Due cards follow SM-2 scheduling. Cap at 10 a day.

### 6 · Space (topic or project)

- Back chevron, a chip with the kind ("Project · due 30 Oct") in the Space colour, the name, an optional description.
- Three stat tiles: saved, watched, applied.
- **Play N unwatched** (accent) and **Export** (outlined).
- AI card: "What these saves say" (latest synthesis).
- Grid of saves, applied first, each with an "Applied" badge.
- Edit sheet: name, kind, colour, icon, due date.

### 7 · Export

- Bottom sheet: "Turn 23 saves into…" with 4 options: **Creative brief** (PDF and DOCX), **Moodboard** (a PDF of key frames), **Reference deck** (PPTX, one slide per idea), **Shared collection** (a read-only web link).
- Toggles: only applied and kept saves; include key quotes from transcripts.
- The export runs as a job, then opens the Android share sheet with the file through the Web Share API.

### 8 · Import and backlog triage

- First-run screen "Bring the saves you already have": Instagram Saved, TikTok Favorites, Screenshots.
- Phase 3 imports from the official data exports: I pick the downloaded ZIP, the app reads `saved_posts` (Instagram) and the favourites list (TikTok) and queues each link.
- Backlog triage: a card stack, one old save at a time, with the AI's Space suggestion and **Let go** / **Keep**. A daily limit of 20 cards keeps it to about 30 seconds.

### 9 · You and Settings

- **Saved Wrapped** for the month: top Spaces, top creators, watched vs saved vs applied.
- Settings: Appearance (see Design system), Reminders (quiet hours, daily queue time), Processing (monthly budget, usage so far), Integrations (TickTick through the Web Share API first), Data (export all as JSON, delete everything).

## UX details, motion and states

These details decide whether the app feels smooth or clunky. Treat them as requirements, not polish.

**Speed budgets**

- Share to "Saved" on screen: under 1 second, offline included.
- Cold start to Today: under 2 seconds on a mid-range phone (the service worker serves the shell from cache).
- Swipe to the next video in Play: first frame in under 150 ms (preload 3 ahead, keep 1 behind).
- Scrolling in Library: no dropped frames at 60 fps. Virtualise long lists and lazy-load thumbnails.

**Motion** (all respect "reduce motion")

- Tapping a thumbnail grows it into the player with a View Transition.
- New saves show a shimmer skeleton; when processing finishes, the key idea fades in word by word.
- Bottom sheets use spring physics. Swipe gestures follow the finger and snap.
- Durations: 150 ms for small changes, 250 ms for screen transitions, 350 ms for sheets.

**Haptics:** `navigator.vibrate(10)` on save, keep, archive, applied and on each recall grade. Off when the setting is off.

**Gestures**

- Every swipe action has a visible button too, for accessibility and discovery.
- Every destructive action shows Undo for 4 seconds instead of a confirmation dialog.
- System back always goes one level up; it never exits the app from an open sheet, item or player. Push a history entry for each (playbook step 3.6).

**States every screen must handle**

- **Empty:** a short line and one action that teaches the main gesture ("Share a reel to Stash to start").
- **Loading:** skeletons shaped like the real content, never a centred spinner.
- **Processing:** the card is usable immediately with the caption; AI fields fill in live.
- **Failed download:** keep the save, show the embed player and a Retry action.
- **Dead link:** keep the stored copy, summary and transcript; mark "Original removed".
- **Offline:** a small banner; saving, browsing cached saves and playing cached videos still work.

**Accessibility**

- An `aria-label` on every icon button so TalkBack reads it; logical focus order; headings marked as headings.
- Contrast at least 4.5:1 for text, 3:1 for large text and icons, in every theme and accent combination.
- Captions available on every video from the transcript.
- The app stays usable at 130% font scale with no clipped text.

## Build phases

Build one phase at a time. At the end of each phase, deploy to Vercel, cut a new Android release if the shell changed, check that CI and e2e are green, update `docs/PROGRESS.md`, and wait for my go before starting the next.

### Phase 0 · Foundation

- Web app scaffold on Vercel, `styles/tokens.css` and the `/design` page, all four themes and the accent presets, the navigation shell with placeholder screens, Supabase schema `stash` with migrations, Google sign-in. Then the Android shell, the signing key and the first release, following every step of the playbook.

- [ ] `/design` shows every token and component; switching theme and accent restyles everything instantly.
- [ ] Release `stash-android-v1.0.0` exists with the signed APK, and e2e reports "full screen (verified)".
- [ ] I have installed it through Obtainium, and I have the key file and its password.

### Phase 1 · Save, process, watch (the MVP)

- Save sheet, the worker (download, transcribe, understand, embed), Library grid with Spaces and filters, item detail, search, Play for a Space or search result.

- [ ] Sharing a public Instagram reel shows "Saved" in under 1 second and a key idea within about 60 seconds.
- [ ] Saving works in airplane mode and syncs later.
- [ ] A video plays inside the app, full-screen, and swiping to the next starts in under 150 ms.
- [ ] Searching a phrase spoken in a video finds it and jumps to that moment.
- [ ] A failed download still shows the save with the embed player.

### Phase 2 · The loop

- Today (daily queue, For you, Inbox quick sort), Play queues with keep, archive, applied and undo, Learn (recall cards with voice answers, SM-2), reminders with notifications, syntheses.

- [ ] The daily 5 builds every morning at my chosen time and respects the length I set.
- [ ] Kept saves turn into recall cards a few days later.
- [ ] Applied saves show up on their Space's stats.

### Phase 3 · Projects, places, import

- Project Spaces with due dates, Export (brief, moodboard, deck, collection link), Map view with Nearby, place reminders that check "Nearby" when the app opens, import from the Instagram and TikTok data exports, backlog triage.

- [ ] Exporting a Space of 20 saves produces a usable brief PDF in under 2 minutes.
- [ ] Importing an Instagram data export queues every saved post link.

### Phase 4 · Delight

- Galaxy view, screenshots shared to Stash and read with Claude vision, Saved Wrapped, context triggers, long-press shortcuts (Play my 5, Search, Inbox), a polish pass on motion.

- [ ] Galaxy clusters are labelled and open the right saves.
- [ ] Sharing a screenshot of a post creates a save filed in the right Space.

## Working rules for Claude Code

**Before coding**

- Start in plan mode. Read this spec and the playbook in full (the playbook's signing-key rules override anything here), list your open questions (no more than 5), and propose the Phase 0 and Phase 1 plan with the file tree.
- Where this spec leaves a choice open (transcription vendor, embeddings vendor, worker host), recommend one with its monthly cost for about 300 saves, and let me decide.

**While coding**

- Small commits, one feature each, with clear messages. Keep a `CHANGELOG.md` and a `README.md` with setup steps a non-developer can follow.
- Secrets never go in the app or the repo. API keys live in Vercel environment variables (marked sensitive), Supabase secrets and the worker's environment; the app only holds the Supabase URL and anon key. Provide a `.env.example`.
- Write unit tests for the queue builder, SM-2 scheduling, the filing rule and the JSON validation; UI tests for the save sheet and Play swipes.
- Use the design tokens everywhere. A screen with a hard-coded colour or font size fails review.
- When a requirement here is technically unwise, say so and propose the alternative before building it.

**At the end of each phase**

- Check the acceptance criteria against the Vercel deploy and the CI e2e results, and report each as passed or failed.
- Tell me whether a new release is waiting in Obtainium or the change is web-only, and give me a short list of what to test by hand on my phone.

**Legal note:** downloading Instagram and TikTok videos goes against their terms. This app is for my personal use only and must not be published. Keep the official embed as the fallback, and keep the downloader isolated in the worker so it can be switched off.
