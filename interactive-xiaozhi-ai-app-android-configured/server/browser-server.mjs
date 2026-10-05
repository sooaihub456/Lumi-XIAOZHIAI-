import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { WebSocket, WebSocketServer } from 'ws';
import { assertPublicUrl } from './browser-security.mjs';
import { browserHttp } from './browser-http.mjs';

const readerScript = await readFile(new URL('../public/browser-reader.js', import.meta.url), 'utf8');

const token = process.env.BROWSER_TOKEN || '';
if (token.length < 32) throw new Error('Set BROWSER_TOKEN to a private, random token of at least 32 characters.');
const origins = new Set((process.env.BROWSER_ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:8790,http://127.0.0.1:8790,https://localhost').split(',').map((origin) => origin.trim()));
const port = Number(process.env.BROWSER_PORT || 8790);
const host = process.env.BROWSER_HOST || '127.0.0.1';
const maxSessions = Math.max(1, Math.min(10, Number(process.env.BROWSER_MAX_SESSIONS) || 2));
let sessions = 0;
let engine;

const server = http.createServer((request, response) => { void browserHttp(request, response).catch(() => { if (!response.headersSent) response.writeHead(500, { 'Content-Type': 'text/plain' }); response.end('The request could not be served.'); }); });
const connections = new WebSocketServer({ noServer: true, maxPayload: 32 * 1024, perMessageDeflate: false });
server.on('upgrade', (request, socket, head) => {
  if (!origins.has(request.headers.origin || '') || sessions >= maxSessions || connections.clients.size >= maxSessions * 4 || !['/', '/browser'].includes((request.url || '').split('?')[0])) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); return;
  }
  connections.handleUpgrade(request, socket, head, (client) => connections.emit('connection', client));
});

const equalToken = (value) => typeof value === 'string' && Buffer.byteLength(value) === Buffer.byteLength(token) && timingSafeEqual(Buffer.from(value), Buffer.from(token));
const dimension = (value, min, max) => Math.round(Math.max(min, Math.min(max, Number(value) || min)));

async function browserEngine() {
  engine ??= chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chromium', headless: process.env.BROWSER_HEADLESS !== 'false', chromiumSandbox: true, args: ['--force-webrtc-ip-handling-policy=disable_non_proxied_udp'] }).then((browser) => { browser.on('disconnected', () => { engine = undefined; }); return browser; }).catch((error) => { engine = undefined; throw error; });
  return engine;
}

