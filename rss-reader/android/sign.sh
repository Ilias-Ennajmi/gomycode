#!/usr/bin/env bash
# Signs the unsigned APK that CI publishes (the "android-unsigned" prerelease) with the
# release key, checks it, and puts it in releases/ for the android-v<version> tag.
#
# Usage: sign.sh <keystore file> <keystore password file> [unsigned apk]
# Without an APK argument it downloads the latest unsigned build from GitHub.
# Needs Java 17+ and Python 3; the key itself never goes into git or to GitHub.
set -euo pipefail
cd "$(dirname "$0")"

KEYSTORE="$1"
PASSWORD="$(cat "$2")"
VERSION=$(sed -n 's/^def appVersionName = "\(.*\)"/\1/p' app/build.gradle)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

UNSIGNED="${3:-}"
if [ -z "$UNSIGNED" ]; then
  UNSIGNED="$WORK/unsigned.apk"
  curl -fsSL -o "$UNSIGNED" \
    "https://github.com/Ilias-Ennajmi/gomycode/releases/download/android-unsigned/Reader-$VERSION-unsigned.apk"
fi

# Google's APK signing library (the same code as the SDK's apksigner).
APKSIG="$WORK/apksig.jar"
curl -fsSL -o "$APKSIG" https://repo.maven.apache.org/maven2/com/android/tools/build/apksig/2.3.0/apksig-2.3.0.jar

OUT="$WORK/signed.apk"
# apksig 2.3.0 (the newest on Maven Central) touches a JDK-internal class even with v1 off.
java --add-exports java.base/sun.security.x509=ALL-UNNAMED -cp "$APKSIG" signer/SignApk.java "$UNSIGNED" "$OUT" "$KEYSTORE" "$PASSWORD" | tee "$WORK/sign.txt"

# The certificate must be the one the website trusts (public/.well-known/assetlinks.json).
actual=$(sed -n 's/^sha256 //p' "$WORK/sign.txt")
expected=$(grep -o '"[0-9A-F:]\{95\}"' ../public/.well-known/assetlinks.json | tr -d '"' | head -1)
[ "$actual" = "$expected" ] || { echo "Certificate $actual doesn't match assetlinks.json ($expected)"; exit 1; }

# Android 11+ refuses APKs whose uncompressed entries (resources.arsc) aren't 4-byte aligned.
python3 - "$OUT" <<'EOF'
import struct, sys, zipfile
path = sys.argv[1]
with open(path, "rb") as f:
    data = f.read()
bad = []
for info in zipfile.ZipFile(path).infolist():
    if info.compress_type != zipfile.ZIP_STORED:
        continue
    name_len, extra_len = struct.unpack("<HH", data[info.header_offset + 26 : info.header_offset + 30])
    start = info.header_offset + 30 + name_len + extra_len
    if start % 4:
        bad.append(f"{info.filename} at {start}")
if bad:
    sys.exit("Not aligned: " + ", ".join(bad))
print("aligned: all stored entries on 4-byte boundaries")
EOF

mkdir -p releases
mv "$OUT" "releases/Reader-$VERSION.apk"
echo "Signed releases/Reader-$VERSION.apk"
