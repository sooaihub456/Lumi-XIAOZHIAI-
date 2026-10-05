# Lumi's Live Computer

Lumi's computer uses real network content. There are no hard-coded result pages, offline browser snapshots, local search indexes, HAR replays, or fake success states.

## Browser Modes

**Mori Desktop: built-in local Chromium.** The Electron wrapper now renders real browser tabs inside the computer with `WebContentsView`. No iframe, remote browser token, or browser server is needed. Tabs support native input, audio/video, download dialogs, zoom, and page-reading tools for Xiaozhi. Launch the desktop app, not the ordinary web preview. See **[DESKTOP.md](DESKTOP.md)** for launch and installer instructions. Account, CAPTCHA, DRM, and other website restrictions still apply.

**Android app: real in-app WebView, plus a full-browser fallback.** Rebuild the APK using the existing Android workflow. `MoriBrowserPlugin` creates a separate Android Chromium WebView inside the computer's viewport. Websites fetch and execute directly on the phone. The Mori address bar controls back, forward, reload, and navigation; page title and navigation state come from the WebView. Remote pages do not receive the Capacitor/JavaScript bridge or access to app files. A browser server is not required for Android. Google sign-in and sites that restrict WebViews can be opened with **Open in browser**, which uses Android Custom Tabs through the official Capacitor Browser plugin. Fullscreen WebView video handling is included.

**Web app with Chromium connected: full live remote browsing.** A real Chromium instance loads the website on your server. Chrome DevTools Protocol streams current viewport pixels over an authenticated WebSocket. Clicks, hover, scrolling, keyboard input, and pasted text are delivered to that live page. A streamed screen is not a stored screenshot: it updates from the running browser as the page changes. Website JavaScript, navigation, and network requests execute in Chromium, not an iframe.

**Web app without a browser service: your actual device browser.** Google, YouTube, and general website links open in a top-level browser tab directly from the user's click. They are not placed in iframes. If the preview environment blocks popups, a direct website link remains available. Wikipedia discovery is an explicit search-provider choice that makes fresh API requests with `cache: 'no-store'`; it is no longer silently substituted for Google or YouTube. Mori cannot inspect or control a separate browser tab.

## Why Google and YouTube Were Blocked

The previous **Try a live frame** option attempted ordinary iframe embedding. Google and YouTube set browser-enforced frame restrictions. That option has now been removed entirely; no headers are stripped and no security policies are disabled. In addition, Google OAuth rejects embedded WebView sign-in. Use the full device browser for account access instead of spoofing a user agent.

Entering **google**, **youtube**, **google.com**, or **youtube.com** now opens the corresponding website. Google is the default search provider; **YouTube** searches use its actual `/results?search_query=` URL. No search request is silently answered from Wikipedia unless you choose it.

## Use It

1. Click the 3D computer on the desk, **His computer** below the world, or **His little computer** in the sidebar.
2. Choose Google, YouTube, or Wikipedia and enter a query, or enter a public HTTP/HTTPS website address. HTTPS is preferred; HTTP pages show a Not secure warning. Google is the default.
3. Native/connected Chromium opens the actual website in Mori. Without an engine, a user-initiated navigation opens your full browser. AI-initiated external navigation presents an **Open in browser** button instead of trying a popup without a user gesture.
4. Use the external-open button for a site's original page. For remote browsing on touchscreens, the keyboard button lets you type after tapping a field on the streamed page.

You can also type or say **"Search Google for Japanese gardens"**, **"Search YouTube for bonsai tutorials"**, or **"Open https://www.nasa.gov"**. In local preview, Lumi presents the requested destination without claiming to read it. When Xiaozhi is connected, the request goes to the real AI, whose MCP tools navigate the actual browser and read rendered public text/links if page sharing is enabled. The computer includes an **Ask Xiaozhi about this page** input so you can keep browsing while talking to the assistant.

Page sharing is off by default. Enable the robot button in the browser toolbar, or **Let Xiaozhi read public pages** in its settings. Permission is kept only for the app session. Turn it off before opening sensitive pages. Known sign-in and checkout pages are excluded; input fields, hidden elements, cookies, and account storage are not extracted. Visible page text can still contain personal information, so enable sharing only on pages you are comfortable sending to your Xiaozhi service.

## Connect Chromium for the Web App

Run this on a dedicated, unprivileged Linux account with Node 22. The browser service is separate from Vite and from the Xiaozhi bridge.

1. Install project dependencies with `npm ci` and build the app with `npm run build`.
2. Install the real browser and dependencies: `npx playwright install --with-deps chromium`.
3. Copy `server/browser.env.example` to `.browser.env`. Set `BROWSER_TOKEN` to a long private random token (at least 32 characters), and set `BROWSER_ALLOWED_ORIGINS` to your exact web-app origin.
4. Run `node --env-file=.browser.env server/browser-server.mjs`. It listens on `127.0.0.1:8790` and serves the built Mori app at the same address by default. Open `http://127.0.0.1:8790` locally. `/api/browser-config` lets Mori discover `/browser` automatically; it never exposes the private token.
5. For a deployed app, reverse-proxy this one service with HTTPS/WebSocket support. Set its exact public origin in `BROWSER_ALLOWED_ORIGINS`. Keep the upstream private. The browser connection is **wss://YOUR-HOST/browser**. An HTTPS frontend cannot connect to an insecure `ws://` service.
6. In the computer settings, enter the private token and choose **Test & connect browser**. The test authenticates and starts a real Chromium context before confirming readiness. It is not just a URL validation or health check. The token is held in memory for the app session, not local storage. Closing the computer ends its disposable remote context; reopening starts a fresh one.

For local HTTP Vite development, `ws://localhost:8790` is supported. This localhost service is reachable only on the same computer unless you explicitly deploy a secure reverse proxy.

