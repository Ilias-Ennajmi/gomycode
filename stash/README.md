# Stash

Save Instagram, TikTok and YouTube videos and web articles, watch or read them in the app, remember them and use them.
A personal app: a Next.js website on Vercel, wrapped in a small Android app (a Trusted Web
Activity) that installs from GitHub Releases and keeps itself up to date through Obtainium.

- What to build: [docs/SPEC.md](docs/SPEC.md)
- How the Android app is packaged and released: [docs/ANDROID_PLAYBOOK.md](docs/ANDROID_PLAYBOOK.md) and [android/README.md](android/README.md)
- Where things stand: [docs/PROGRESS.md](docs/PROGRESS.md)

## Where it runs

| Piece | Where |
|---|---|
| Website | Vercel project `stash`, `https://stash-drab-kappa.vercel.app` |
| Database | Supabase project `rvbllpkhwakjuahxyfff` (schema `stash`) |
| Android app | GitHub Releases tagged `stash-android-v…`, titled "Stash for Android …" |

## Install on your phone (Obtainium)

1. Install **Obtainium** from github.com/ImranR98/Obtainium.
2. In Obtainium tap **Add app** and paste `https://github.com/Ilias-Ennajmi/gomycode`.
3. Leave **Include prereleases** off.
4. Set **Filter release titles by regular expression** to `^Stash for Android`. If it asks for
   an APK filter, use `Stash-.*\.apk`.
5. Tap **Add**, then **Install**. Obtainium checks GitHub for new versions and offers them as updates.
6. Chrome must be installed (it nearly always is).

Without Obtainium: open the latest "Stash for Android" release on your phone, download the
APK and allow installing from the browser.

## No login

Stash has no sign-in screen. The first time your phone opens it, the app itself (its
JavaScript, never the server) silently creates a private, anonymous identity for that phone and
keeps it in a cookie. Link previews and crawlers never get one; empty anonymous identities older
than 3 days are deleted every night (pg_cron `stash-cleanup-anonymous`). Row-level security keeps
every row private to that identity: someone else who opens the address gets their own empty
space, never your saves.

Good to know: clearing Chrome's data for the site, or a new phone, starts a new empty identity,
unless you made a **recovery code** first (next section).

## Move to a new phone, and backups

- **Settings → Move to a new phone → Create a recovery code.** The code (20 letters and digits) is
  shown once, with a Copy button and a QR. Keep it in a password manager or on paper: anyone with
  it can open your Stash, and nobody can bring your saves back without it. Stash stores only a
  fingerprint of it. Making a new code switches the old one off.
- **On the new phone:** open Stash → **I have a recovery code** (on the first screen, or in
  Settings) → type the code or scan the QR. The phone becomes the same Stash, with every save.
  Saves made on that phone before stay with its old identity, and the app says so first.
- Too many wrong tries from one connection are blocked for an hour; five new codes a day at most.
- **Settings → Backups** lists the weekly copies (every Sunday, the last four kept): one JSON file
  with saves, summaries, transcripts, Spaces, cards and highlights. Tap to download.

## Setup: what has to be switched on

**Settings → Setup** shows it in plain words: this phone is connected, processing is running, this
phone is an owner's phone, an AI key is added, and how much of the video space is used.

