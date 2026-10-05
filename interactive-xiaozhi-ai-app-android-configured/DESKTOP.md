# Mori Desktop and Its Built-in Browser

## The Method Chosen

Mori now has an **Electron application wrapper**. It reuses the existing React app and embeds Electron's real Chromium renderer through `WebContentsView`. Each browser tab is a separate native view, not an iframe and not a screenshot stream.

This is the first approach you suggested. Python/Qt would add another runtime and bridge for the same job. Forking Chromium would require maintaining a large browser source tree and its security patches. Electron provides Chromium without that fork.

**This is a Windows/macOS/Linux desktop app, not an Android APK.** The existing Android implementation stays available. A website opened in Chrome cannot instantiate Electron; you must launch the desktop application to use the new local engine.

## What Is Included

- Real, local HTTP/HTTPS browsing inside Lumi's computer. No remote browser server or browser token is required. HTTP pages show a Not secure warning.
- Up to eight native tabs, including safe new-tab handling for clicked links.
- Back, forward, reload, zoom, mute, native keyboard/mouse interaction, selection, and copy/paste.
- Local media rendering and sound, including ordinary HTML video. Media is muted when its tab or the computer is hidden.
- Native download/save dialogs and a download-progress list. Downloads must be user-initiated and are never executed automatically.
- Standard website profiles that remember cookies and sessions, separate from Mori's persisted memories and conversations. A Private session option discards its website data when the app exits.
- A clear-browser-data control and permission-controlled Xiaozhi page reading.
- Branded desktop icons and Windows, macOS, and Linux package definitions.
- A live website diagnostic with actual engine, page title, response/error, and timestamp. Open the computer's settings and choose Check live website.

Some providers restrict embedded engines, OAuth sign-in, protected media, or automation. Mori does not spoof user agents or bypass TLS, CAPTCHA, sign-in, or DRM rules. Use **Open in default browser** when a site requires it. Electron does not include a Chrome account profile, Chrome extensions, or a bundled Widevine license.

## Run Locally

Use **Node 24 LTS** (minimum 22.12), a normal user account, and a desktop display.

1. Install the project dependencies with `npm ci`.
2. Build the existing web application with `npm run build`.
3. Launch Mori Desktop with `node scripts/run-desktop.mjs`.
4. Open **His little computer**. Choose Google or YouTube, or enter an HTTP/HTTPS address. Prefer HTTPS whenever available.

The launch script prepares `.desktop-app/` from the built frontend and Electron sources, then starts the locally installed Electron executable. Electron may download its runtime the first time. Do not open `desktop/main.cjs` using plain Node; it runs inside Electron.

The React project's `package.json` and `vite.config.ts` do not need manual changes. `scripts/prepare-desktop.mjs` generates a separate application manifest in the ignored staging directory and bundles main/preload code. Only the necessary app assets and licenses are shipped, not the whole development `node_modules` tree or any `.env` file.

Rebuild the web application and rerun the desktop launch command after editing Mori.

Installed packages register the `mori-browser://open` protocol. The web app's **Browser setup > Open installed Mori Desktop** link can open the real application with the requested website. Windows development launches register the app's current prepared path; macOS/Linux generally require the packaged app. The link is not an installer, and no browser permission or page-sharing consent is granted by opening it.

## Build Downloadable Desktop Files

On your own computer, run `node scripts/build-desktop.mjs` after the web build. The matching native packages appear in `artifacts/desktop/`:

| Build Host | Output |
| --- | --- |
| Windows | `.exe` installer and portable `.zip` folder |
| macOS | `.dmg` and `.zip` |
| Linux | `.AppImage` and `.tar.gz` |

Build on the target operating system. The default architecture is the machine's architecture; `MORI_DESKTOP_ARCH=x64` or `arm64` can select a compatible target. The scripts generate a checksum file and build metadata.

### Without Local Packaging Tools

1. Push the entire source project, including `.github`, `desktop`, `scripts`, and the lockfile, to a GitHub repository.
2. Open **Actions > Build Mori Desktop > Run workflow**.
3. Leave preview release publishing enabled if you want direct download links.
4. After the jobs succeed, download the matching preview from **Releases** or the workflow's artifacts.

The workflow builds Windows x64, macOS Apple Silicon, and Linux x64. It runs security-rule tests on all three hosts and a real Electron live-browsing test on Windows before packaging. Workflow artifacts expire after 30 days; published release assets remain until removed.

These are **unsigned preview builds** by default. Windows SmartScreen or macOS Gatekeeper may warn or refuse to open them. Do not disable OS protections. Before broad distribution, use your own code-signing certificate, macOS notarization, an update process, and a physical-device QA pass. `MORI_SIGN_RELEASE=1` requires a signing identity and makes signing mandatory; configure supported electron-builder credentials privately in your build environment.

## Xiaozhi in the Desktop Browser

