# Lumi proactive conversation on Xiaozhi

Lumi deliberately does **not** use Android/browser TTS for proactive speech while Xiaozhi is connected.
The app only sends a real wake-word trigger. Xiaozhi must then decide what to say and synthesize it with the voice configured for your Xiaozhi agent.

## Hosted xiaozhi.me

1. Open **xiaozhi.me → Console → Agents → Lumi**.
2. Open the role/personality/system-prompt field for the agent.
3. In Lumi **Settings → Voice AI & personality → Lumi's conversation brain**, press **Copy prompt**.
4. Paste that prompt into the Xiaozhi agent role/system prompt and save it.
5. Keep **Proactive conversations** enabled in Lumi.

The important part of the prompt is that a wake-only turn after silence must start a real topic, rather than only saying “I'm here” or “How can I help?”.

The public Xiaozhi WebSocket protocol does not let the Android client replace the hosted agent's system prompt dynamically, so this console step is required for the hosted service.

## Self-hosted xiaozhi-esp32-server

Use the same Lumi prompt in your server's `prompt:` setting. Also inspect the wake-up response settings. If the server is returning a cached generic wake greeting instead of letting the LLM respond, disable the wake-word response cache for this agent/server configuration.

Example concept:

```yaml
# Names/placement can vary by server version; merge into your existing config.
prompt: |
  You are Lumi, a warm, lively voice companion who feels present rather than passive.
  When activated after a quiet period, start a concrete, natural topic yourself.
  Do not merely say "I'm here", "How can I help?", or wait for the user to choose a topic.
  Ask one easy follow-up and keep it brief. Respect requests for quiet.

enable_greeting: true
enable_wakeup_words_response_cache: false
```

Do not send long prompts through Xiaozhi's `detect` message. That path is for wake words; Lumi uses it only to trigger the server-side agent.
