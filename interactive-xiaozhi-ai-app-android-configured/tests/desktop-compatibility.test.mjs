import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { _electron } from 'playwright';

const enabled = process.env.MORI_DESKTOP_TEST === '1';
const require = createRequire(import.meta.url);

async function until(predicate, description, timeout = 25000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await predicate()) return; await new Promise((done) => setTimeout(done, 100)); }
  throw new Error(`Timed out: ${description}`);
}

// A real local HTTP server exercises browser behavior deterministically. This
// test-only DNS mapping is never part of the shipped application's startup.
test('normal browser HTTP, resources, cookies, redirects, and POST popups remain intact', { skip: !enabled, timeout: 120000 }, async () => {
  const token = randomBytes(10).toString('hex');
  const requests = [];
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://mori-browser.test');
    let body = '';
    for await (const chunk of request) body += chunk;
    requests.push({ method: request.method, path: url.pathname, cookie: request.headers.cookie || '', body });
    response.setHeader('Cache-Control', 'no-store');
    if (url.pathname === '/style.css') { response.setHeader('Content-Type', 'text/css'); response.end('body { color: rgb(17, 85, 34); }'); return; }
    if (url.pathname === '/script.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(`document.documentElement.dataset.realScript = '${token}';`); return; }
    if (url.pathname === '/redirect') { response.writeHead(302, { Location: '/destination' }); response.end(); return; }
    if (url.pathname === '/submitted') { response.setHeader('Content-Type', 'text/html'); response.end(`<html><title>Submitted by ${request.method}</title><body><h1>Native popup received ${request.method}</h1><p>${body.replace(/[<>&]/g, '')}</p></body></html>`); return; }
    response.setHeader('Content-Type', 'text/html');
    response.setHeader('Set-Cookie', `moriFixture=${token}; Path=/; SameSite=Lax`);
    response.end(`<!doctype html><html><head><title>${url.pathname === '/destination' ? 'Redirect destination' : 'HTTP browser check'}</title><link rel="stylesheet" href="/style.css"></head><body><h1>A real HTTP page</h1><a id="redirect" href="/redirect">Follow redirect</a><form action="/submitted" method="post" target="moriFixturePopup"><input name="proof" value="${token}"><button id="submit">Submit in another tab</button></form><script src="/script.js"></script></body></html>`);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const target = `http://mori-browser.test:${server.address().port}/start`;
  let application;
  try {
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    application = await _electron.launch({ executablePath: require('electron'), args: [resolve('.desktop-app'), `--user-data-dir=${resolve('.desktop-compatibility-data')}`, '--host-resolver-rules=MAP mori-browser.test 127.0.0.1', '--no-proxy-server'], env, timeout: 30000 });
    const page = await application.firstWindow();
    await page.waitForURL('mori://app/');
    await page.getByRole('button', { name: 'His little computer', exact: true }).click();
    await page.getByRole('textbox', { name: 'Search or website address' }).fill(target);
    await page.getByRole('textbox', { name: 'Search or website address' }).press('Enter');
    await until(async () => { const state = await page.evaluate(() => window.moriDesktop.browser.state()); return state.title === 'HTTP browser check' && !state.loading; }, 'HTTP page loads');
    const rendered = await application.evaluate(async ({ webContents }, url) => {
      const tab = webContents.getAllWebContents().find((item) => item.getURL() === url);
      return { persistedProfile: !!tab.session.storagePath, result: await tab.executeJavaScript('({script: document.documentElement.dataset.realScript, color: getComputedStyle(document.body).color, cookie: document.cookie})') };
    }, target);
    assert.equal(rendered.result.script, token);
    assert.equal(rendered.result.color, 'rgb(17, 85, 34)');
    assert.match(rendered.result.cookie, new RegExp(token));
    assert.equal(rendered.persistedProfile, true, 'The standard browser profile must preserve site sessions.');
    assert.match(await page.locator('.browser-http-warning').innerText(), /Not secure/);

    await application.evaluate(async ({ webContents }, url) => {
      await webContents.getAllWebContents().find((item) => item.getURL() === url).executeJavaScript("document.getElementById('redirect').click()", true);
    }, target);
    await until(async () => (await page.evaluate(() => window.moriDesktop.browser.state())).title === 'Redirect destination', 'normal redirect');
    const destination = `http://mori-browser.test:${server.address().port}/destination`;
    await application.evaluate(async ({ webContents }, url) => {
      await webContents.getAllWebContents().find((item) => item.getURL() === url).executeJavaScript("document.getElementById('submit').click()", true);
    }, destination);
    await until(async () => (await page.evaluate(() => window.moriDesktop.browser.state())).title === 'Submitted by POST', 'POST popup is not replaced with a GET');
    assert.ok(requests.some((request) => request.path === '/submitted' && request.method === 'POST' && request.body.includes(token) && request.cookie.includes(token)));
    assert.equal(requests.filter((request) => request.path === '/submitted' && request.method === 'GET').length, 0);

    const before = requests.filter((request) => request.path === '/submitted').length;
    await page.getByRole('button', { name: 'Browser connection settings', exact: true }).click();
    await page.getByRole('button', { name: 'Browser connection settings', exact: true }).click();
    await until(async () => (await page.evaluate(() => window.moriDesktop.browser.state())).title === 'Submitted by POST', 'reopening settings does not replay stale navigation');
    await new Promise((done) => setTimeout(done, 700));
    assert.equal(requests.filter((request) => request.path === '/submitted').length, before);
    await mkdir('artifacts/desktop-tests', { recursive: true });
    await writeFile('artifacts/desktop-tests/http-compatibility.json', JSON.stringify({ checkedAt: new Date().toISOString(), checks: ['HTTP', 'external JavaScript', 'external CSS', 'cookies', '302 redirect', 'native POST popup', 'no stale replay'], requests }, null, 2));
    await page.screenshot({ path: 'artifacts/desktop-tests/http-compatibility.png' });
  } finally {
    await application?.close();
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
  }
});