# Stash for Android

A [Trusted Web Activity](https://developer.chrome.com/docs/android/trusted-web-activity/):
a small Android app that opens https://__SITE_HOST__/today full-screen in Chrome, without a
browser bar. All screens and features come from the website, so they update with every web
deploy. The app itself only needs a new version when this folder changes.

`__SITE_HOST__` is a placeholder for the Vercel host. Replace it everywhere
(`grep -rn __SITE_HOST__ .`) before the first build: `app/build.gradle`, `e2e.sh`,
`res/xml/shortcuts.xml` and this file.

## What the app adds

| Feature                                          | Where                                                                    |
| ------------------------------------------------ | ------------------------------------------------------------------------ |
| App icon, splash screen, system bar colours      | `app/src/main/res/drawable`, `values/colors.xml`                         |
| Links to the site open in the app                | VIEW intent filter in `AndroidManifest.xml`                              |
| Share → Stash saves a link                       | SEND intent filter + `shareTarget` in `app/build.gradle` → `/share` page |
| Long-press shortcuts: Play my 5, Search, Inbox   | `res/xml/shortcuts.xml` → `/play?queue=today`, `/library?search=1`, `/library?space=inbox` |
| Web notifications shown as the app's own         | `DelegationService` in `AndroidManifest.xml`                             |

The app opens `/today?source=android&v=<versionName>`, so the web app can tell it runs
inside the Android app and which version is installed.

The web side of the connection: `public/.well-known/assetlinks.json` proves the site trusts
this app (package name and signing certificate SHA-256). It must be public (no login) and
match the release key, or Android shows a browser bar at the top.

## Building, signing and releasing

The release key never goes to GitHub (no repository secrets). Instead:

1. **Build** – any push touching this folder runs `.github/workflows/stash-android.yml`, which
   builds an unsigned release APK and publishes it as the `stash-android-unsigned` prerelease.
2. **Sign** – on a machine that has the key, run
   `./sign.sh stash-release.jks password.txt`. It downloads that unsigned APK, signs it with
   Google's apksig library (`signer/SignApk.java`, APK Signature Scheme v2), verifies it,
   checks the certificate matches `assetlinks.json` and that the file is aligned, and writes
   `releases/Stash-<version>.apk`.
3. **Release** – commit that APK and push. The workflow sees a signed APK for a version that
   has no release yet, checks its version and signature again, publishes the GitHub Release
   `stash-android-v<version>` titled "Stash for Android <version>", and runs the emulator
   test. (Pushing that tag yourself does the same.)
4. **Test** – the `e2e` job installs the APK on an Android 14 emulator with Chrome, opens it,
   shares a link to it and opens a site link, and publishes screenshots, UI dumps and
   `summary.txt` as the `stash-android-e2e` prerelease. "full screen (verified)" means no
   browser bar. It can also be run by hand (Actions → Stash Android app → Run workflow).

For a new version, bump `appVersionCode` (+1) and `appVersionName` in `app/build.gradle`
first, push, wait for the unsigned build, then sign and commit as above.

Building locally needs the Android SDK and JDK 17+: `./gradlew assembleRelease`.

## Signing key

- A PKCS#12 keystore, alias `stash`. **Never commit it or its password.** The owner keeps
  a copy; `assetlinks.json` holds its public SHA-256 fingerprint.
- Every update must be signed with the same key, or Android refuses to install it over the
  old app. If it's lost: make a new key, update `assetlinks.json`, and reinstall.
- Moving to Google Play later: use this key as the _upload key_. Then add Play's _app signing_
  SHA-256 (Play Console → App integrity) as a second entry in `sha256_cert_fingerprints`.

## Installing on a phone

- **Auto-updating (recommended):** install [Obtainium](https://github.com/ImranR98/Obtainium),
  add the app with the URL `https://github.com/Ilias-Ennajmi/gomycode`, leave
  "Include prereleases" off, and set "Filter release titles by regular expression" to
  `^Stash for Android` (and, if asked, the APK filter to `Stash-.*\.apk`). Other apps share
  this repository, so the filter matters.
- **Manually:** open the latest Stash for Android release on GitHub on the phone, download
  the APK, open it, and allow installing from your browser when asked.
- Chrome must be installed. It is on almost every Android phone.
