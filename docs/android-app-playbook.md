# Android app playbook (web app → Android app → GitHub Releases → Obtainium)

How Reader (`rss-reader/`) became an Android app that updates itself through Obtainium.
Paste everything below the line into the prompt of a new app, after filling in the blanks.
The working Reader files are referenced as examples. Copy them and rename things instead of
starting from scratch.

---

## Android app: how to package, host, release and update it

Build this app as a **web app first** (Next.js on Vercel). Then wrap it in a small Android
app, a **Trusted Web Activity (TWA)**, so it can be installed from GitHub Releases and kept
up to date by **Obtainium**. Follow these steps in order and keep these rules.

### Blanks for this app

| Name            | Value (fill in)                                | Example (Reader)                 |
| --------------- | ---------------------------------------------- | -------------------------------- |
| App name        | `<AppName>`                                    | Reader                           |
| Folder in repo  | `<app-folder>/`                                | `rss-reader/`                    |
| Package name    | `io.github.iliasennajmi.<app>`                 | `io.github.iliasennajmi.reader`  |
| Site host       | `<project>.vercel.app`                         | `rss-reader-jet.vercel.app`      |
| Start path      | `/<start>`                                     | `/reader`                        |
| Tag prefix      | `<app>-android-v` (unique per app in the repo) | `android-v`                      |
| Brand colour    | `#xxxxxx` (status bar, splash)                 | `#14161B`                        |

Repository: `Ilias-Ennajmi/gomycode`. Reference implementation: `rss-reader/android/`,
`.github/workflows/android.yml`, `rss-reader/public/.well-known/assetlinks.json`.

### Rules (never break these)

1. **The signing key never goes into git, GitHub secrets, or any external storage.** Add
   `*.jks`, `*.keystore` and `keystore.properties` to `.gitignore`. Before every commit, check
   that the staged diff has no keystore file and doesn't contain the key password.
2. **One key per app, forever.** Android only installs an update signed with the same key. Once
   the key is generated, send the `.jks` file and its password to the user straight away with
   SendUserFile, and tell them to save both somewhere safe. The cloud container gets wiped,
   and a lost key means uninstalling and reinstalling the app.
3. **Every release raises `versionCode` by 1** and sets a new `versionName`. Android refuses
   an APK with the same or a lower versionCode.
4. **`assetlinks.json` must match the key.** Its SHA-256 fingerprint must be the release
   certificate's. If it doesn't match, the app shows a browser address bar at the top.
5. **`/.well-known/assetlinks.json` must be public:** no login and no password gate, served
   as JSON over HTTPS on the exact host the app opens.
6. **No force pushes and no destructive git commands.** Work on the session's branch and merge
   to `main` through a PR when the user asks to ship.
7. **Each app in this repo has its own folder, workflow file, tag prefix and release title.**
   That way the Reader app and this one never pick up each other's releases.
8. Don't put model names in commits or files.

### Step 1: branch and folder

- Create the branch (e.g. `claude/<app>-android`) from `main`. Put the web app in
  `<app-folder>/` and the Android shell in `<app-folder>/android/`.
- GitHub Releases belong to the whole repo, not to a branch. That's why each app needs its own
  tag prefix and release title (rule 7).
- A separate repository per app is also fine and makes Obtainium setup even simpler. Ask the
  user which they prefer if it isn't stated.

### Step 2: hosting the website (Vercel + Supabase)

- **Vercel**, team `team_ik4BWoe4YDdJNzZhmUCJjsYd`:
  - Make a new project linked to the GitHub repo, with **Root Directory = `<app-folder>`**.
  - The production branch is `main`: every merge to main deploys automatically, and other
    branches get preview deploys.
  - To put a branch live before merging, use the Vercel MCP `create_deployment` with
    `gitSource {type: "github", org: "Ilias-Ennajmi", repo: "gomycode", ref: <branch>, sha}`
    and `target: "production"`.