The website itself needs only two values (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
Everything else lives in Supabase and is set up once by whoever deploys it
([docs/CONTRACT_0007.md](docs/CONTRACT_0007.md), section 9, and `worker/README.md`).

**The one step for the owner:** get a free key at Google AI Studio, then in the Supabase dashboard
open **Vault** and add a secret named `stash_gemini_api_key` with the key as its value. Until then
saves still play and can be searched; their summaries fill in by themselves a few minutes after
the key is added. The key never reaches the phone or the website.

## How a save plays

| The save has | What you see |
|---|---|
| a stored copy (Supabase Storage, bucket `stash-video`) | the video itself, through a 6-hour link the phone signs with its own session |
| no copy, but an official player | the TikTok / Instagram / YouTube (no-cookie) player inside Stash, sandboxed, with **Open in …** next to it |
| neither | a card with the key idea and **Open in …** |
| an article | a reading view: key idea, takeaways, the text; **Open the article** |
| a screenshot | the image |

Only those three players can ever be framed: the database checks the address, the app checks it
again, and the site's Content-Security-Policy allows frames from those three hosts only.

**One-time switch (only if the app can't save):** Supabase dashboard → project
*Ilias-Ennajmi's Project* → **Authentication → Sign In / Providers** → turn on
**Allow anonymous sign-ins** → Save.

## Run it locally (developers)

Needs Node 22+.

```bash
cd stash
cp .env.example .env.local      # fill in the Supabase URL + publishable key
npm install
npm run dev                     # http://localhost:3000
```

Checks: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.

Database changes are SQL files in `supabase/migrations/`, applied in order. After a column
change, update `scripts/gen-types.py` and run `python3 scripts/gen-types.py`.

## Reminders, the daily queue and notifications (no keys to set)

Supabase runs two scheduled jobs (pg_cron) that call the website:

| Job | When | Route | What it does |
|---|---|---|---|
| `stash-reminders` | every 5 minutes | `POST /api/cron/reminders` | Sends a notification for each reminder that is due, unless it's your quiet hours (it waits until they end) |
| `stash-daily` | every hour | `POST /api/cron/daily` | Once your daily queue time has passed (Settings → Reminders, in your phone's time zone), builds "Your 5 for today" and notifies you |

**There is nothing to set in Vercel for this.** Every secret lives in Supabase Vault and never
passes through a person:

- `stash_cron_secret` — created at random by migration `0004_loop.sql`. pg_cron sends it as
  `Authorization: Bearer …`; the website doesn't know it, it hands the token to database
  functions that compare it with Vault and refuse anything else.
- `stash_app_url` — the website address the jobs call (`https://stash-drab-kappa.vercel.app`),
  also set by the migration. If the address ever changes:
  `select vault.update_secret((select id from vault.secrets where name = 'stash_app_url'), 'https://new-address');`
- `stash_vapid_public` / `stash_vapid_private` — the Web Push key pair. The first reminders run
  generates them and stores them in Vault. The phone reads only the public key.
  (To use your own pair instead, run `npx web-push generate-vapid-keys` and, before the first
  run, `select vault.create_secret('<public>', 'stash_vapid_public'); select vault.create_secret('<private>', 'stash_vapid_private');`.)

To get notifications on the phone: Stash → You → Reminders → **Enable notifications**.
The Android app shows them as normal app notifications.
## Pages added in Phase 3

| Address | What it is |
|---|---|
| `/s/<space>` | A Space: kind and due date, stats, Play unwatched, **Export**, the AI card, Applied first |
| `/library?lens=map` | Map of saved places with **Nearby** |
| `/import` | Bring your Instagram Saved and TikTok Favorites from their data downloads |
| `/triage` | Sort old saves, one card at a time (20 a day) |
| `/c/<link>` | A shared collection: public, read-only, never creates an identity |
| `/api/exports/<id>` | Owner-checked, 10-minute link to a finished export file |

**Map data:** the Map uses [Leaflet](https://leafletjs.com) with tiles and place search from
**© OpenStreetMap contributors** (ODbL). No API key and no cost. The attribution is shown on
the map, as the OpenStreetMap tile and Nominatim usage policies require. The worker asks
Nominatim for at most one place per second, with its own User-Agent, and remembers answers.

## Phase 4: Galaxy, screenshots, Wrapped

| What | How it works |
|---|---|
| **Galaxy** (`/library?lens=galaxy`) | Once 5 saves are processed, the worker groups them by meaning and names each group (a `galaxy` job, re-run after every 5 new saves). Pinch or wheel to zoom, drag to pan, tap a label to zoom into a group, tap a dot to open the save. |
| **Share a screenshot** | In the gallery, open a screenshot of a post and tap **Share → Stash**. The image stays on the phone until it has an identity and a connection, then uploads to your private folder (`stash-thumbs/<you>/screenshots/`). The worker reads it (creator, caption, what it is, places), files it into a Space and makes it searchable. Needs Android app **1.1.0** (below). The installed web app takes up to 10 images in one share (each becomes a save); the Android shell still sends one at a time until it gets a "send several" filter in a later APK. |
| **Saved Wrapped** (top of You) | Saved, watched and applied this month, your top Spaces and creators, older months with the arrows, **Share my month as a picture** (a PNG through the share sheet; downloaded where files can't be shared). |
| **Context reminders** | Remind me → *When it fits*: Weekend morning (a notification Saturday or Sunday at 9), Next evening in Stash, When I open Learn (shown when that happens, then under For you). |
| **Shortcuts** | Long-press the app icon: Play my 5, Search, Inbox. |

**Android app 1.1.0 needs signing.** Screenshot sharing is a change to the Android shell (a new
share target), so it needs a new APK. The build is ready (versionCode 2, versionName 1.1.0);
after the branch is pushed, the workflow publishes the unsigned build, then sign it with your
key exactly as in [android/README.md](android/README.md) (`./sign.sh stash-release.jks password.txt`),
commit `android/releases/Stash-1.1.0.apk` and push. Obtainium then offers the update. Until then,
link sharing keeps working in 1.0.0; only images need 1.1.0.

**Android app 1.2.0: the new icon.** The rebrand changes the launcher icon, the splash and the
status bar colours, which live in the Android shell, so it is a new APK (versionCode 3,
versionName 1.2.0, everything from 1.1.0 included). Sign and publish it the same way
(`android/releases/Stash-1.2.0.apk`). The web app's new look ships with a normal deploy; only
the icon on the home screen waits for 1.2.0.

## Secrets

Nothing secret lives in this repository. The browser only gets the Supabase URL and the
publishable key; row-level security keeps every row private to its owner. API keys live in
Supabase Vault and never leave Supabase: not in Vercel, not in the worker's environment, not on
the phone. The Android signing key is kept by the owner, never in git or GitHub.
