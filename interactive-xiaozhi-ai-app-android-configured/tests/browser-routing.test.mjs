import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolveBrowserInput, safeWebUrl, webSearchUrl, isGoogleSignIn, isYouTube } from '../src/lib/browserRouting.ts';

test('Google and YouTube names open real HTTPS websites instead of searching Wikipedia', () => {
  assert.equal(resolveBrowserInput('google').url, 'https://www.google.com/');
  assert.equal(resolveBrowserInput('youtube').url, 'https://www.youtube.com/');
  assert.equal(resolveBrowserInput('www.youtube.com').url, 'https://www.youtube.com/');
  assert.equal(resolveBrowserInput('google.com').kind, 'page');
  assert.equal(resolveBrowserInput('google', 'youtube').provider, 'google');
  assert.equal(resolveBrowserInput('constructor').provider, 'google');
});

test('Google is the default and video searches use the real YouTube search URL', () => {
  assert.equal(resolveBrowserInput('garden ideas').url, 'https://www.google.com/search?q=garden%20ideas');
  for (const query of ['youtube cats', 'search youtube for cats', 'cats on youtube']) {
    assert.equal(resolveBrowserInput(query).url, 'https://www.youtube.com/results?search_query=cats');
  }
  assert.equal(resolveBrowserInput('cats', 'youtube').provider, 'youtube');
  assert.equal(resolveBrowserInput('firefly', 'wikipedia').kind, 'wikipedia');
  assert.equal(webSearchUrl('a&b', 'youtube'), 'https://www.youtube.com/results?search_query=a%26b');
});

test('ordinary HTTP, public ports, IP addresses, and international domains are URLs, not searches', () => {
  assert.equal(resolveBrowserInput('http://example.com/').url, 'http://example.com/');
  assert.equal(resolveBrowserInput('example.com:8443/path').url, 'https://example.com:8443/path');
  assert.equal(resolveBrowserInput('//example.com/path').url, 'https://example.com/path');
  assert.equal(resolveBrowserInput('8.8.8.8').kind, 'page');
  assert.equal(resolveBrowserInput('m\u00fcnich.example').url, 'https://xn--mnich-kva.example/');
  assert.equal(resolveBrowserInput('normal search with spaces').query, 'normal search with spaces');
});

test('sign-in and media fallback detection checks the real hostname', () => {
  assert.equal(isGoogleSignIn('https://accounts.google.com/signin'), true);
  assert.equal(isGoogleSignIn('https://accounts.google.com.example.com/signin'), false);
  assert.equal(isYouTube('https://m.youtube.com/watch?v=test'), true);
  assert.equal(isYouTube('https://youtube.com.example.com/'), false);
});

test('navigation still rejects unsafe protocols and private addresses', () => {
  for (const url of ['javascript:alert(1)', 'file:///etc/passwd', 'https://user:password@google.com', 'https://127.0.0.1', 'http://10.0.0.1', 'https://169.254.169.254', 'https://[::1]', 'https://device.local']) assert.throws(() => safeWebUrl(url), undefined, url);
});

test('no arbitrary-website iframe is offered by the computer', async () => {
  const component = await readFile(new URL('../src/components/Computer.tsx', import.meta.url), 'utf8');
  assert.equal(/<iframe\b|Try a live frame/.test(component), false);
  assert.ok(component.includes('openDeviceBrowser'));
});