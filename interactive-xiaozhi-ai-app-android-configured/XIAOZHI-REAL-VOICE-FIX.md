# Xiaozhi real voice playback fix (Android)

This build removes the Android system-TTS fallback from live Xiaozhi sessions and makes Xiaozhi's own streamed voice the only live assistant voice.

## What changed

- Incoming Xiaozhi protocol-v1 binary frames are decoded as raw Opus with Concentus, then streamed as PCM through Android `AudioTrack`.
- The decoder follows the server `hello.audio_params` sample rate, channel count, and frame duration.
- Playback uses Android `USAGE_MEDIA` + speech content routing for more consistent phone speaker/Bluetooth behavior.
- Old queued Opus packets are discarded immediately after interrupt/mute/reconnect instead of continuing to play.
- Android emits an `audioState` event when the real Xiaozhi stream is ready/playing.
- While connected to Xiaozhi on Android, Mori no longer calls the phone's TextToSpeech engine for assistant replies or the Read Aloud button. This prevents the robotic device voice from being mistaken for Xiaozhi's configured voice.
- Local preview mode still keeps the device TTS feature.

## Android dependency

`scripts/prepare-android.mjs` automatically adds:

`io.github.jaredmdobson:concentus:1.0.1`

This is a pure-Java Opus codec and is fetched from Maven Central by Gradle during the Android build.

## Build

Use the existing GitHub Actions Android workflow. Commit the patch to `main`, wait for `Build Android APK`, then install the new `mori-preview.apk` artifact.
