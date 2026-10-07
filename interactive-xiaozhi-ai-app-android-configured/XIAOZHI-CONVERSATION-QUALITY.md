# Make Xiaozhi/Lumi lead conversations instead of waiting for the user

This update has two layers:

1. **A stronger Lumi role/system prompt** that explicitly gives the AI responsibility for conversational momentum.
2. **A bounded follow-through turn** in the Lumi app. After Xiaozhi finishes a normal reply, if the user stays silent, Lumi may wake Xiaozhi for a small bounded chain (Calm 1, Balanced 2, Lively 3 follow-throughs) so the server-side AI can continue the same topic with its normal Xiaozhi voice.

The app never uses Android/browser robotic TTS for these follow-through turns while Xiaozhi is connected.

## Hosted xiaozhi.me

Open your Lumi agent in the Xiaozhi console and replace its role/system prompt with the latest prompt shown in Lumi:

**Settings → Voice AI & personality → Lumi's conversation brain → Copy prompt**

Paste it into the Xiaozhi agent's role/personality/system-prompt field and save.

The important rules in this prompt are:

- Lumi must share responsibility for carrying the conversation.
- It must not default to “What would you like to talk about?”, “How can I help?”, or similar passive hand-offs.
- Short replies such as “yeah”, “okay”, “nothing much”, and “I don't know” are treated as permission for Lumi to pick a sensible direction and continue.
- A wake-up shortly after the previous AI reply means **continue the current thread**, not “greet the user again”.
- If Lumi previously asked a question and the user stayed quiet, it should contribute its own answer/thought instead of repeating the question.
- A normal reply should not be a conversational dead end. Unless the user is explicitly leaving or asking for quiet, Lumi should add a useful angle, opinion, idea, implication, example, suggestion, or specific next thread.
- When the current thread is genuinely exhausted, Xiaozhi should call `self.conversation.discover_topics` and introduce one fresh relevant/light topic itself instead of asking the user to choose a subject.

The public Xiaozhi WebSocket protocol does not let the phone replace the hosted system prompt dynamically, so the console prompt is essential.

## Self-hosted xiaozhi-esp32-server

Use the latest Lumi prompt under your server's `prompt:` configuration.

Also disable the wake-word response cache for this behavior. A cached wake greeting can bypass the LLM and therefore bypass the conversation-leadership instructions:

```yaml
enable_wakeup_words_response_cache: false
enable_greeting: true

prompt: |
  # Paste the latest Lumi prompt here.
```

### Improve long-term continuity

The current xiaozhi-esp32-server supports dialogue history plus pluggable Memory providers. For a companion-style Lumi, consider a real memory provider rather than `nomem`.

For stronger long-term personal continuity, PowerMem supports user profiles and retrieval. Example direction:

```yaml
selected_module:
  Memory: powermem

Memory:
  powermem:
    type: powermem
    enable_user_profile: true
    llm:
      provider: qwen
      config:
        api_key: YOUR_KEY
        model: qwen-plus
    embedder:
      provider: openai
      config:
        api_key: YOUR_KEY
        model: text-embedding-v4
        openai_base_url: https://dashscope.aliyuncs.com/compatible-mode/v1
    vector_store:
      provider: sqlite
      config: {}
```

Use the exact model/provider names supported by your installed Xiaozhi server version.

## Conversation behavior after this update

Instead of:

> User: Work was tiring.  
> Lumi: I see. What would you like to talk about?

Aim for:

> User: Work was tiring.  
> Lumi: Sounds like one of those days that completely drains the battery. I'd vote for a low-effort evening—food, shower, then something stupidly entertaining. What part of work was the worst?

If the user then stays silent, Lumi can make a short server-side follow-through such as:

> Actually, I'd probably start with food first. Bad days feel about 20% less terrible once you're not hungry.

That follow-through is generated and spoken by the connected AI provider, not by Android system TTS.


## Fresh topics without making the user choose

The latest app exposes `self.conversation.discover_topics` through the existing Xiaozhi MCP connection. It pulls from a locally cached mix of recent global news, English/Chinese public-interest trends, and technology/community stories. The system prompt tells Xiaozhi to call this tool on its own only when the current thread is weak or exhausted.

Good behavior:

> Lumi: "I was looking at what's getting attention today, and one story about AI agents getting more capable at multi-step tasks caught me. The interesting part isn't just that they can do more—it changes what an app like me should handle without making you micromanage every step. I'd rather become better at noticing the right moment to act than just become noisier."

Bad behavior:

> Lumi: "Here are five trending headlines. Which one would you like to discuss?"

The second example still makes the user carry the conversation, so the prompt explicitly forbids that pattern.
