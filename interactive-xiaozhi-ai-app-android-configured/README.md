# Mori

A mobile-first AI companion with a custom animated 3D avatar, four virtual worlds, an interactive home and computer, live online discovery, web and native Android voice input, and an optional live Xiaozhi connection.

## Desktop App With Built-in Chromium

The Electron wrapper is implemented. Mori Desktop uses local, sandboxed `WebContentsView` tabs inside the companion's computer, with real navigation, keyboard/mouse input, media, zoom, mute, downloads, and permission-controlled Xiaozhi page reading. No remote browser service is required for desktop browsing.

Use Node 24, run the web build, then launch with `node scripts/run-desktop.mjs`. See **[DESKTOP.md](DESKTOP.md)** for launch instructions, security details, Windows/macOS/Linux packaging, and the **Build Mori Desktop** GitHub workflow. This is a desktop application, not an Android APK. Native runtime tests and installers have not been run or produced in this editing environment.

## Android APK

Android packaging and an automated APK workflow are now included. See **[ANDROID.md](ANDROID.md)** for the phone installation and build guide.

The fastest route is to put this source in a GitHub repository and run **Actions > Build Android APK > Run workflow**. After a successful build, download `mori-preview.apk` from the generated preview release, or extract it from the `mori-android-apk` artifact. The app bundles its UI, worlds, and fonts and uses native Android speech, clipboard, and sharing.

**No APK has been compiled in this workspace.** The available web build tool cannot execute Android Gradle. Native compilation, APK signature verification, and physical-device testing remain pending until the workflow or local Android build runs. Android packaging needs Node 22, JDK 21, and SDK 36; the workflow provisions them.

## The Experience

- Lumi has six facial expressions, natural blinking, pointer-aware eye contact, and speaking animation.
- Tap the companion or use the controls to wave, dance, share a hug, or take a guided breathing break.
- Visit the quiet garden, Cloud nine, and the moonlit pond.
- Personalize names, outfit color, and the local-preview personality.
- Save messages as memories, search or remove them, copy messages, and export conversations.
- Download a composed image of the world and avatar with the camera control.
- Preferences, the last 80 messages, and memories are stored in this browser. Access tokens are never persisted.
- Mobile layouts include bottom navigation and a conversation sheet. Reduced-motion preferences are respected; an animated SVG companion is available if WebGL is unavailable.

## A Living Little World

Lumi now has smooth, frame-rate-independent pose blending, eased expression changes, natural blinks, walking, secondary antenna motion, and softer speech animation. Background animation pauses when the document is hidden.

His new sunroom includes an interactive desk and computer, a plant that grows after watering, a reading/resting bench, and a tea table. Click an object or use the activity dock. Click empty floor space to wander. Optional autonomous routines begin after a quiet pause; they do not automatically browse websites or submit data. Room lighting, atmosphere, furniture, and plant growth are saved locally.

Personalization now includes six clothing colors, glasses/scarf/headphones, three antenna styles, four eye colors, ceramic/clay/chrome finishes, avatar size, and movement rhythm. World settings include daylight, golden hour, moonlight, fireflies, rain, and furniture finishes.

## His Real Computer

See **[BROWSER.md](BROWSER.md)** for browsing and deployment. Mori Desktop now has its own local Chromium engine through Electron; Android uses an isolated WebView; the website can connect to a remote Chromium service. Without an in-screen engine, user clicks open the device's full browser. Google is the default search provider; YouTube and Wikipedia are explicit choices. Xiaozhi can search, open links, and read the real rendered public page after you enable page sharing. External browser tabs are not readable by Mori. See **[DESKTOP.md](DESKTOP.md)** to use the server-free desktop browser.

Browser compatibility corrections are documented in **[BROWSER-RESEARCH.md](BROWSER-RESEARCH.md)**. Public HTTP/HTTPS navigation, host/port addresses, persistent standard profiles, native POST popups, and redirect/tab synchronization have been corrected. **Check live website** reports the actual engine's page-load result. The website preview explicitly says when no embedded browser is running; a successful Vite build is not presented as proof of native browser behavior.

## Frontend

Use `npm run dev` for local development. The project uses React, Vite, Tailwind CSS v4, Motion, React Three Fiber, and Drei.

The app works immediately in **Local preview**. Preview replies are deliberately small, rule-based interactions, not a remote AI model. Try "Let's take a deep breath", "Tell me something good", or "Let's dance".

## Connect Xiaozhi

Xiaozhi requires `Authorization`, `Device-Id`, `Client-Id`, and `Protocol-Version` headers when the WebSocket opens.

### Android APK

Android now connects **directly** to Xiaozhi through the native `MoriXiaozhi` plugin. No Node bridge, Cloudflare tunnel, or `ALLOWED_ORIGINS` configuration is needed on the phone.

