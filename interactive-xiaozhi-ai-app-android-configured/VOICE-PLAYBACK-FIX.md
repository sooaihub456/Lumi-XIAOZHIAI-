# Android Xiaozhi voice playback fix

This revision moves Xiaozhi reply audio playback out of the Android WebView.

On Android, `MoriXiaozhiPlugin` now:

1. Opens the authenticated Xiaozhi WebSocket natively.
2. Reads `audio_params.sample_rate` and `channels` from the server `hello` message.
3. Sends each incoming binary WebSocket frame directly to `NativeOpusPlayer`.
4. Decodes the raw Opus packet with Android `MediaCodec`.
5. Streams decoded 16-bit PCM to `AudioTrack` for speaker/Bluetooth playback.

The WebView/WASM `opus-decoder` remains in the project only for web/desktop bridge builds.
Android no longer depends on it for live Xiaozhi voice replies.

The Voice on/off control now enables/disables the native player, and Abort/Interrupt
flushes native queued playback so an old reply does not keep speaking over a new turn.

If Android cannot initialize its Opus decoder or audio output, the settings panel will
show a native playback error while keeping text chat connected.