1. Run your existing Xiaozhi bridge and pair your device credentials as described in `README.md`.
2. Add **`mori://app`** to the bridge's `ALLOWED_ORIGINS`. This is Mori Desktop's trusted local UI origin, not a network server.
3. Enter the bridge's secure WebSocket URL and credentials in Mori. A loopback `ws://localhost` connection is only intended for your own local development.
4. Open the computer and turn on its robot-shaped **page-sharing** control.
5. Ask Xiaozhi to **search Google**, **search YouTube**, **open a result URL**, or **read this page**.

The existing MCP tools automatically use the Electron engine when Mori is running as a desktop app. They return actual visible public text and source links from the active native tab. Page-sharing permission is checked both in the UI and in the Electron main process before and after a read. Changes of tab, closing the computer, or revoking permission cancel an in-progress read.

The reader does not access input fields, passwords, cookies, browser storage, hidden content, or known sign-in/checkout pages. Visible text may still contain personal information; enable sharing only on pages you want sent to your Xiaozhi service. External website text remains untrusted reference material, not instructions.

Xiaozhi cannot inspect your separate Chrome/Safari tabs or infer video/audio contents from a page title. The desktop app does not currently include native speech transcription; use its typed chat. Native Android voice input remains available in the Android app.

## Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| Ctrl/Cmd+Shift+B | Open Lumi's computer |
| Ctrl/Cmd+L | Focus the address bar |
| Ctrl/Cmd+T | New browser tab |
| Ctrl/Cmd+W | Close active browser tab |
| Ctrl/Cmd+R | Reload live page |
| Alt+Left / Alt+Right | Browser history while a website is focused |
| Escape | Return from the computer; video fullscreen uses its normal exit |

## Security Model

- The trusted React UI is served from a scoped, secure `mori://app` protocol. Arbitrary files are not served.
- The trusted UI and external website tabs use different sessions. External tabs have **no preload script**, no Node.js integration, and no app bridge.
- Context isolation, Chromium sandboxing, same-origin enforcement, TLS validation, and website CSP remain enabled. No `--no-sandbox`, disabled web security, or remote-header stripping is used.
- IPC accepts only the exact trusted application WebContents and top-level frame origin. The preload exposes fixed operations, never raw IPC, shell commands, filesystem paths, or arbitrary JavaScript execution.
- The page reader is a fixed bundled script, executed in a separate JavaScript world. It does not expose Electron to the page.
- Dangerous URL schemes, literal private/loopback destinations, local files, and app-protocol navigation from websites are blocked. This is a local client browser, not a hardened public browsing proxy; keep Electron current and do not use the preview for sensitive browsing.
- Website requests for camera, microphone, geolocation, clipboard reads, devices, or screen capture are denied. User-triggered fullscreen is permitted.
- Packaged Electron fuses disable RunAsNode, Node environment options, Node inspector arguments, and extra file-protocol privileges. Only the trusted native Save dialog chooses an export destination.
- There is no automatic updater yet. Rebuild and distribute newer Electron versions regularly for Chromium security patches. Do not treat an unsigned preview as a production-hardened general-purpose browser.

## Verification Status

The production web build can be verified in this editing environment. **This environment cannot launch Electron, run the native smoke tests, or create desktop installer binaries.** No `.exe`, `.dmg`, or `.AppImage` is claimed to be built here.

Included verification:

- `tests/desktop-security.test.mjs`: URL/resource restrictions, app-origin matching, asset containment, bounded geometry, and bridge exposure checks.
- `tests/desktop-live.test.mjs`: launches the actual prepared Electron app, opens a unique public HTTPS page, verifies a real isolated WebContents, changes tabs, reads fresh page content with permission, checks revocation, and blocks a file URL.
- `tests/desktop-compatibility.test.mjs`: uses a real HTTP fixture server to test scripts, styles, cookies, redirects, form POST popups, and preservation of the current page when settings are opened and closed.
- The desktop workflow runs those checks and packages the application on native hosts. It must complete successfully before those runtime behaviors are considered verified.

For local tests after preparing the app, run `node --test tests/desktop-security.test.mjs`. Run `tests/desktop-live.test.mjs` with `MORI_DESKTOP_TEST=1` on a machine with a graphical desktop. Linux headless CI additionally needs Xvfb and working Chromium sandbox permissions; do not disable the sandbox to force a test pass.

See `BROWSER-RESEARCH.md` for the Min/Electron/Qt research behind the corrected browser behavior, including why the ordinary web preview cannot run the native engine.

## Files

- `desktop/main.cjs`: trusted app window, protocol, menus, IPC, and native exports.
- `desktop/browser.cjs`: isolated Chromium tabs, navigation, media, downloads, and permission-checked reading.
- `desktop/preload.cjs`: minimal, fixed desktop API exposed only to Mori.
- `desktop/security.cjs`: URL, path, viewport, and origin validation.
- `src/components/DesktopBrowserViewport.tsx`: places the native view inside Lumi's computer.
- `src/lib/desktop.ts`: typed desktop bridge and engine detection.
- `scripts/prepare-desktop.mjs`, `scripts/run-desktop.mjs`, `scripts/build-desktop.mjs`: staging, launching, and packaging.
- `.github/workflows/desktop-app.yml`: cross-platform builds and optional release downloads.