# Reader for Android

A [Trusted Web Activity](https://developer.chrome.com/docs/android/trusted-web-activity/):
a small Android app that opens https://rss-reader-jet.vercel.app/reader full-screen in
Chrome, without a browser bar. All screens and features come from the website, so they
update with every web deploy. The app itself only needs a new version when this folder
changes.

## What the app adds

| Feature                                                 | Where                                                                    |
| ------------------------------------------------------- | ------------------------------------------------------------------------ |
| App icon, splash screen, dark system bars               | `app/src/main/res/drawable`, `values/colors.xml`                         |
| Links to the site open in the app                       | VIEW intent filter in `AndroidManifest.xml`                              |
| Share → Reader saves a link to Later                    | SEND intent filter + `shareTarget` in `app/build.gradle` → `/share` page |
| Long-press shortcuts: News, Briefing, Later, Add source | `res/xml/shortcuts.xml` → `/reader?view=…` / `?add=1`                    |
| Web notifications shown as the app's own                | `DelegationService` in `AndroidManifest.xml`                             |
| Update banner when a newer release exists               | web side: `components/layout/AppUpdateBanner.tsx`                        |

The web side of the connection:

- `public/.well-known/assetlinks.json` proves the site trusts this app (package name and
  signing certificate SHA-256). If it doesn't match, Android shows a browser bar at the top.
- `middleware.ts` lets `/.well-known/` through the password gate.
- `lib/native.ts` notices `?source=android&v=<version>` and handles haptics and update checks.
- `lib/hooks/useHistorySync.ts` makes the Android back gesture close the article, pane or
  dialog instead of the app.

## Building

GitHub Actions builds it: `.github/workflows/android.yml`, on any push touching this
folder, on `android-v*` tags, or manually (Actions → Android app → Run workflow).

- Without signing secrets it builds a test APK (debug-signed, shows a browser bar).
- With the secrets `ANDROID_KEYSTORE_BASE64` and `ANDROID_KEYSTORE_PASSWORD` it builds the
  signed APK and checks its fingerprint matches `assetlinks.json`.

Locally (needs Android Studio or the Android SDK, JDK 17+):

```bash
cd rss-reader/android
./gradlew assembleDebug        # app/build/outputs/apk/debug/app-debug.apk
ANDROID_KEYSTORE_PATH=/path/reader-release.jks ANDROID_KEYSTORE_PASSWORD=… ./gradlew assembleRelease
```

## Releasing a new version

1. In `app/build.gradle`, bump `appVersionCode` (+1) and `appVersionName` (e.g. `1.1.0`).
2. Commit, then tag and push: `git tag android-v1.1.0 && git push origin android-v1.1.0`.
3. The workflow publishes a GitHub Release with `Reader-1.1.0.apk`. Obtainium (or the
   in-app banner) picks it up.

## Signing key

- Alias `reader`, stored in the two GitHub secrets above. **Never commit it.**
- Every update must be signed with the same key, or Android refuses to install it over the
  old app. If it's lost: make a new key, update `assetlinks.json`, and reinstall. No data
  is lost, because everything lives on the server.
- Moving to Google Play later: use this key as the _upload key_. Then add Play's _app signing_
  SHA-256 (Play Console → App integrity) as a second entry in `sha256_cert_fingerprints`.

## Installing on a phone

- **Auto-updating (recommended):** install [Obtainium](https://github.com/ImranR98/Obtainium),
  add the app with the URL `https://github.com/Ilias-Ennajmi/gomycode`, and set the
  release filter to tags starting with `android-v`.
- **Manually:** open the latest release on GitHub on the phone, download the APK, open it,
  and allow installing from your browser when asked.
- Chrome must be installed. It is on almost every Android phone.
