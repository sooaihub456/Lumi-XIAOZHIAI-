# Android Browser Configuration Applied

This project has been configured for Android-phone WebView compatibility while keeping the most important browser security boundaries intact.

## Packaged Mori app WebView

Enabled:
- JavaScript
- DOM storage and Web SQL/database compatibility
- automatic image loading
- normal network loading
- normal media playback without an extra WebView gesture gate
- standard cookies and third-party cookies needed by many embedded services
- wide/mobile viewport handling
- UTF-8 text encoding
- hardware acceleration
- Android Safe Browsing where supported

Kept controlled:
- page zoom UI is disabled for the application shell so the app layout does not accidentally scale.

## Mori in-app internet browser WebView

Enabled:
- JavaScript
- DOM storage and database storage
- normal HTTP cache (`LOAD_DEFAULT`)
- automatic image/network loading
- standard cookies and third-party cookies
- responsive viewport behavior
- pinch zoom without the old Android zoom buttons
- HTML5 media playback without an additional WebView gesture requirement
- UTF-8 text encoding
- hardware acceleration
- Android Safe Browsing where supported
- Android external-browser handoff for downloads
- fullscreen HTML5 video handling already present in the project

Security kept enabled:
- TLS/certificate errors are blocked and never bypassed
- mixed insecure content inside HTTPS pages is blocked
- `file://` and Android content-provider access are blocked for internet pages
- geolocation is disabled for internet pages
- website camera/microphone permission requests are denied
- private, loopback, `.local`, and internal network addresses are blocked by the browser URL validator
- remote pages are still placed in a separate WebView and do not receive the Capacitor app bridge

## Android / Capacitor settings

- Android System WebView minimum lowered from 120 to 100 for wider device compatibility.
- Packaged app origin remains `https://localhost`.
- The app still requires secure `wss://` for Xiaozhi connections.
- Public `http://` pages can be opened in the isolated browser because the Android manifest already allows cleartext traffic for that browser use case.
- App backup remains disabled.
- Permissions remain limited to internet/network state and microphone for the app's voice feature; no camera, contacts, location, or broad storage permission was added.

## Files changed

- `capacitor.config.ts`
- `native/android/app/src/main/java/app/mori/companion/MainActivity.java`
- `native/android/app/src/main/java/app/mori/companion/MoriBrowserPlugin.java`
- `ANDROID.md`
- `BROWSER.md`

Use the included `.github/workflows/android-apk.yml` workflow or `node scripts/build-apk.mjs` on a machine with Android SDK 36 to compile the APK.
