# IPL Auction Arena — Android app

A signed, store-ready APK built without Gradle or Android Studio: a native WebView shell
around the live arena, with an offline screen and microphone support for room voice notes.

## Output

```
build/IPL-Auction-Arena-1.0.1.apk
```

Package id `app.iplarena.game` (permanent — changing it later creates a different app).
minSdk 24 (Android 7.0), targetSdk 35 (Android 15), signed with the project keystore.

## Build

```bash
./build.sh                                  # points at the permanent hosted build
./build.sh https://your-domain.example      # point at another deployment
```

Requires JDK 17+ and an Android SDK containing build-tools `35.0.1` and platform `35`.
Set `ANDROID_SDK_MIN` if they live somewhere other than `C:/Users/DELL/android-sdk-min`:

```bash
ANDROID_SDK_MIN=C:/Android/sdk ./build.sh
```

No Gradle, no `node_modules` in this folder — the script uses `aapt2`, `javac`, `d8`,
`zipalign` and `apksigner` directly.

## Signing key — read this once

`keystore/iplarena-release.jks` and `keystore/keystore-password.txt` are generated on the
first build and are gitignored. **Back both up.** Every future update, on every store, must
be signed with this same key; if it is lost you cannot update the app under the same
listing. Never commit or share them.

## Releasing an update

1. Bump `android:versionCode` (must increase) and `android:versionName` in `AndroidManifest.xml`.
2. Rebuild: `./build.sh`
3. Upload the new APK to the same store listing.

## How the shell behaves

- Loads `start_url` from `res/values/strings.xml` (injected by the build)
- Same-host links stay in the app; foreign links open in the phone's browser
- Back button navigates the site's history
- If the host is unreachable — including the tunnel's "no tunnel found" page, which returns
  HTTP 200 — it shows the bundled `assets/offline.html` with a 20-second auto-retry
- Microphone requests are granted only after the Android runtime permission is accepted
- Everything else (camera, location) is denied

## Layout

```
AndroidManifest.xml           app id, permissions, launcher activity
java/app/iplarena/game/       MainActivity (WebView client, chrome, insets, offline bridge)
res/                          theme, colours, strings (start URL placeholder), icons
assets/                       offline page + logo
tools/icons.mjs               generates launcher icons from public/brand/icon-512.png
tools/add-dex.py              appends classes.dex to the linked resources APK
store/                        listing copy, screenshots, feature graphic
```
