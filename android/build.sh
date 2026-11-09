#!/usr/bin/env bash
set -euo pipefail

# Builds a signed release APK without Gradle or Android Studio.
# Usage: ./build.sh [https://start-url]
# Requires: JDK 17+, Android build-tools 35 + platform 35 (see ANDROID_SDK_MIN).

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -W)"
SDK="${ANDROID_SDK_MIN:-C:/Users/DELL/android-sdk-min}"
BT="$SDK/build-tools/35.0.1"
PLATFORM_JAR="$SDK/platforms/android-35/android.jar"
START_URL="${1:-https://ipl-arena.tunn3l.sh}"
OUT="$ROOT/build"
VERSION="$(sed -n 's/.*android:versionName="\([^"]*\)".*/\1/p' "$ROOT/AndroidManifest.xml")"
APK="$OUT/IPL-Auction-Arena-$VERSION.apk"

for tool in aapt2.exe zipalign.exe; do
  [ -f "$BT/$tool" ] || { echo "Missing $BT/$tool"; exit 1; }
done
[ -f "$PLATFORM_JAR" ] || { echo "Missing $PLATFORM_JAR"; exit 1; }

echo "== icons =="
node "$ROOT/tools/icons.mjs"

rm -rf "$OUT"
mkdir -p "$OUT/res" "$OUT/gen" "$OUT/classes" "$OUT/dex"
cp -R "$ROOT/res/." "$OUT/res/"
node -e 'const fs=require("fs");const p=process.argv[1];fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace("__START_URL__",process.argv[2]));' \
  "$OUT/res/values/strings.xml" "$START_URL"

echo "== resources =="
"$BT/aapt2.exe" compile --dir "$OUT/res" -o "$OUT/res.zip"
"$BT/aapt2.exe" link \
  -o "$OUT/app-unsigned.apk" \
  -I "$PLATFORM_JAR" \
  --manifest "$ROOT/AndroidManifest.xml" \
  -R "$OUT/res.zip" \
  --java "$OUT/gen" \
  -A "$ROOT/assets" \
  --auto-add-overlay

echo "== compile java =="
sources=()
while IFS= read -r file; do sources+=("$file"); done < <(find "$OUT/gen" "$ROOT/java" -name "*.java")
javac -Xlint:-options --release 11 -encoding UTF-8 -classpath "$PLATFORM_JAR" -d "$OUT/classes" "${sources[@]}"

echo "== dex =="
classes=()
while IFS= read -r file; do classes+=("$file"); done < <(find "$OUT/classes" -name "*.class")
java -cp "$BT/lib/d8.jar" com.android.tools.r8.D8 \
  --release --min-api 24 --lib "$PLATFORM_JAR" --output "$OUT/dex" "${classes[@]}"
py -3 "$ROOT/tools/add-dex.py" "$OUT/app-unsigned.apk" "$OUT/dex/classes.dex"

echo "== align =="
"$BT/zipalign.exe" -f -p 4 "$OUT/app-unsigned.apk" "$OUT/app-aligned.apk"

echo "== signing key =="
KS_DIR="$ROOT/keystore"
KS="$KS_DIR/iplarena-release.jks"
PASS_FILE="$KS_DIR/keystore-password.txt"
mkdir -p "$KS_DIR"
if [ ! -f "$KS" ]; then
  echo "Generating release keystore (keep this file and its password forever)."
  PASS="$(node -e 'console.log(require("crypto").randomBytes(18).toString("base64url"))')"
  printf '%s' "$PASS" > "$PASS_FILE"
  keytool -genkeypair \
    -keystore "$KS" -alias iplarena \
    -keyalg RSA -keysize 4096 -validity 12000 \
    -storepass "$PASS" -keypass "$PASS" \
    -dname "CN=IPL Auction Arena,O=Auction Arena,C=IN" >/dev/null 2>&1
fi
PASS="$(cat "$PASS_FILE")"

echo "== sign =="
java -cp "$BT/lib/apksigner.jar" com.android.apksigner.ApkSignerTool sign \
  --ks "$KS" --ks-key-alias iplarena \
  --ks-pass "pass:$PASS" --key-pass "pass:$PASS" \
  --out "$APK" "$OUT/app-aligned.apk"

echo "== verify =="
java -cp "$BT/lib/apksigner.jar" com.android.apksigner.ApkSignerTool verify --print-certs "$APK" | head -12
"$BT/aapt2.exe" dump badging "$APK" | sed -n '1,12p'
sha256sum "$APK"
ls -lh "$APK" | awk '{print "size:", $5}'
echo "start_url: $START_URL"
