import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { _electron } from 'playwright';

const require = createRequire(import.meta.url);
const enabled = process.env.MORI_DESKTOP_TEST === '1';

async function eventually(predicate, message, timeout = 30000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) { if (await predicate()) return; await new Promise((done) => setTimeout(done, 100)); }
  throw new Error(`Timed out: ${message}`);
}

test('Electron renders a live local Chromium tab and enforces Xiaozhi page-sharing permission', { skip: !enabled, timeout: 120000 }, async () => {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const application = await _electron.launch({ executablePath: require('electron'), args: [resolve('.desktop-app'), `--user-data-dir=${resolve('.desktop-test-data')}`], env, timeout: 30000 });
  try {
    const page = await application.firstWindow();
    await page.waitForURL('mori://app/');
    await page.getByRole('button', { name: 'His little computer', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.moriDesktop.version), 1);
    assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.platform), 'desktop');
    assert.equal((await page.evaluate(() => window.moriDesktop.info())).browserProtocol, 2);
    await page.getByRole('button', { name: 'His little computer', exact: true }).click();
    const marker = randomBytes(6).toString('hex');
    const url = `https://example.com/?mori_desktop=${marker}`;
    await page.getByRole('textbox', { name: 'Search or website address' }).fill(url);
    await page.getByRole('textbox', { name: 'Search or website address' }).press('Enter');
    await eventually(async () => { const state = await page.evaluate(() => window.moriDesktop.browser.state()); return state.url === url && !state.loading && state.title.includes('Example Domain'); }, 'real website inside Electron');
    assert.equal(await page.locator('iframe').count(), 0);
    const isolation = await application.evaluate(async ({ webContents }, target) => {
      const contents = webContents.getAllWebContents().find((item) => item.getURL() === target);
      if (!contents) throw new Error('No real browser WebContents was created.');
      const preferences = contents.getLastWebPreferences();
      const globals = await contents.executeJavaScript('({node: typeof window.require, process: typeof window.process, bridge: typeof window.moriDesktop})');
      return { nodeIntegration: preferences.nodeIntegration, sandbox: preferences.sandbox, contextIsolation: preferences.contextIsolation, preload: !!preferences.preload, globals };
    }, url);
    assert.deepEqual(isolation, { nodeIntegration: false, sandbox: true, contextIsolation: true, preload: false, globals: { node: 'undefined', process: 'undefined', bridge: 'undefined' } });

    await page.getByRole('button', { name: 'New browser tab', exact: true }).click();
    await eventually(async () => (await page.evaluate(() => window.moriDesktop.browser.state())).tabs.length === 2, 'second native tab');
    const state = await page.evaluate(() => window.moriDesktop.browser.state());
    await page.getByRole('tab', { name: 'Example Domain', exact: true }).click();
    await eventually(async () => (await page.evaluate(() => window.moriDesktop.browser.state())).url === url, 'tab switching');
    assert.equal(state.engine, 'electron');
    await mkdir('artifacts/desktop-tests', { recursive: true });
    await page.screenshot({ path: 'artifacts/desktop-tests/mori-desktop-shell.png' });

    const lease = 'desktop-test-view-0001';
    await page.evaluate(async ({ lease, url }) => { await window.moriDesktop.browser.open({ lease, url, bounds: { x: 210, y: 210, width: 850, height: 500 } }); }, { lease, url });
    const denied = await page.evaluate(async (lease) => { try { await window.moriDesktop.browser.inspect({ lease }); return ''; } catch (error) { return error.message; } }, lease);
    assert.match(denied, /page sharing/i);
    await page.evaluate(() => window.moriDesktop.browser.sharing(true));
    const snapshot = await page.evaluate((lease) => window.moriDesktop.browser.inspect({ lease }), lease);
    assert.equal(snapshot.url, url);
    assert.match(snapshot.text, /Example Domain/);
    assert.ok(snapshot.links.some((link) => link.url.includes('iana.org')));
    assert.ok(Date.now() - snapshot.retrievedAt < 15000);
    const diagnosis = await page.evaluate((url) => window.moriDesktop.browser.diagnose(url), url);
    assert.equal(diagnosis.status, 'passed');
    assert.match(diagnosis.title, /Example Domain/);
    assert.equal(diagnosis.httpStatus, 200);

    const blocked = await page.evaluate(async (lease) => { try { await window.moriDesktop.browser.navigate({ lease, url: 'file:///etc/passwd' }); return ''; } catch (error) { return error.message; } }, lease);
    assert.match(blocked, /HTTPS/);
    await page.evaluate(() => window.moriDesktop.browser.sharing(false));
    const revoked = await page.evaluate(async (lease) => { try { await window.moriDesktop.browser.inspect({ lease }); return ''; } catch (error) { return error.message; } }, lease);
    assert.match(revoked, /page sharing/i);
  } finally { await application.close(); }
});