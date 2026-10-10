# Releasing: OTA updates and the website APK

How a change reaches players' phones. Read this before publishing an update or
building an APK.

## How Android is distributed

The Android app is **not** installed from the Play Store. Players download the
APK from our website:

- Site: https://yousefalbarqawi.github.io/professional-of-badminton/
- GitHub Pages serves `main:/docs`. The download button in `docs/index.html`
  links to `docs/professional-of-badminton.apk`.
- Replacing that file on `main` and pushing is how a new APK goes live.

iOS ships through the App Store (`eas submit`, see `eas.json`).

## Two kinds of change

| Change | How it ships |
|---|---|
| JS/TS code, screens, logic, styles, `src/i18n/*.json`, images bundled by JS | **OTA update** (`eas update`). No reinstall. |
| New or upgraded native library, permissions, `app.config.ts` native fields (icon, splash, plugins, `android`/`ios`), Expo SDK upgrade | **New build.** Bump `version`, rebuild the APK, replace it on the site, and submit to the App Store. |

If you're not sure, run `npx expo-doctor`, or compare
`npx expo config --type public` before and after the change. Anything that
changes the native project needs a build.

## How OTA is wired

- `app.config.ts`: `runtimeVersion: { policy: 'appVersion' }` and
  `updates.url` pointing at the EAS project.
- `eas.json`: the `production` and `apk` build profiles use channel
  `production`. The `apk` profile extends `production`.
- An update only reaches builds whose runtime version matches. With the
  `appVersion` policy that means the same `version` in `app.config.ts`
  (currently `1.0.0`).
- A phone downloads the update in the background when the app launches and
  applies it on the **next** launch.
- Builds from before OTA was added (APK versionCode ≤ 10, iOS build ≤ 7) have
  no update URL and never receive updates.

## Publish an OTA update

1. Run the checks: `npm run typecheck && npm run lint && npm test`.
2. Commit the change.
3. Publish:
   ```sh
   npx eas-cli update --channel production --environment production \
     --platform android --message "<what changed>" --non-interactive
   ```
   - `--environment production` is required in non-interactive mode. It loads
     the production `EXPO_PUBLIC_*` variables from EAS. Without them the update
     ships empty Supabase keys.
   - Leave out `--platform android` once the App Store build includes OTA
     (iOS build 8 or later, built after this was added). Until then iOS can't
     receive updates anyway.
4. Confirm the publish output shows `Runtime version 1.0.0` (or whatever the
   current `version` is).

**Roll back:** run `npx eas-cli update:republish --group <previous group id>`,
or fix the code and publish again. Group IDs are listed with
`npx eas-cli update:list --branch production`.

## Build and publish a new APK

Use this for native changes, or whenever a fresh install should start on the
latest code.

1. For a native change, bump `version` in `app.config.ts` (for example
   `1.0.0` → `1.1.0`). This starts a new runtime, so older APKs stop getting
   updates meant for the new native code. versionCode increments
   automatically (`autoIncrement`, remote version source).
2. Build:
   ```sh
   npx eas-cli build -p android --profile apk --non-interactive --wait
   ```
   This takes about 15–20 minutes. The output ends with an
   `https://expo.dev/artifacts/...apk` link. That link expires, so never link
   to it from the site.
3. Download it to `docs/professional-of-badminton.apk`:
   ```sh
   curl -sL -o docs/professional-of-badminton.apk <artifact url>
   ```
4. Commit on `main` and push. Pages redeploys within a minute or two.
5. Keep the file under 100 MB, which is GitHub's hard limit. It's about 62 MB
   now. Every APK committed stays in the repo history for good. If size
   becomes a problem, host the APK on a GitHub Release and point the button
   at that link.

## Test on the Android emulator

```sh
export PATH=$PATH:~/Library/Android/sdk/platform-tools
~/Library/Android/sdk/emulator/emulator -avd Pixel_9 &   # if not running
adb uninstall jo.professionalofbadminton.app              # signature/version safety
adb install docs/professional-of-badminton.apk
adb shell monkey -p jo.professionalofbadminton.app -c android.intent.category.LAUNCHER 1
adb exec-out screencap -p > /tmp/shot.png
```

The `apk` profile builds `arm64-v8a` and `armeabi-v7a` only, which suits the
arm64 emulator on Apple Silicon.

To test an update end to end:

1. Make a visible, harmless change. The welcome subtitle, `welcomeSubtitle`
   in `src/i18n/en.json`, works well.
2. Publish it (see above).
3. Force-stop and relaunch twice:
   `adb shell am force-stop jo.professionalofbadminton.app`, then the
   `monkey` launch, waiting about 12 seconds each time. The second launch
   shows the change.
4. **Revert the change and publish again**, so no test text stays on the
   production channel.
