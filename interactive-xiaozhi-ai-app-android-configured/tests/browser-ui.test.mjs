import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { once } from 'node:events';
import { chromium } from 'playwright';

test('computer UI searches and reads the live Wikipedia API, never a fixture', { skip: process.env.MORI_LIVE_BROWSER_TEST !== '1', timeout: 90000 }, async () => {
  const directory = resolve('dist');
  const mime = { '.html': 'text/html', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };
  const server = http.createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const file = resolve(directory, `.${pathname === '/' ? '/index.html' : pathname}`);
      if (!file.startsWith(directory + sep) || !(await stat(file)).isFile()) { response.writeHead(404); response.end(); return; }
      response.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      createReadStream(file).pipe(response);
    } catch { response.writeHead(404); response.end(); }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  let browser;
  try {
    browser = await chromium.launch({ headless: true, chromiumSandbox: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'His little computer', exact: true }).click();
    await page.getByRole('dialog', { name: "Lumi's window to the world" }).waitFor();
    assert.match(await page.locator('.browser-engine-notice').innerText(), /No embedded browser is running/);
    await page.getByRole('button', { name: 'Check browser engine and website access' }).click();
    await page.getByRole('button', { name: 'Check live website', exact: true }).click();
    await page.locator('.browser-check-error').waitFor();
    assert.match(await page.locator('.browser-check-error').innerText(), /No embedded engine is running/);
    await page.getByRole('button', { name: 'Browser connection settings', exact: true }).click();
    await page.getByRole('group', { name: 'Search provider' }).getByRole('button', { name: 'Wikipedia', exact: true }).click();
    const searchResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.hostname === 'en.wikipedia.org' && url.searchParams.get('list') === 'search' && url.searchParams.get('srsearch') === 'firefly';
    });
    await page.getByRole('textbox', { name: 'Search or website address' }).fill('firefly');
    await page.getByRole('textbox', { name: 'Search or website address' }).press('Enter');
    assert.ok((await searchResponse).ok(), 'The UI must receive an actual successful Wikipedia response.');
    await page.locator('.live-result').first().waitFor({ timeout: 20000 });
    assert.match(await page.locator('.live-results-heading').innerText(), /LIVE FROM WIKIPEDIA/);
    assert.match(await page.locator('.live-result').first().innerText(), /Firefly/i);
    await mkdir('artifacts', { recursive: true });
    await page.screenshot({ path: 'artifacts/live-search.png' });
    await page.locator('.live-result').first().click();
    await page.locator('.live-article h1').waitFor({ timeout: 20000 });
    assert.match(await page.locator('.live-article').innerText(), /Firefly/);
    await page.screenshot({ path: 'artifacts/live-article.png' });
    assert.equal(await page.locator('iframe').count(), 0, 'Protected websites must never be routed into frames.');
    for (const [label, host] of [['Google', 'www.google.com'], ['YouTube', 'www.youtube.com']]) {
      const popupEvent = page.waitForEvent('popup');
      const navigationEvent = page.context().waitForEvent('request', (request) => new URL(request.url()).hostname === host && request.isNavigationRequest());
      await page.locator('.computer-sidebar').getByRole('button', { name: label, exact: true }).click();
      const popup = await popupEvent;
      const navigation = await navigationEvent;
      assert.equal(navigation.frame().parentFrame(), null, `${label} must navigate a top-level browser tab.`);
      assert.equal(await page.locator('iframe').count(), 0);
      await popup.close();
    }
    await page.screenshot({ path: 'artifacts/browser-handoff.png' });
    await page.getByRole('button', { name: 'Close computer', exact: true }).click();
    await page.getByRole('button', { name: 'Tea time', exact: true }).click();
    assert.match(await page.locator('.companion-status').innerText(), /tea break/);
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise((resolveClose) => server.close(resolveClose));
  }
});