# Lumi browser-assistant upgrade

This build changes browser tasks from a blocking tool flow into a visible, background research flow.

## What changed

- Search-like user requests immediately open Lumi's Computer interface.
- The same persistent/hands-free microphone can now be controlled from the Computer assistant bar.
- Opening the Computer no longer aborts an active hands-free microphone session.
- `self.browser.search` now returns a job acknowledgement immediately and performs the real search asynchronously.
- When background research completes, the result is sent back into the live Xiaozhi conversation automatically so Lumi can continue the task.
- Browser work no longer clears the conversation simply because a real site takes longer than the old timeout.
- Page text given to Xiaozhi is compacted. The user still sees the whole page, while Lumi receives only a useful extract and a limited set of links.
- Tool guidance explicitly tells Lumi to summarize what matters instead of reading the page line-by-line.
- A new `self.browser.command` tool lets Lumi proactively send safe back/forward/reload/stop navigation commands.
- Login, CAPTCHA, consent, checkout, payment and other sensitive/user-approval steps remain user-controlled.

## Background research behavior

1. User asks Lumi to search/research/look something up online.
2. The Computer opens immediately.
3. Xiaozhi starts the browser-search tool.
4. The tool responds immediately with a background job id, so Xiaozhi can keep speaking instead of waiting silently.
5. The browser or Wikipedia API continues separately.
6. When the result is ready, Mori injects a hidden background-research context turn to Xiaozhi.
7. Xiaozhi continues the earlier task and should speak only the useful answer, not the raw page contents.

Google and YouTube research still use the real in-app browser. If page sharing is disabled, the user sees the page but Lumi will ask for page-sharing permission before reading it. Wikipedia can be searched through its public API without browser page sharing.
