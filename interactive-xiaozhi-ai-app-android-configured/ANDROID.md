# Get Mori on Your Android Phone

## Current Status

The Android packaging, native integrations, and automated APK build are included. **An APK has not been compiled or attached in this workspace.** The available tool runs the Vite web build; it cannot run the Android Gradle toolchain. This workspace also uses Node 20, while Capacitor 8 packaging requires Node 22.

The workflow below produces a real, debug-signed `.apk`, verifies its signature, and makes it downloadable. Its first native build and installation on a physical device still need to run.

## Easiest Route: GitHub

You do not need Android Studio or an Android developer account for this route.

1. Export this entire project's source and upload or push it to a GitHub repository. Include hidden folders, especially `.github/workflows/android-apk.yml`, and all project/build files. Do not include `node_modules`, `.env`, or private credentials.
2. On the repository's default branch, open **Actions**. Enable workflows if GitHub asks, then select **Build Android APK**.
3. Click **Run workflow**. Leave **Publish a preview release with a direct APK download** checked. The build uses GitHub's Node 22, Java 21, and Android SDK 36 environment.
4. Wait for both the compile and publish jobs to finish successfully. Open the repository's **Releases**, choose the new **Mori Android preview**, and download **mori-preview.apk** directly to your phone.
5. Open the APK and confirm installation. If prompted, permit your browser or Files app to **Install unknown apps**. You can turn that permission off afterward. Keep Play Protect enabled.

If release publishing is blocked by your repository's permissions, the compile job still provides an **Artifacts > mori-android-apk** download. Sign in to GitHub, download the ZIP, extract it, and install the `mori-preview.apk` inside. Artifacts expire after 30 days; published release assets remain until you delete the release.

Pushes to `main` and `master` also build an artifact automatically. Manual workflow runs can additionally publish a release. The workflow does not publish to the Play Store.

## What You Can Try

- The animated 3D companion, emotions, body gestures, three worlds, local-preview chat, personalization, and saved memories.
- Native Android speech recognition with a microphone permission request. Android WebView's unsupported browser speech API is not used in the APK.
- Native Android text-to-speech for local replies and message read-aloud.
- Native sharing for snapshots and exported conversations, plus native clipboard support.
- Android back-button handling, status/navigation-bar safe areas, and microphone/audio cleanup when the app goes into the background.
- Offline world artwork and locally bundled fonts. No hosted website URL is required to launch the APK.
- A real, separate Android WebView inside Lumi's computer, with address entry, back/forward, reload, live page rendering, and TLS error handling. Remote websites do not receive the Capacitor app bridge. Rebuild the APK to include the new native plugin; see `BROWSER.md`.
- Google/YouTube navigation, fullscreen WebView video handling, and **Open in browser** using Android Custom Tabs for sign-in and website compatibility. Xiaozhi can read the actual WebView's rendered public text/links after you enable page sharing. Rebuild the APK to include the latest reader and `@capacitor/browser` plugin; a frontend-only refresh does not update Java code.
- Public HTTP/HTTPS navigation, website cookies, a preserved browsing view, and a real live-website diagnostic. Explicit HTTP pages are allowed and marked Not secure; HTTPS certificate checks and mixed-content protection remain enabled.

**Requirements:** Android 7.0 or newer and Android System WebView or Chrome 100 or newer. Use a recent phone for smooth 3D rendering. Speech input needs an installed recognition service and may need internet; spoken replies need an installed English text-to-speech voice. Text chat and gestures are available without microphone permission.

The app requests internet/network access and, only when you use voice, microphone access. It does not request camera, contacts, location, or broad storage permissions. Local app backup is disabled. Live tokens are kept in memory, not bundled into the APK or persisted.

## Live Xiaozhi on a Phone

The preview APK is usable without a Xiaozhi account, using the clearly labeled, rule-based local preview. For real AI conversations:

1. Deploy the included `server/xiaozhi-bridge.mjs` on a server, using your paired Xiaozhi setup.
2. Put the bridge behind TLS and use a reachable **wss://** URL. Mori's Xiaozhi connection rejects insecure `ws://` endpoints on Android, even though its separate web browser can open public HTTP pages.
3. Include **https://localhost** in the bridge's `ALLOWED_ORIGINS`. This is the packaged app's WebView origin, not the bridge's network address.
4. In Mori, open **Connect AI**, enter the bridge URL and matching paired Device ID, Client ID, and token, and connect.

`localhost` on your phone means your phone, not your computer. The APK does not include or run the Node bridge. Device provisioning and pairing remain in your Xiaozhi installation. See `README.md` for the protocol and server details.

## Build on Your Computer

Install Node 22 or newer, JDK 21, and Android Studio Otter or newer. In Android Studio's SDK Manager install Android SDK Platform 36 and Android SDK Build-Tools 36.0.0. Set `JAVA_HOME` and `ANDROID_HOME` to those installations, and accept the Android SDK licenses.

1. Install the project dependencies with `npm ci`.
2. Build the web app with `npm run build`.
3. Run `node scripts/build-apk.mjs`.
4. Install the resulting `artifacts/mori-preview.apk` on your phone.

The script generates the Android project from the installed official Capacitor template, applies the maintained files in `native/android/`, copies the built web assets and native plugins, invokes the official `:app:assembleDebug` Gradle task, and verifies the APK with Android's `apksigner`. It outputs the APK, SHA-256 checksum, build information, and installation instructions.

To work in Android Studio instead, run `node scripts/prepare-android.mjs` after the web build, then run `npx cap open android`. The generated `android/` directory is ignored by Git; keep repeatable customizations in `native/android/`. Rebuild the web app and rerun the APK script after changing the app.

## Signing and Updates

These are **debug-signed test builds**, not production releases. GitHub Actions caches the generated debug keystore to allow updates during testing. Cache eviction, a different repository, or a different local build machine can change the signing key. If Android refuses to update, export your conversations before uninstalling the old build; uninstalling removes local app data. Then install the new APK.

Before public distribution, use a private release keystore, production signing, an appropriate privacy policy, and physical-device tests. Protect any shared Xiaozhi bridge with your own user authentication and rate limiting.

## Build Files

- `capacitor.config.ts`: app identity, bundled asset directory, secure WebView, and system bars.
- `native/android/`: Android manifest, permissions, launcher icons, splash theme, and scoped file-sharing paths.
- `scripts/prepare-android.mjs`: official native project generation and plugin synchronization.
- `scripts/build-apk.mjs`: Gradle packaging, signature verification, and artifact creation.
- `.github/workflows/android-apk.yml`: cloud build and optional direct-download release.
- `native/INSTALL.txt`: phone installation instructions included with the build.