1. Use an existing paired Xiaozhi device and obtain its matching Device ID, Client ID, and access token.
2. In **Settings & connection**, leave the server URL at `wss://api.tenclass.net/xiaozhi/v1/` unless the device was paired to another/self-hosted server.
3. Enter the matching credentials and choose **Connect to Xiaozhi**.

The native layer uses an authenticated secure WebSocket, sends the protocol `hello`, forwards JSON/MCP messages, and streams returned Opus audio frames back to the UI. The access token is session-only in the frontend and is not saved to local storage.

### Web/browser build

Browser WebSocket APIs cannot attach Xiaozhi's required handshake headers, so the web build still uses `server/xiaozhi-bridge.mjs`. Copy `.env.example` to `.env`, configure the upstream URL/origins/credentials, start the bridge with `node --env-file=.env server/xiaozhi-bridge.mjs`, and connect the web UI to that bridge.

The app only shows **Connected** after receiving a valid Xiaozhi `hello` acknowledgement. Connection errors and handshake timeouts are shown in Settings. Disconnecting restores local preview.

### Browser bridge deployment

Deploy the Vite frontend and Node bridge separately when using the web build. Serve production WebSockets through TLS and set `ALLOWED_ORIGINS` explicitly. Do not expose a server-owned Xiaozhi token to untrusted users; protect a shared bridge with your own application authentication and rate limiting. The bridge `/health` endpoint exposes service health, never credentials.

## Supported Protocol

- Xiaozhi WebSocket protocol v1 with raw Opus reply frames.
- Client `hello`, `listen` with `state: "detect"` and text, `abort`, and MCP replies.
- Server `hello`, `stt`, `llm` emotion updates, `tts` start/sentence/stop, alerts, custom gestures, and MCP requests.
- Mono Opus reply decoding through `opus-decoder` with scheduled Web Audio playback.
- Optional custom gesture messages such as `{"type":"custom","payload":{"gesture":"wave","emotion":"happy"}}`. Supported gestures are `idle`, `wave`, `hug`, `dance`, and `breathe`.

Voice input uses the browser Speech Recognition API on the web and the native Android recognizer in the APK, then sends the transcript as a Xiaozhi text detection message. It is not raw microphone-to-Opus streaming. In local preview, replies use browser speech synthesis or native Android text-to-speech. In live mode, replies use Xiaozhi Opus audio. Configure live AI personality and voice in Xiaozhi; the Mori personality selector controls only local preview.

Protocol reference: https://xiaozhi.dev/en/docs/development/websocket/

## Project Map

- `src/App.tsx`: application state, interactions, and responsive shell.
- `src/components/Avatar.tsx`: custom 3D model, facial expressions, and gestures.
- `src/components/ChatPanel.tsx`: chat, voice entry, bookmarks, and export.
- `src/components/Panels.tsx`: worlds, memories, personalization, and connection settings.
- `src/hooks/useXiaozhi.ts`: live connection lifecycle and message handling.
- `src/hooks/useVoice.ts`: browser/native voice input and permission handling.
- `src/hooks/useNativeApp.ts`: Android lifecycle and back navigation.
- `src/lib/speech.ts`: native and browser text-to-speech.
- `src/lib/files.ts`: native sharing, file export, and clipboard.
- `src/lib/audio.ts`: ordered Opus decoding and playback.
- `native/android/app/src/main/java/app/mori/companion/MoriXiaozhiPlugin.java`: native authenticated Xiaozhi WebSocket transport for Android.
- `server/xiaozhi-bridge.mjs`: authenticated Xiaozhi WebSocket bridge for the web/browser build.
- `public/images/`: generated virtual-world artwork.

## Verification

The production frontend is verified with the provided project build. Live end-to-end Xiaozhi authentication and upstream responses require a paired device and network access. Android connects natively; the web build requires the optional bridge. No live account credentials are bundled.
## Native voice playback

Android live replies now use native Opus decoding and AudioTrack playback instead of WebView/WASM audio.

## Hands-free listening

Android voice input now includes an optional **Hands-free listening** mode in Settings. Turn it on, tap the microphone once, and recognition automatically restarts after each phrase until you stop it. Recognition pauses while Lumi/Xiaozhi replies to avoid transcribing the phone speaker back into the conversation. See `HANDS-FREE-LISTENING.md`.

## Async browser assistant

The latest build includes non-blocking browser research, automatic handoff into the Computer interface for web-search requests, persistent microphone controls inside the Computer, compact page-reading for concise spoken answers, and safe proactive browser navigation. See `ASYNC-BROWSER-ASSISTANT.md`.
