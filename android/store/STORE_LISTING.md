# Store submission package

Everything a store listing needs, plus what to check before you upload.

## Build under test

| Field | Value |
| --- | --- |
| APK | `android/build/IPL-Auction-Arena-1.0.1.apk` |
| Size | ~150 KB |
| Package | `app.iplarena.game` (permanent) |
| Version | 1.0.1 (code 2) |
| Min / target Android | 7.0 (24) / 15 (35) |
| Signing | RSA-4096, cert SHA-256 `4ac95f8a692e90890af93942320b29d40f9dbf19b5d94eac1e6162c021f85625` |
| Loads | `https://ipl-arena-fqik9gpgyij.qoder.website` (permanently hosted, single-player edition) |

## Assets

| Asset | Path | Requirement |
| --- | --- | --- |
| App icon 512×512 | `android/store/icon-512.png` | stores require 512 PNG |
| Feature graphic 1024×500 | `android/store/feature-1024x500.png` | Amazon / Aptoide header |
| Screenshots 1080×1920 (5) | `android/store/shots/{home,players,auction,teams,rules}.png` | 3–10 recommended |

## Read this before you submit

1. **The app loads a permanently hosted build.** The start URL above is a public Qoder Sites deployment that stays up without your PC. The hosted edition is the single-player local-first game (saves stay on the device); the multiplayer/admin edition remains the separate Next.js app.
2. **Test on a real phone** before uploading: `adb install -r android/build/IPL-Auction-Arena-1.0.1.apk` (or copy the file and tap it). Check the header is not under the status bar, the keyboard does not cover inputs, back button exits cleanly, and an auction can be started.
3. **Never lose the keystore.** `android/keystore/iplarena-release.jks` + `keystore-password.txt`. Every future update must be signed with it.
4. **Bump the version for every update**: `versionCode` must increase, `versionName` is what users see, both in `AndroidManifest.xml`.

## Listing copy

**Title** (all stores): `IPL Auction Arena`

**Short description** (≤80 chars):
```
Live IPL auction simulator: 263 players, 10 franchises, full season.
```

**Full description**:
```
Step into a live auction room and build a squad that can survive a full IPL season.

IPL Auction Arena is a realistic auction simulator built on real IPL evidence. All 263 players in the pool are rated from actual IPL performances only, so an expensive name does not automatically mean a world-class squad.

WHAT YOU CAN DO
• Run a 2026 mega auction or a 2027 mini auction with retentions
• Bid against nine AI managers across 237 lots, with real purse rules, squad limits and overseas caps
• Play with friends in a private room using a six-character code — AI managers fill the empty franchises
• Make Right to Match decisions, set batting and bowling aggression, then pick your XI
• Simulate a full season match by match with commentary and full scorecards

WHY IT FEELS REAL
• Ratings and auction price stay separate: price is evidence, not opinion
• Overseas premium, purse reserved for an 18-player minimum, bid slabs that step as prices rise
• Season simulation driven by form, match-ups and IPL career numbers

PERMISSIONS
• Internet — the game is served live
• Microphone — optional voice notes in room chat, used only while you hold the record button

NOT AFFILIATED
Unofficial fan-made simulator. Not affiliated with, endorsed by or connected to the BCCI, the Indian Premier League or any franchise.
```

**Category**: Games → Simulation (Aptoide / Uptodown "Games"); Amazon: Games → Sports / Simulation.
**Tags**: cricket, auction, ipl, simulation, sports manager, fantasy.
**Content rating**: Everyone. No ads, no in-app purchases, no accounts, no data selling.
**Privacy policy URL**: `https://ipl-arena-fqik9gpgyij.qoder.website/privacy.html` (permanently hosted).
**Support contact**: add your own email where the store asks — the listing will not publish without one.

## Uptodown

1. Sign in at `uptodown.com/developers` and open the developer console.
2. Choose upload app, then pick the APK. Uptodown reads package, version and permissions from the file.
3. Fill name, category, short and full description; upload the 512 icon and at least two screenshots.
4. Add the privacy policy URL and agree to the distribution terms, then submit.
5. Review is manual and usually takes a few days. Updates go through the same listing and must keep the same signature.

## Aptoide

1. Create a developer account at `developers.aptoide.com`.
2. Add a new app and upload the APK; Aptoide extracts metadata and runs signature and malware checks.
3. Add the listing text, icon, screenshots, feature graphic, privacy policy URL and content rating.
4. Submit for review. Automated checks are fast; the human pass can take a few days.

## Amazon Appstore

1. Sign in at `developer.amazon.com` and open the Appstore Developer Console (free account).
2. Add a new app → Android → upload the APK.
3. Upload the 512 icon, feature graphic and 3–10 screenshots; fill the short and full description fields (the console shows each field's limit).
4. Complete the privacy policy URL, content rating questionnaire and target audience sections.
5. Submit for review, typically several days.

Risk to know: Amazon is the strictest of the three about apps that are mainly a website in a shell. If it is rejected, reply with the interactive features (live bidding, simulations, room codes) or submit the bundled offline build instead.

## Softonic

Softonic is a curated download directory, not self-serve. Submissions go through their publisher contact form, they prefer established software with a Windows/Mac installer, and acceptance of a new Android APK is unlikely. Treat it as optional.

## Google Play (not part of this build)

Play requires an Android App Bundle (AAB), a $25 developer account, target-API compliance and a closed test for new personal accounts. This hand-built APK is not a Play submission; it needs a Gradle/AAB pipeline.

## Trademark caution

The IPL name, franchise names and logos, and player photographs belong to the BCCI, the franchises and broadcasters. Uptodown and Aptoide act on takedown complaints; Amazon and Play are stricter. Keep the listing described as an unofficial fan project, and have a neutral rebrand ready (for example "Cricket Auction Arena" with your own crest) if a complaint arrives.
