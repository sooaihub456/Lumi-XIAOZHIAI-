# Xiaozhi wake-word `detect` fix

This Android build no longer submits normal voice transcripts through Xiaozhi's
`listen/state=detect` message. Xiaozhi reserves `detect` for a short wake word,
and current servers reject long text with the warning "Detect is only for wake
words, do not send long texts."

## New Android voice path

1. The app sends `listen/start` with `mode: auto`.
2. Android records 16 kHz mono PCM from the microphone.
3. Android `MediaCodec` encodes 60 ms frames as Opus.
4. Each Opus access unit is sent as a protocol-v1 binary WebSocket frame.
5. Xiaozhi performs its normal server-side STT and returns an `stt` message.
6. When Xiaozhi starts TTS, the native microphone is stopped immediately to
   prevent the speaker reply from feeding back into recognition.
7. Hands-free mode reopens the native microphone after the reply finishes.

Android 10+ provides platform Opus encoding support. If the device cannot create
an Opus encoder, Mori reports a microphone-streaming error instead of falling
back to abusing the wake-word `detect` field.

## Text input

The official Xiaozhi WebSocket protocol currently does not define a general
long-text user-input message. Because of that, the Android build does not fake
text input with `detect`. The chat box remains available for local/demo and UI
commands, but live official-Xiaozhi turns should use the microphone.

Background browser research is also no longer injected back into Xiaozhi using
`detect`; it remains visible/cached in the Computer until the next legitimate
voice turn.
