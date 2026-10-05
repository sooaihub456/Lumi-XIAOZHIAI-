import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const require = createRequire(import.meta.url);
const { publicUrl, resourceAllowed, isAppDocument, assetPath, boundsOf, leaseId, safeFilename, launchUrl } = require('../desktop/security.cjs');

test('desktop navigation accepts HTTP and HTTPS but rejects privileged schemes and private hosts', () => {
  assert.equal(publicUrl('https://www.google.com/'), 'https://www.google.com/');
  assert.equal(publicUrl('https://www.youtube.com/watch?v=123'), 'https://www.youtube.com/watch?v=123');
  assert.equal(publicUrl('http://example.com:8080/path'), 'http://example.com:8080/path');
  for (const value of ['file:///etc/passwd', 'javascript:alert(1)', 'mori://app/', 'data:text/html,hello', 'https://user:password@example.com', 'https://127.0.0.1', 'https://10.0.0.1', 'https://169.254.169.254', 'https://[::1]', 'https://[::ffff:127.0.0.1]', 'https://printer.local', 'https://localhost.']) assert.throws(() => publicUrl(value), undefined, value);
});

test('normal browser resources are allowed while files, app resources and private networks stay isolated', () => {
  for (const value of ['https://www.youtube.com/', 'http://example.com/', 'https://i.ytimg.com/video.jpg', 'ws://example.com/socket', 'wss://example.com/socket', 'data:image/png;base64,abc', 'blob:https://example.com/id']) assert.equal(resourceAllowed(value), true, value);
  for (const value of ['mori://app/browser-reader.js', 'file:///private/file', 'https://127.0.0.1/']) assert.equal(resourceAllowed(value), false, value);
});

test('only the packaged Mori document is eligible for desktop IPC', () => {
  assert.equal(isAppDocument('mori://app/'), true);
  assert.equal(isAppDocument('mori://app/index.html#home'), true);
  for (const value of ['mori://app.evil/', 'https://app/', 'mori://user@app/', 'mori://app:80/', 'mori://app/remote.html', 'about:blank']) assert.equal(isAppDocument(value), false, value);
});

test('launch links accept only the open action and safe public websites', () => {
  assert.equal(launchUrl('mori-browser://open?url=https%3A%2F%2Fwww.youtube.com%2F'), 'https://www.youtube.com/');
  for (const value of ['mori-browser://execute?url=https://example.com', 'mori-browser://open?url=file:///etc/passwd', 'mori-browser://open?url=http://127.0.0.1', 'mori-browser://attacker@open?url=https://example.com', 'https://open?url=https://example.com']) assert.throws(() => launchUrl(value));
});

test('asset resolution and browser geometry remain inside the application', () => {
  const root = resolve('test-bundle');
  assert.equal(assetPath(root, 'mori://app/'), join(root, 'index.html'));
  assert.equal(assetPath(root, 'mori://app/images/world.jpg'), join(root, 'images/world.jpg'));
  for (const url of ['mori://app/..%2f..%2fsecret', 'mori://app/%5c..%5csecret', 'file:///secret', 'mori://remote/secret']) assert.throws(() => assetPath(root, url));
  assert.deepEqual(boundsOf({ x: -20, y: 30, width: 9999, height: 9999 }, { width: 1000, height: 700 }), { x: 0, y: 30, width: 1000, height: 670 });
  assert.throws(() => boundsOf({ x: NaN, y: 0, width: 1, height: 1 }, { width: 1000, height: 700 }));
  assert.throws(() => leaseId('../bad'));
  assert.equal(safeFilename('../../mori.txt'), 'mori.txt');
});

test('the preload exposes named actions, not raw IPC or arbitrary execution', async () => {
  const preload = await readFile(new URL('../desktop/preload.cjs', import.meta.url), 'utf8');
  const engine = await readFile(new URL('../desktop/browser.cjs', import.meta.url), 'utf8');
  const main = await readFile(new URL('../desktop/main.cjs', import.meta.url), 'utf8');
  assert.doesNotMatch(preload, /executeJavaScript|eval\(|ipcRenderer:\s*ipcRenderer|require:\s*require/);
  assert.match(engine, /nodeIntegration: false/);
  assert.match(engine, /sandbox: true/);
  assert.doesNotMatch(engine, /preload:\s*|webSecurity:\s*false|--no-sandbox/);
  assert.match(main, /frame\.origin !== APP_ORIGIN/);
  assert.match(main, /event\.sender !== window\.webContents/);
});