connections.on('connection', (client) => {
  let context;
  let page;
  let cdp;
  let authenticated = false;
  let authenticating = false;
  let disposed = false;
  let counted = false;
  let loading = false;
  let pageError = '';
  let httpStatus = 0;
  let lastInput = Date.now();
  let eventsThisSecond = 0;
  let queuedActions = 0;
  let queue = Promise.resolve();
  let stateTimer;
  let lastState = '';
  const send = (data) => { if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(data)); };
  const report = (message) => send({ type: 'error', message });
  const authTimeout = setTimeout(() => client.close(1008, 'Authentication required'), 10000);
  const lifetime = setTimeout(() => client.close(1000, 'Session limit reached'), 60 * 60 * 1000);
  const heartbeat = setInterval(() => {
    eventsThisSecond = 0;
    if (Date.now() - lastInput > 15 * 60 * 1000) client.close(1000, 'Idle session closed');
  }, 1000);

  async function state() {
    if (!page || !cdp || disposed) return;
    try {
      const history = await cdp.send('Page.getNavigationHistory');
      const value = JSON.stringify({ type: 'state', url: page.url(), title: await page.title(), loading, httpStatus: httpStatus || undefined, security: page.url().startsWith('https://') ? 'secure' : page.url().startsWith('http://') ? 'insecure' : 'unknown', canGoBack: history.currentIndex > 0, canGoForward: history.currentIndex < history.entries.length - 1, ...(pageError ? { error: pageError } : {}) });
      if (value !== lastState && client.readyState === WebSocket.OPEN) { lastState = value; client.send(value); }
    } catch { /* The next state update runs after an in-flight navigation. */ }
  }

  async function navigate(address) {
    const url = await assertPublicUrl(address);
    pageError = ''; httpStatus = 0; loading = true; void state();
    try {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
      httpStatus = response?.status() || 0;
      if (response && response.status() >= 400) {
        pageError = `The website returned HTTP ${response.status()}. If it restricts remote browsers, open it in your device browser.`;
        report(pageError);
        return false;
      }
      return true;
    }
    catch (error) {
      if (!String(error.message).includes('ERR_ABORTED')) { pageError = 'The live website could not be loaded. It may be unavailable or restrict remote browsers. Open in your device browser to continue.'; report(pageError); }
      return false;
    }
    finally { loading = false; void state(); }
  }

  async function inspect(address) {
    if (address && page.url() !== address && !(await navigate(address))) throw new Error(pageError || 'Navigation did not complete.');
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await assertPublicUrl(page.url());
    if (pageError) throw new Error(pageError);
    await page.locator('body').waitFor({ state: 'visible', timeout: 5000 });
    // Let client-rendered search results paint; only then read this live document.
    await page.waitForTimeout(650);
    const snapshot = await page.evaluate(readerScript);
    if (!snapshot || typeof snapshot.text !== 'string') throw new Error('This live page could not be read.');
    return snapshot;
  }

  async function initialize(message) {
    if (client.readyState !== WebSocket.OPEN) return;
    if (!equalToken(message.token)) { client.close(1008, 'Invalid session token'); return; }
    if (sessions >= maxSessions) { report('All browser sessions are in use. Try again in a moment.'); client.close(); return; }
    authenticating = true;
    clearTimeout(authTimeout);
    sessions += 1; counted = true;
    const browser = await browserEngine();
    if (disposed) return;
    context = await browser.newContext({ viewport: { width: dimension(message.width, 360, 1440), height: dimension(message.height, 320, 1000) }, acceptDownloads: false, serviceWorkers: 'block', permissions: [], ignoreHTTPSErrors: false });
    if (disposed) { await context.close(); return; }

    // Every navigation, redirect, and HTTP subresource is checked. Also enforce an
    // outbound firewall in production: DNS checks alone cannot prevent rebinding.
    await context.route('**/*', async (route) => {
      try { await assertPublicUrl(route.request().url()); await route.continue(); }
      catch { await route.abort('blockedbyclient').catch(() => {}); }
    });
    await context.routeWebSocket('**/*', async (route) => {
      try { await assertPublicUrl(route.url(), true); route.connectToServer(); }
      catch { await route.close({ code: 1008, reason: 'Restricted network destination' }).catch(() => {}); }
    });
    page = await context.newPage();
    page.setDefaultTimeout(6000);
    if (message.probe === true) {
      let diagnostic;
      if (message.testUrl) {
        const started = Date.now();
        const target = await assertPublicUrl(message.testUrl);
        try {
          const response = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 16000 });
          const code = response?.status() || 0;
          const health = await page.evaluate(`(function () { const page = ${readerScript.trim().replace(/;$/, '')}; return { needsUserAction: !!page.needsUserAction }; })()`).catch(() => ({ needsUserAction: false }));
          diagnostic = { engine: 'Remote Chromium', target, finalUrl: page.url(), title: await page.title(), status: code >= 200 && code < 400 && !health.needsUserAction ? 'passed' : 'failed', httpStatus: code, code: health.needsUserAction ? 'USER_ACTION_REQUIRED' : '', message: health.needsUserAction ? 'The website requires consent, verification, or account access. Complete that in the visible browser; no challenge is bypassed.' : code >= 200 && code < 400 ? 'This real Chromium session loaded the live page. Account and media capabilities are separate checks.' : `The website responded with HTTP ${code}.`, checkedAt: Date.now(), durationMs: Date.now() - started };
        } catch (error) { diagnostic = { engine: 'Remote Chromium', target, finalUrl: page.url(), title: '', status: 'failed', code: 'NAVIGATION_FAILED', message: error.message, checkedAt: Date.now(), durationMs: Date.now() - started }; }
      }
      authenticated = true;
      send({ type: 'ready', capabilities: { inspect: true, liveScreen: true, diagnostics: true }, engine: 'chromium', diagnostic });
      return;
    }
    cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Page.enable');
    cdp.on('Page.screencastFrame', ({ data, sessionId }) => {
      if (client.readyState === WebSocket.OPEN && client.bufferedAmount < 2 * 1024 * 1024) client.send(Buffer.from(data, 'base64'), { binary: true });
      void cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
    });
    page.on('request', (request) => { try { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) { pageError = ''; loading = true; void state(); } } catch { /* Some early requests have no frame yet. */ } });
    page.on('response', (response) => { try { if (response.request().isNavigationRequest() && response.frame() === page.mainFrame()) { httpStatus = response.status(); if (httpStatus >= 400) pageError = `Website returned HTTP ${httpStatus}. This site may restrict remote sessions.`; void state(); } } catch { /* A detached frame can be ignored. */ } });
    page.on('domcontentloaded', () => { loading = false; void state(); });
    page.on('framenavigated', () => void state());
    page.on('load', () => { loading = false; void state(); });
    page.on('crash', () => { report('The browser page stopped unexpectedly. Reload to start a fresh session.'); client.close(1011, 'Page stopped'); });
    page.on('dialog', (dialog) => { void dialog.dismiss().catch(() => {}); report('The website opened a dialog. It was dismissed for this shared screen.'); });
    page.on('download', (download) => { void download.cancel().catch(() => {}); report('Downloads are not stored on the browser server. Use Open in device browser to download a file.'); });
    page.on('popup', (popup) => {
      void (async () => {
        await popup.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
        const address = popup.url();
        await popup.close();
        if (/^https?:\/\//.test(address)) await navigate(address);
      })().catch(() => report('That popup could not be opened.'));
    });
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 78, maxWidth: 1440, maxHeight: 1000, everyNthFrame: 1 });
    authenticated = true;
    send({ type: 'ready', capabilities: { inspect: true, liveScreen: true, diagnostics: true }, engine: 'chromium' });
    stateTimer = setInterval(() => void state(), 1000);
    await navigate(message.url || 'https://www.google.com');
  }

  async function handle(message) {
    if (disposed) return;
    if (!authenticated) { if (!authenticating && message.type === 'auth') await initialize(message); return; }
    lastInput = Date.now();
    switch (message.type) {
      case 'inspect': {
        if (typeof message.id !== 'string' || !/^[a-zA-Z0-9-]{1,64}$/.test(message.id)) throw new Error('Invalid page-read request.');
        const snapshot = await inspect(message.url);
        send({ type: 'result', id: message.id, page: snapshot });
        break;
      }
      case 'navigate': await navigate(message.url); break;
      case 'back': await page.goBack({ waitUntil: 'domcontentloaded', timeout: 20000 }); break;
      case 'forward': await page.goForward({ waitUntil: 'domcontentloaded', timeout: 20000 }); break;
      case 'reload': pageError = ''; await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 }); break;
      case 'stop': await cdp.send('Page.stopLoading'); loading = false; break;
      case 'resize': await page.setViewportSize({ width: dimension(message.width, 360, 1440), height: dimension(message.height, 320, 1000) }); break;
      case 'click': {
        const size = page.viewportSize();
        if (Number.isFinite(message.x) && Number.isFinite(message.y)) await page.mouse.click(Math.max(0, Math.min(size.width, message.x)), Math.max(0, Math.min(size.height, message.y)));
        break;
      }
      case 'move': {
        const size = page.viewportSize();
        if (Number.isFinite(message.x) && Number.isFinite(message.y)) await page.mouse.move(Math.max(0, Math.min(size.width, message.x)), Math.max(0, Math.min(size.height, message.y)));
        break;
      }
      case 'scroll': await page.mouse.wheel(Math.max(-1500, Math.min(1500, Number(message.x) || 0)), Math.max(-1500, Math.min(1500, Number(message.y) || 0))); break;
      case 'text': if (typeof message.text === 'string') await page.keyboard.insertText(message.text.slice(0, 5000)); break;
      case 'key': {
        if (typeof message.key !== 'string') break;
        if (/^(?:(?:Control|Shift)\+)*(?:Enter|Tab|Backspace|Delete|ArrowLeft|ArrowRight|ArrowUp|ArrowDown|Home|End|PageUp|PageDown|a|c|v|x|z|y)$/.test(message.key)) await page.keyboard.press(message.key);
        break;
      }
      default: report('Unsupported browser action.');
    }
    void state();
  }

  client.on('message', (raw, binary) => {
    if (binary || ++eventsThisSecond > 80 || queuedActions > 64) return;
    let message;
    try { message = JSON.parse(raw.toString()); if (!message || typeof message.type !== 'string') return; }
    catch { return; }
    queuedActions += 1;
    queue = queue.then(() => handle(message)).catch((error) => {
      if (message.type === 'inspect') send({ type: 'result', id: message.id, error: error.message || 'The live page could not be read.' });
      else if (!authenticated) { report('Chromium could not start. Check the server browser installation and sandbox permissions.'); client.close(1011, 'Browser unavailable'); }
      else report(error.message?.startsWith('Only public') || error.message?.includes('network') ? error.message : 'The browser action could not finish. Try refreshing the live page.');
    }).finally(() => { queuedActions -= 1; });
  });
  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    clearTimeout(authTimeout); clearTimeout(lifetime); clearInterval(heartbeat); clearInterval(stateTimer);
    if (counted) { sessions -= 1; counted = false; }
    void context?.close().catch(() => {});
  };
  client.on('close', cleanup);
  client.on('error', cleanup);
});

server.listen(port, host, () => console.log(`Mori live Chromium listening on ${host}:${port}. No page cache or replay is used.`));
const shutdown = async () => { for (const client of connections.clients) client.close(); server.close(); try { await (await engine)?.close(); } finally { process.exit(0); } };
process.once('SIGTERM', () => void shutdown());
process.once('SIGINT', () => void shutdown());