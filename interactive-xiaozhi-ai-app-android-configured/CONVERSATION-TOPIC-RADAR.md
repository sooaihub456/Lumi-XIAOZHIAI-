# Lumi Conversation Topic Radar

This update gives Lumi fresh conversation material without making the user carry every topic.

## What it does

While proactive conversations are enabled, Lumi refreshes a small local topic cache shortly after launch and then about every 20 minutes. It also refreshes after a new user turn when the cache has become old.

The cache combines three different signals:

- **GDELT DOC 2.0** — recent global news across many publishers/languages.
- **Wikimedia Analytics** — most-viewed English and Chinese Wikipedia pages, used as a broad public-interest/trending signal.
- **Hacker News official API** — high-interest technology/community stories.

Lumi exposes the cache to the connected AI as an MCP tool:

`self.conversation.discover_topics`

Xiaozhi/OpenAI should call that tool when a proactive wake has no strong active topic, the conversation genuinely runs out of momentum, or the user says things such as “anything”, “you decide”, “nothing much”, or “I'm bored”.

## Important: update the Xiaozhi role prompt

For hosted `xiaozhi.me`, open the Lumi agent in the console and replace its role/system prompt with the latest one shown in:

**Lumi → Settings → Voice AI & personality → Lumi's conversation brain → Copy prompt**

The hosted Xiaozhi WebSocket cannot replace the server-side prompt from the phone, so this copy/paste step is required.

The new prompt tells Xiaozhi to:

- never default to “What would you like to talk about?”;
- treat normal replies as an ongoing conversation unless the user explicitly ends it;
- contribute an opinion, angle, idea, implication, example, mini-plan, or suggestion after answering;
- call `self.conversation.discover_topics` on its own when a fresh topic is actually useful;
- pick one good topic instead of reading a list of headlines;
- give its own reaction/connection before asking anything;
- prefer lighter topics for casual proactive chat;
- keep current threads when they still have energy instead of chasing novelty every turn.

## Privacy

Lumi does **not** send raw conversation text to GDELT/Wikimedia/Hacker News.

Interest matching is reduced locally to broad categories such as:

- artificial intelligence
- gaming
- badminton
- anime
- technology
- science
- design
- sports
- business
- entertainment
- travel

Only those broad category labels are used for external topic lookup. The actual user conversation stays with the configured voice AI provider.

## Failure behavior

The radar uses `Promise.allSettled`, so one unavailable source does not break the others. If all fresh sources fail, Xiaozhi receives a `temporarily_unavailable` result and is told to continue the existing thread or choose a timeless lightweight topic itself rather than asking the user to invent one.

Results are cached locally, deduplicated, ranked for broad interest relevance/freshness, and sensitive breaking-news titles are down-ranked for casual conversation.

## Self-hosted Xiaozhi

Keep MCP enabled. The client advertises `features.mcp = true`, serves `tools/list`, and responds to `tools/call` through the existing Xiaozhi WebSocket MCP flow.

For proactive server-side generation, also keep the LLM in the wake path rather than serving only a fixed cached greeting. If your server uses a wake response cache, disable it for this companion behavior.
