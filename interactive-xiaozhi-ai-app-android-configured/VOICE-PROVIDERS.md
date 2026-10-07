# Lumi voice providers

Lumi now has a provider layer instead of being permanently tied to Xiaozhi.

## 1. Xiaozhi AI

Best when you want to keep the existing xiaozhi.me agent, its configured voice, device pairing, and current Android audio path. Proactive speech stays on the Xiaozhi side: Lumi triggers a wake turn and the Xiaozhi agent prompt decides how to open the conversation.

## 2. OpenAI Realtime (implemented alternative)

Lumi can connect through WebRTC to `gpt-realtime-2.1`. This gives direct speech-to-speech audio, interruption handling, and tool calling. The API key stays on your own small token server; the app receives only a short-lived client secret.

Setup:

1. Copy `server/openai-realtime.env.example` to `.env.openai`.
2. Put the real OpenAI API key in `.env.openai` on your trusted server only.
3. Run `npm run voice:openai`.
4. In Lumi Settings choose **OpenAI Realtime** and enter the HTTPS `/token` endpoint.
5. Choose a voice and connect.

For an Android phone that cannot reach your computer's localhost, expose the token endpoint securely over HTTPS. Never put the permanent API key in the APK or frontend source.

## Other reliable options researched

- **OpenAI GPT-Live 1:** especially strong for natural, full-duplex conversation and provider-side proactive greetings. It is a strong future upgrade if Lumi moves to the newer Live session/delegation architecture.
- **Google Gemini Live:** supports bidirectional realtime audio and tool use; client deployments should use short-lived/ephemeral authentication rather than embedding a permanent key.
- **Qwen Omni Realtime:** particularly attractive for Lumi's English/Chinese use case. Current Alibaba Cloud Model Studio supports WebRTC/WebSocket, function calling, multilingual speech, and a Singapore region.

These last two are documented here as future provider adapters; this patch does not pretend they are already connected in the app.
