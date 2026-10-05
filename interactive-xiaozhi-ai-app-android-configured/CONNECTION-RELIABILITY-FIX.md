# Android Xiaozhi connection reliability fix

This build keeps the direct native Android Xiaozhi connection resilient instead of treating every temporary disconnect as a fatal error.

## What changed

- OkHttp sends WebSocket control pings every 20 seconds to keep NAT/proxy state alive.
- Unexpected disconnects are retried automatically forever while the app process is alive.
- Retry delays use bounded exponential backoff: 1s, 2s, 4s, 8s, 15s, then 30s.
- The app remembers the authenticated Xiaozhi URL / Device ID / Client ID / token only in process memory while connected.
- The initial Xiaozhi `hello` packet is remembered and replayed automatically after a reconnect so the server can issue a fresh `session_id`.
- The UI returns to `connecting` during a temporary drop and becomes `connected` again when a fresh server `hello` arrives. The user does not need to press Connect again.
- Temporary network failures, server restarts, Wi-Fi/mobile-data changes, and ordinary server idle closes are retryable.
- Authentication / policy / TLS / invalid-protocol failures remain fatal so bad credentials do not create an endless reconnect loop.

## Important behavior

Xiaozhi servers may intentionally close an idle WebSocket after a silence timeout. This client does not try to defeat server-side session policy. Instead it automatically reconnects and performs a new Xiaozhi hello handshake.

The connection is best-effort while the Android app process is alive. Android can still suspend or kill background apps. A truly permanent background connection would require an Android foreground service and a persistent notification.
