import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

// A privacy unit fixture, not a substitute for the live navigation tests.
test('page reader excludes secrets, form values, hidden text, and unsafe links', { skip: process.env.MORI_LIVE_BROWSER_TEST !== '1', timeout: 30000 }, async () => {
  const script = await readFile(new URL('../public/browser-reader.js', import.meta.url), 'utf8');
  const browser = await chromium.launch({ channel: 'chromium', chromiumSandbox: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<main><h1>A public title</h1><p>Visible public information.</p><input type="password" value="password-secret"><textarea>draft-secret</textarea><div hidden>hidden-secret</div><div style="opacity:0"><span>invisible-secret</span></div><div contenteditable="true">edited-secret</div><a href="https://example.com/learn">Learn more</a><a href="javascript:alert(1)">Bad link</a></main>');
    const result = await page.evaluate(script);
    assert.match(result.text, /Visible public information/);
    assert.doesNotMatch(result.text, /password-secret|draft-secret|hidden-secret|invisible-secret|edited-secret/);
    assert.deepEqual(result.links, [{ title: 'Learn more', url: 'https://example.com/learn' }]);
    assert.equal(result.needsUserAction, false);
    await page.setContent('<h1>Before you continue to YouTube</h1><p>Please review your privacy choices.</p>');
    const challenge = await page.evaluate(script);
    assert.equal(challenge.needsUserAction, true, 'Consent pages must not be passed off as actual search results.');
  } finally { await browser.close(); }
});