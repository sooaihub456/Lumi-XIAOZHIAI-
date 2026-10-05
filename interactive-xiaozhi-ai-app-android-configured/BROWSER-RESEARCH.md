# Browser Access: Research and Corrections

## Sources Reviewed

1. **Min browser source:** https://github.com/minbrowser/min/blob/master/main/viewManager.js
2. **Electron web embedding guide:** https://www.electronjs.org/docs/latest/tutorial/web-embeds
3. **Electron WebContentsView:** https://www.electronjs.org/docs/latest/api/web-contents-view
4. **Electron sessions and profiles:** https://www.electronjs.org/docs/latest/api/session
5. **Qt WebEngine features:** https://doc.qt.io/qt-6/qtwebengine-features.html

Min is a functioning Electron-based browser. Its source uses real Chromium views, separate page WebContents, native navigation events, and native popup WebContents. Qt WebEngine similarly embeds Chromium. Neither approach turns an ordinary hosted React webpage into a browser engine.

## Problems Found in Mori

| Problem | Correction |
| --- | --- |
| A blanket HTTPS-only rule rejected HTTP pages and HTTP redirects. | Public HTTP and HTTPS pages are accepted, with an explicit unencrypted-connection warning for HTTP. TLS validation is unchanged. |
| `example.com:8443` was parsed as a URI scheme. | Host/port addresses, IP addresses, protocol-relative links, and international domain names are recognized before scheme parsing. |
| Local browser requests were filtered like a restrictive hosted proxy. | Normal public HTTP(S), WS(S), blob, and data resources are allowed. File/app schemes and private IP destinations remain isolated. Chromium enforces mixed-content and same-origin rules. |
| Desktop cookies were discarded on every application restart. | Standard browser profiles persist website cookies and storage separately from Mori. An explicit Private session option remains available. |
| Every popup was recreated as a plain URL load, which could lose form POST data and opener behavior. | Native popup WebContents are adopted, preserving Chromium's navigation semantics while keeping Node access off. |
| Renderer updates to the displayed URL could trigger another navigation. | Explicit navigation IDs are separate from observed URLs. Redirects, in-page links, and tab switches update the address bar without reissuing an old load. |
| Closing Android's computer destroyed its navigation context. | The browser is hidden and paused, then reused. App destruction still releases it. |
| A configured URL or successful frontend build could be mistaken for a running browser. | The computer shows its runtime explicitly and provides a real website-load diagnostic. A web preview with no engine is labeled as such. |

## Check the Actual Runtime

Open **His computer > Settings > Check live website**. Enter the failing public address. The check uses the selected Electron, Android, or remote Chromium engine and reports:

- Engine used, target/final address, page title, and time of the actual check.
- HTTP status where the platform exposes it, or the real network/TLS error.
- A missing-engine error instead of claiming success in the ordinary web preview.
- Consent/verification/access-denied detection where the engine's diagnostic reader can identify it. Those screens are not counted as search results.

The report can be downloaded without including the Xiaozhi token or browser-service token. It tests a main page load, not universal sign-in, CAPTCHA, DRM, or media support. Xiaozhi can request the same check with `self.browser.check`.

**Open installed Mori Desktop** uses a registered `mori-browser://open` link to hand the requested public website to an already-installed desktop app. It does not install an app, create an engine in the webpage, or bypass browser/OS prompts. The desktop handler validates the action and destination and never enables page sharing automatically.

## A Required Distinction

**The website preview is still a website.** It can request CORS-enabled data or open an external browser tab, but it cannot instantiate Electron or render sites that forbid framing. To use the embedded local engine, launch Mori Desktop or install the updated Android APK. To use it inside a hosted web app, connect a running remote Chromium service.

Adding an Electron source file is not the same as running an installed executable. Changing React code does not update the Java plugin inside an already-installed APK. No fake browser, iframe-policy stripping, TLS bypass, or silent Wikipedia substitution is used to hide this distinction.

## Verification

The Vite production build is checked in this workspace. Native execution is not available here, so the following runtime tests are included for the native build workflow but are not claimed as passed:

- `tests/desktop-compatibility.test.mjs` uses an actual local HTTP server and the actual Electron engine to test JavaScript/CSS requests, cookies, redirects, POST popups, and navigation preservation. Its test-only hostname mapping is not shipped in Mori.
- `tests/desktop-live.test.mjs` loads a real public HTTPS page, checks isolation and page-sharing permission, and runs the real engine diagnostic.
- URL, protocol, and private-network regression tests cover the revised navigation rules.
- The web UI test checks that the preview honestly reports the absence of a native engine.

No browser can promise access to every site or every feature. Site outages, network filtering, account policies, human verification, and licensed DRM are outside Mori's control. The diagnostic is intended to distinguish those failures from an app bug or a missing browser runtime.