- **Database:** Supabase Postgres, with its own schema per app. Use Supabase `pg_cron` +
  `pg_net` for scheduled jobs (calling the app's own API routes), because Vercel Hobby cron
  only runs once a day.
- **Secrets** (API keys, passwords, VAPID keys) go only in Vercel environment variables
  (marked sensitive) and the gitignored `.env.local`. Never commit them or print them.
- The free `*.vercel.app` host is fine for the TWA. If you later switch to a custom domain,
  change `siteHost` in `app/build.gradle` and `assetlinks.json`, then release a new APK.

### Step 3: web side, make the site "app-ready" (do this before the Android shell)

1. **Web manifest** (`app/manifest.ts`):
   - `id`, `name`, `short_name`, `start_url: "/<start>"`, `scope: "/"`, `display: "standalone"`,
     `orientation: "any"`, and `background_color`/`theme_color` = brand colour.
   - Icons: 192 and 512 PNG, a **maskable** 512 PNG and an SVG.
   - Optional: `share_target` (GET `/share` with title/text/url) and `shortcuts`, the same
     ones the Android shell declares.
2. **Viewport** (`app/layout.tsx`): `viewportFit: "cover"`, `themeColor` for light and dark,
   and `appleWebApp.capable`.
3. **Middleware / auth gate:** exclude
   `_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|sw.js|offline.html|\.well-known/`
   from the matcher (see `rss-reader/middleware.ts`).
4. **`public/.well-known/assetlinks.json`:** package name + SHA-256 fingerprint (step 4).
5. **Knowing it runs in the app:** the shell opens `/<start>?source=android&v=<versionName>`.
   Store that in localStorage. Shortcuts and reloads don't carry it, so keep the first value
   (see `rss-reader/lib/native.ts`).
6. **Back gesture:** if navigation lives in React state, push history entries when opening an
   article, pane or dialog, and close them on `popstate`. Otherwise Android's back gesture
   closes the whole app (see `rss-reader/lib/hooks/useHistorySync.ts` and `useBackToClose`).
7. **Native feel:**
   - safe-area padding (`env(safe-area-inset-bottom)`) on bottom bars;
   - `overscroll-behavior` on scroll areas;
   - `-webkit-tap-highlight-color: transparent`;
   - tap targets ≥ 44px; inputs ≥ 16px font (no zoom); no horizontal scroll at 360–390px;
   - `navigator.vibrate(10)` on swipes and pull-to-refresh;
   - a pull-to-refresh on lists.
8. **Offline:** `public/sw.js` registered from the client.
   - Precache the start page + `offline.html`.
   - Network-first with a cached fallback for the main API reads.
   - Stale-while-revalidate for images, with size caps.
   - Bump a VERSION constant whenever the caching rules change (see `rss-reader/public/sw.js`).
9. **Push notifications (optional):**
   - `web-push` with VAPID keys, a `PushSubscription` table, and subscribe/unsubscribe routes.
   - In the app, the shell's `DelegationService` shows them as the app's own notifications,
     and Android 13+ asks for permission through `NotificationPermissionRequestActivity`.
10. **Update banner (optional):**
    - Once a day, read `https://api.github.com/repos/Ilias-Ennajmi/gomycode/releases?per_page=10`.
    - Take the first non-draft release whose tag starts with `<app>-android-v`, compare it with
      the installed `v`, and show "Update available" linking to the release.

### Step 4: the Android shell (`<app-folder>/android/`)

Copy `rss-reader/android/` (all except `releases/`, `build/` and `.gradle/`) and rename:

- `settings.gradle`: `rootProject.name`.
- `app/build.gradle`:
  - `namespace`/`applicationId`, `siteHost`, the launch path in `launchUrl`;
  - `appVersionCode = 1`, `appVersionName = "1.0.0"`;
  - in `shareTarget`, the URL if used.
- Current versions:
  - AGP `8.10.1`, Gradle wrapper `8.11.1`, JDK 17;
  - `compileSdk 36`, `targetSdk 35`, `minSdk 26`;
  - dependency `com.google.androidbrowserhelper:androidbrowserhelper:2.6.2`.
- `AndroidManifest.xml` is kept as in Reader:
  - `LauncherActivity` with DEFAULT_URL, status/navigation bar colours, splash image and
    background, and `FILE_PROVIDER_AUTHORITY`;
  - **`START_CHROME_BEFORE_ANIMATION_COMPLETE=true`**, or the app can hang on the splash;
  - **`FALLBACK_STRATEGY=customtabs`**;
  - shortcuts metadata;
  - intent filters: LAUNCHER; VIEW https `${hostName}` with `autoVerify="true"`, so site links
    open the app; SEND `text/plain` if sharing into the app is useful;
  - `FocusActivity`, `NotificationPermissionRequestActivity`, the FileProvider, and
    `DelegationService` with a small monochrome `ic_notification`;
  - `POST_NOTIFICATIONS` permission.
- `res/values/strings.xml` (`appName`), `colors.xml` (barColor, barColorDark, splashBackground).
- Adaptive icon: `mipmap-anydpi-v26/ic_launcher.xml` with vector foreground and background,
  drawn from the maskable icon.
- `res/xml/shortcuts.xml` (long-press menu, up to 4–5 entries) pointing at
  `/<start>?view=…` URLs that the web app handles.
- The `.gitignore` from rule 1.

### Step 5: the signing key (once per app)

```bash
keytool -genkeypair -v -storetype PKCS12 -keystore <app>-release.jks -alias <app> \
  -keyalg RSA -keysize 4096 -validity 36500 -dname "CN=<AppName>"
keytool -list -v -keystore <app>-release.jks -alias <app>   # copy the SHA-256 line
```

- Use a long random password and keep the key and password **outside the repo** (in the
  scratchpad).
- Send both files to the user right away (rule 2).
- Put the SHA-256 (uppercase, with colons) in `public/.well-known/assetlinks.json`:

```json
[{ "relation": ["delegate_permission/common.handle_all_urls"],
   "target": { "namespace": "android_app", "package_name": "<package>",
               "sha256_cert_fingerprints": ["AA:BB:…"] } }]
```

Deploy the site and confirm that `https://<site-host>/.well-known/assetlinks.json` loads
without logging in.

### Step 6: CI build and release (GitHub Actions)

The sandbox can't download the Android SDK, so **GitHub Actions builds the APK**.
Copy `.github/workflows/android.yml` to `.github/workflows/<app>-android.yml` and change:

- the workflow `name`;
- `paths` → `<app-folder>/android/**`, `<app-folder>/public/.well-known/assetlinks.json`, the
  workflow file itself;
- `tags` → `<app>-android-v*`;
- the `working-directory`;
- the APK names `<AppName>-<version>.apk`;
- the unsigned prerelease tag `<app>-android-unsigned`;
- the release tag `<app>-android-v<version>`;
- the release name **`<AppName> for Android <version>`**;
- the e2e tag `<app>-android-e2e`.

Also copy `sign.sh` (update the download URL, the alias and the APK names), `signer/SignApk.java`
(update the alias) and `e2e.sh` (update `PKG` and `SITE`).

How a release flows (the key never reaches GitHub):

1. **Build:** a push touching `android/` builds an *unsigned* release APK. CI also checks that
   every `androidbrowserhelper` class named in the manifest exists. It publishes the APK as
   the `<app>-android-unsigned` **prerelease** (not installable).
2. **Sign** offline, where the key is: `./sign.sh <app>-release.jks password.txt`.
   - It downloads that unsigned APK and signs it (APK Signature Scheme v2 via Google's apksig
     2.3.0 from Maven Central; v1 off, so minSdk 26).
   - It checks that the certificate equals `assetlinks.json` and that the APK is 4-byte
     aligned (Android 11+ needs that).
   - It writes `releases/<AppName>-<version>.apk`.
   - If Maven Central answers 429, wait and retry. You can pass an already downloaded unsigned
     APK as the 3rd argument.
3. **Commit** that signed APK and push. The `release` job:
   - re-verifies the signature against `assetlinks.json` and the version with `aapt2`;
   - publishes a **normal (latest) GitHub Release** `<app>-android-v<version>` with the APK
     attached;
   - skips versions that are already released.
4. **Test:** the `e2e` job installs the APK on an Android 14 emulator with Chrome, opens it,
   shares a link to it and opens a site link. It publishes screenshots and `summary.txt` as a
   prerelease. "full screen (verified)" means no address bar, so the assetlinks check passed.
   Check the job results with the GitHub MCP actions tools.

For each new version: bump `appVersionCode` (+1) and `appVersionName` → push → wait for the
unsigned build → sign → commit the APK → push → check that the release and e2e are green.

**Only shell changes need a new APK:** icon, name, colours, shortcuts, intents, permissions,
start URL or host. Everything else ships with a normal web deploy and appears in the app the
next time it opens.

(A simpler option, if the user agrees to it: store the keystore as two GitHub Actions secrets
and let CI sign on tag push. This breaks rule 1, so only do it if the user explicitly asks.)

### Step 7: installing and auto-updating with Obtainium

Tell the user:

1. Install **Obtainium** (github.com/ImranR98/Obtainium) on the phone.
2. **Add app** → source URL `https://github.com/Ilias-Ennajmi/gomycode`.
3. Leave **Include prereleases** off. The unsigned and e2e builds are prereleases, so they are
   ignored.
4. Because several apps share this repo, set **Filter release titles by regular expression**
   to `^<AppName> for Android`. If asked, also set the APK filter to `<AppName>-.*\.apk`.
   Then install.
5. Obtainium checks GitHub regularly and offers each new `<app>-android-v…` release as an
   update.
6. Chrome must be on the phone (it nearly always is).

Without Obtainium: open the latest release on the phone, download the APK, and allow installing
from the browser.

### Step 8: Google Play later (optional)

Use the same key as the **upload key**. Then add Play's **app signing** SHA-256 (Play Console →
App integrity) as a second entry in `sha256_cert_fingerprints`, so both the GitHub and Play
builds open full screen.

### Done means

- `tsc`, lint and build pass.
- The site deploys READY on Vercel and `assetlinks.json` is public.
- The workflow is green, the release `<app>-android-v1.0.0` exists with the signed APK, and
  e2e says "full screen (verified)".
- The user has the key and password, and Obtainium has been set up with the steps above.
