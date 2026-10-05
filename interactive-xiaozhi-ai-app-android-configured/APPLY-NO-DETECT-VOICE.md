# Apply the No-Detect Voice Fix

Copy the files in this patch into the root of your existing `interactive-xiaozhi-ai-app-android-configured/` project and replace files when prompted.

The Android Xiaozhi live microphone path now uses the official voice protocol:

- send `listen/start`
- capture the microphone natively
- encode 16 kHz mono PCM to Opus with Android `MediaCodec`
- stream binary Opus packets to Xiaozhi
- send `listen/stop` when listening ends

Normal spoken user turns are no longer converted to long text and sent with `listen/state=detect`. The `detect` state is reserved for wake words.

After applying the patch, commit/push to `main` and run the existing GitHub Android APK workflow.
