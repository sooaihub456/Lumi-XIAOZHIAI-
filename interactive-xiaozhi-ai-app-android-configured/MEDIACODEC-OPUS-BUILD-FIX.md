# Android Opus build fix

This revision removes the external Concentus dependency that caused GitHub Actions to fail with `package org.concentus does not exist`.

Xiaozhi voice playback now uses Android's built-in `MediaCodec` Opus decoder. The player explicitly supplies the Opus codec-specific data required by Android (`csd-0` OpusHead, `csd-1` codec delay, and `csd-2` 80 ms seek pre-roll) and streams decoded PCM to `AudioTrack`.

The only extra Gradle dependency injected by `scripts/prepare-android.mjs` is OkHttp for the authenticated native WebSocket.
