# Android direct Xiaozhi connection

This build removes the bridge requirement from the Android APK.

## What changed

- Android registers a native Capacitor plugin named `MoriXiaozhi`.
- The plugin opens the secure Xiaozhi WebSocket with native OkHttp so it can attach `Authorization`, `Device-Id`, `Client-Id`, and `Protocol-Version` during the HTTP upgrade.
- The React UI sends the normal Xiaozhi `hello` after the native socket opens and waits for the server `hello` before showing Connected.
- Server JSON/MCP messages are forwarded to the existing UI. Binary Opus frames are forwarded to the existing audio decoder.
- The access token remains session-only in the frontend; Mori does not save it to localStorage.
- The browser/web build still uses `server/xiaozhi-bridge.mjs` because browser WebSocket APIs cannot add arbitrary handshake headers.

## Android settings

Open **Settings & connection** and enter:

- Xiaozhi WebSocket URL: `wss://api.xiaozhi.me/xiaozhi/v1/` unless your paired device uses another server.
- Paired Device ID.
- Paired Client ID.
- Paired access token.

No Cloudflare tunnel, PC bridge, or `ALLOWED_ORIGINS` value is needed for the Android APK.

## Rebuild

Rebuild the APK after applying these files. The included GitHub Actions workflow can compile the project. The native build adds OkHttp 4.12.0 to the generated Android app.

If connection fails, the native transport now reports handshake HTTP errors such as 401/403 separately from TLS/network failures. Never post the full access token in an issue or screenshot.