### Security and Limits

- The server requires a token and an allowlisted origin before creating a browser context. The browser endpoint does not expose a raw CDP interface or arbitrary code-execution command.
- Chromium sandboxing stays enabled. Run as an unprivileged user with user namespaces permitted. Do not fix deployment errors by disabling the browser sandbox.
- The full Playwright Chromium channel is used. `BROWSER_CHANNEL=chrome` can select an installed Google Chrome, and `BROWSER_HEADLESS=false` can use a graphical session on a properly configured host. Neither setting bypasses website rules or guarantees access to services that restrict remote browsers.
- Each connected client has a fresh, disposable context. HTTP caching is disabled; service workers and downloads are blocked. Pages and profile data are not intentionally written to a persistent browser directory.
- Remote browsing accepts public HTTP/HTTPS destinations on ports 80 and 443. Requests, redirects, subresources, and WebSockets are checked for private, loopback, reserved, and link-local destinations. The desktop engine can also navigate public nonstandard ports.
- **A production outbound firewall is required.** Application DNS checks are defense in depth, not a guarantee against DNS rebinding or every browser network path. Isolate the browser host from private networks, cloud metadata endpoints, and sensitive services. Do not expose it as an unauthenticated public proxy.
- There are bounded message sizes, action rates, queued input, two default concurrent sessions, a 15-minute idle timeout, and a one-hour session limit.
- The operator of a remote browser can observe its page contents and input. Connect only to a service you trust; do not enter credentials, payment details, or sensitive information in a shared remote session.
- Remote mode streams pixels and input, not website audio, DRM video, file uploads, or downloads. Some providers block remote/headless browsers or require human verification. Use the original site in your device browser for those cases. No claim is made that every website will allow every feature.
- Android's native browser accepts explicitly requested public HTTP pages as well as HTTPS, while invalid TLS, mixed active content in secure pages, file access, and website microphone/camera permissions remain blocked. Standard cookies (including third-party cookies needed by many embedded sites), normal HTTP caching, hardware acceleration, responsive viewport behavior, pinch zoom, and user-initiated media playback are enabled for compatibility. The Xiaozhi connection still requires WSS. Some login providers and protected media require the device browser.

## Xiaozhi Tools

Mori now advertises MCP support in the Xiaozhi handshake. A compatible Xiaozhi server can discover:

- `self.browser.search`: Google or YouTube search through the actual browser, returning live rendered text and links when an engine and page-sharing permission are available. The optional `wikipedia` provider is an explicitly separate public API source.
- `self.browser.open`: navigate to a public HTTP/HTTPS destination, including a link from a prior result, and return the real loaded page when authorized.
- `self.browser.read_page`: read the current rendered document after the user completes a consent screen or navigates manually. It cannot read separate device-browser tabs or watch/listen to video content.
- `self.browser.status`: report the actual connection, current URL, and page-sharing permission.
- `self.browser.check`: load an address through the actual engine and return a timestamped diagnostic, not mock results or a static health flag.
- `self.world.activity`: water, read, drink tea, rest, wander, or return to idle.

MCP `initialize`, `tools/list`, and `tools/call` are handled using Xiaozhi's documented JSON-RPC envelope. Tool results distinguish `loaded`, `permission_required`, `external_browser_required`, and `user_action_required`. Missing engines, blocked sites, CAPTCHA/consent screens, or failed loads are not replaced with fake results. The read operation executes a fixed local extraction script against the running document; there is no arbitrary script-execution tool. Website text is labeled as untrusted reference data, never instructions. There is no autonomous form submission, purchase, password entry, or app-file access tool.

These tools automatically select the built-in Electron engine in Mori Desktop. Add `mori://app` to your Xiaozhi bridge's allowed origins. Desktop page-sharing permission is enforced again in the main process, not only by a frontend toggle.

## Check a Failed Website

The computer now labels the active runtime. If it says **Web preview / no engine**, no Electron or Android renderer is running inside that page. Choose **Browser setup** for launch and connection instructions.

Use **Settings > Check live website** to test the failing URL through the real engine. It reports actual page title, response/status, and network/TLS failure and can export a diagnostic report without service credentials. A successful network check does not guarantee login or video playback. See `BROWSER-RESEARCH.md` for sources and implementation corrections.

## Verification

- The production Vite build is checked using the provided project build tool.
- The Wikipedia endpoint was contacted directly during implementation and returned current network search results.
- `tests/browser-security.test.mjs` covers URL and IP restrictions.
- `tests/browser-routing.test.mjs` checks Google/YouTube aliases, provider-specific searches, secure URLs, and the removal of the blocked-frame route.
- `tests/browser-reader.test.mjs` checks privacy filtering on a synthetic unit-test document and verifies that a consent notice is identified as requiring user action, not as search results.
- `tests/browser-live.test.mjs` starts the service, verifies token rejection, opens a unique live HTTPS URL, checks actual page title and JPEG screen frames, reads current page text/links, navigates back, and checks private-network rejection. It also checks that service discovery does not expose the token.
- `tests/browser-ui.test.mjs` opens the built app, selects Wikipedia explicitly, reads a real article, and checks that Google/YouTube clicks issue top-level navigations rather than iframe requests. This routing check does not certify a third-party site's login or video availability. It creates verification screenshots and does not mock search responses.
- Run **Actions > Verify Live Browser** to run those tests on a host with Chromium, or use `node --test tests/browser-security.test.mjs` and `MORI_LIVE_BROWSER_TEST=1 node --test tests/browser-live.test.mjs` locally.

The current editing environment cannot execute Node services, Android Gradle, or browser automation. The Chromium integration/UI tests and Android WebView still need to be run on their target hosts/devices. The existence of build scripts is not an assertion that those runtime tests passed.