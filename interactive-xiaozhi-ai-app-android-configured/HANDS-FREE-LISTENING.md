# Hands-free listening

Mori/Lumi now has an optional continuous listening mode.

## How it works

1. Open **Settings & connection**.
2. Turn on **Hands-free listening**.
3. Tap the microphone once.
4. Speak naturally. Each completed phrase is sent as a normal message.
5. While Lumi/Xiaozhi is replying, microphone recognition pauses so the phone speaker is not transcribed back into the conversation.
6. As soon as the reply finishes, recognition resumes automatically.
7. Tap the microphone / Stop listening control to end the hands-free session.

The preference is saved locally, but the microphone does not begin listening automatically after app launch. The user must still tap the microphone to start each hands-free session.

For privacy and Android lifecycle reliability, a hands-free session is stopped when the app is moved to the background or closed. A separate Android foreground service would be required for persistent background listening.
