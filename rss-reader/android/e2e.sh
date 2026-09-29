#!/usr/bin/env bash
# Emulator test for the Android app, run by .github/workflows/android.yml (job "e2e").
# Usage: e2e.sh <signed apk> <output dir>
# Installs the APK, opens it, shares a link to it, opens a site link from outside, and saves
# screenshots, UI trees and logs. summary.txt says whether the app ran as a verified
# Trusted Web Activity (full screen, no browser bar) and whether anything crashed.
set -u
APK="$1"
OUT="$2"
PKG=io.github.iliasennajmi.reader
LAUNCHER=com.google.androidbrowserhelper.trusted.LauncherActivity
SITE=https://rss-reader-jet.vercel.app
mkdir -p "$OUT"

# The page Chrome shows, from its DevTools socket (the app has no URL bar to read).
page_url() {
  adb forward tcp:9222 localabstract:chrome_devtools_remote > /dev/null 2>&1
  curl -s http://127.0.0.1:9222/json | python3 -c '
import json, sys
pages = [t for t in json.load(sys.stdin) if t.get("type") == "page"]
print(pages[0]["url"] if pages else "?")' 2> /dev/null || echo "?"
}

shot() {
  page_url > "$OUT/$1-url.txt"
  adb exec-out screencap -p > "$OUT/$1.png"
  adb shell uiautomator dump /sdcard/ui.xml > /dev/null 2>&1 && adb pull /sdcard/ui.xml "$OUT/$1.xml" > /dev/null 2>&1
  adb shell dumpsys activity activities | grep -m3 -E "topResumedActivity|mResumedActivity" > "$OUT/$1-activity.txt"
}

adb wait-for-device
until [ "$(adb shell getprop sys.boot_completed | tr -d '\r')" = "1" ]; do sleep 2; done

adb shell pm list packages | grep -iE "chrome|webview|browser" > "$OUT/browsers.txt"
adb shell dumpsys package com.android.chrome | grep -m1 versionName >> "$OUT/browsers.txt"

# Chrome without its first-run screens, as on a phone that has used Chrome before.
adb root > /dev/null 2>&1; sleep 2
adb shell 'echo "_ --disable-fre --no-default-browser-check --no-first-run" > /data/local/tmp/chrome-command-line'
adb shell am set-debug-app --persistent com.android.chrome

adb install -r "$APK" > "$OUT/install.txt" 2>&1
adb shell dumpsys package "$PKG" | grep -E "versionName|versionCode|targetSdk" >> "$OUT/install.txt"

# Link verification for https://rss-reader-jet.vercel.app (the app handles site links).
adb shell pm verify-app-links --re-verify "$PKG"
sleep 20
adb shell pm get-app-links "$PKG" > "$OUT/app-links.txt"

adb logcat -c
adb shell am start -W -n "$PKG/$LAUNCHER" > "$OUT/launch.txt"
sleep 30
shot 1-launch

# adb shell joins its arguments into one command line, so the text needs its own quotes.
adb shell am start -W -a android.intent.action.SEND -t text/plain \
  --es android.intent.extra.TEXT "'Worth reading https://www.bbc.com/news'" \
  -n "$PKG/$LAUNCHER" > "$OUT/share.txt" 2>&1
sleep 20
shot 2-share

adb shell am start -W -a android.intent.action.VIEW -c android.intent.category.BROWSABLE \
  -d "$SITE/reader?view=news" > "$OUT/site-link.txt" 2>&1
sleep 20
shot 3-site-link

adb logcat -d -b crash > "$OUT/crash.txt"
adb logcat -d | grep -iE "TrustedWebActivity|androidbrowserhelper|TwaLauncher|DigitalAssetLinks|OriginVerifier|$PKG" | tail -300 > "$OUT/logcat.txt"

{
  echo "APK: $APK"
  cat "$OUT/install.txt"
  echo
  echo "Browsers:"; cat "$OUT/browsers.txt"
  echo
  echo "App links:"; cat "$OUT/app-links.txt"
  echo
  for step in 1-launch 2-share 3-site-link; do
    # A verified TWA has no Custom Tab toolbar; an unverified one shows the URL bar.
    if grep -qE 'com.android.chrome:id/(url_bar|title_bar|toolbar|custom_tabs_toolbar)' "$OUT/$step.xml" 2>/dev/null; then
      bar="BROWSER BAR VISIBLE (not verified)"
    else
      bar="full screen (verified)"
    fi
    echo "$step: $bar | page $(cat "$OUT/$step-url.txt") |$(tr -s ' ' < "$OUT/$step-activity.txt" | head -1)"
  done
  echo
  echo "Share intent:"; cat "$OUT/share.txt"
  echo "Site link intent:"; cat "$OUT/site-link.txt"
  echo
  if [ -s "$OUT/crash.txt" ]; then echo "CRASHES:"; head -50 "$OUT/crash.txt"; else echo "No crashes."; fi
} > "$OUT/summary.txt"
cat "$OUT/summary.txt"
