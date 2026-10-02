# Stash

Save Instagram and TikTok videos, watch them in the app, remember them and use them.
A personal app: a Next.js website on Vercel, wrapped in a small Android app (a Trusted Web
Activity) that installs from GitHub Releases and keeps itself up to date through Obtainium.

- What to build: [docs/SPEC.md](docs/SPEC.md)
- How the Android app is packaged and released: [docs/ANDROID_PLAYBOOK.md](docs/ANDROID_PLAYBOOK.md) and [android/README.md](android/README.md)
- Where things stand: [docs/PROGRESS.md](docs/PROGRESS.md)

## Where it runs

| Piece | Where |
|---|---|
| Website | Vercel project `stash`, `https://stash-drab-kappa.vercel.app` |
| Database, sign-in | Supabase project `rvbllpkhwakjuahxyfff` (schema `stash`) |
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

## One-time setup: Google sign-in (about 5 minutes)

Stash signs you in with Google through Supabase. Only the email in `ALLOWED_EMAILS` (Vercel)
can get in.

1. Open **console.cloud.google.com** and create a project (or reuse one).
2. **APIs & Services → OAuth consent screen**: choose *External*, app name `Stash`, your
   email as support and developer contact. Add your Gmail under **Test users**. Leaving it in
   *Testing* is fine for a personal app.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**, name `Stash`.
   - **Authorized redirect URIs**: `https://rvbllpkhwakjuahxyfff.supabase.co/auth/v1/callback`
   - Create, then copy the **Client ID** and **Client secret**.
4. Open **supabase.com/dashboard** → project *Ilias-Ennajmi's Project* →
   **Authentication → Sign In / Providers → Google**: turn it on, paste the Client ID and
   secret, save.
5. Same project → **Authentication → URL Configuration**:
   - **Site URL**: `https://stash-drab-kappa.vercel.app`
   - **Redirect URLs**: add `https://stash-drab-kappa.vercel.app/auth/callback` (and
     `http://localhost:3000/auth/callback` for local development).
6. Open the app and tap **Continue with Google**.

## Run it locally (developers)

Needs Node 22+.

```bash
cd stash
cp .env.example .env.local      # fill in the Supabase URL + publishable key and your email
npm install
npm run dev                     # http://localhost:3000
```

Checks: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.

Database changes are SQL files in `supabase/migrations/`, applied in order. After a column
change, update `scripts/gen-types.py` and run `python3 scripts/gen-types.py`.

## Secrets

Nothing secret lives in this repository. The browser only gets the Supabase URL and the
publishable key; row-level security keeps every row private to its owner. API keys for later
phases go in Vercel environment variables (marked sensitive), Supabase secrets and the
worker's environment. The Android signing key is kept by the owner, never in git or GitHub.
