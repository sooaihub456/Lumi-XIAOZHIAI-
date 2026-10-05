import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { WebSocket } from 'ws';

const live = process.env.MORI_LIVE_BROWSER_TEST === '1';

async function until(predicate, label, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw new Error(`Timed out: ${label}`);
}

test('real Chromium renders live HTTPS pages, navigates, and rejects private destinations', { skip: !live, timeout: 120000 }, async () => {
  const port = 19000 + Math.floor(Math.random() * 3000);
  const token = randomBytes(32).toString('hex');
  let output = '';
  const child = spawn(process.execPath, ['server/browser-server.mjs'], {
    cwd: process.cwd(), env: { ...process.env, BROWSER_TOKEN: token, BROWSER_PORT: String(port), BROWSER_HOST: '127.0.0.1', BROWSER_ALLOWED_ORIGINS: 'http://localhost:5173' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (value) => { output += value.toString(); });
  child.stderr.on('data', (value) => { output += value.toString(); });
  let client;
  try {
    await until(async () => { try { return (await fetch(`http://127.0.0.1:${port}/health`)).ok; } catch { return false; } }, 'browser service health', 10000);
    const config = await (await fetch(`http://127.0.0.1:${port}/api/browser-config`)).json();
    assert.equal(config.websocketPath, '/browser');
    assert.equal(config.tokenRequired, true);
    assert.equal(JSON.stringify(config).includes(token), false, 'The public config must not expose the private token.');
    const rejected = new WebSocket(`ws://127.0.0.1:${port}`, { origin: 'http://localhost:5173' });
    const closed = once(rejected, 'close');
    await once(rejected, 'open');
    rejected.send(JSON.stringify({ type: 'auth', token: 'incorrect', url: 'https://example.com' }));
    const [code] = await closed;
    assert.equal(code, 1008);

    const marker = randomBytes(6).toString('hex');
    const first = `https://example.com/?mori_live=${marker}`;
    const second = `https://example.com/?mori_live=${marker}-next`;
    const messages = [];
    let frames = 0;
    client = new WebSocket(`ws://127.0.0.1:${port}`, { origin: 'http://localhost:5173' });
    client.on('message', (data, binary) => {
      if (binary) { assert.equal(data[0], 0xff); assert.equal(data[1], 0xd8); frames += 1; }
      else messages.push(JSON.parse(data.toString()));
    });
    await once(client, 'open');
    client.send(JSON.stringify({ type: 'auth', token, url: first, width: 1000, height: 640 }));
    await until(() => messages.some((message) => message.type === 'ready'), 'real Chromium ready');
    await until(() => frames > 0 && messages.some((message) => message.type === 'state' && message.url === first && /Example Domain/i.test(message.title) && !message.loading), 'live page title and streamed pixels');
    client.send(JSON.stringify({ type: 'inspect', id: 'read-live' }));
    await until(() => messages.some((message) => message.type === 'result' && message.id === 'read-live'), 'assistant reads the actual rendered page');
    const read = messages.find((message) => message.id === 'read-live');
    assert.equal(read.error, undefined);
    assert.equal(read.page.url, first);
    assert.match(read.page.text, /Example Domain/);
    assert.equal(read.page.needsUserAction, false);
    assert.ok(read.page.links.some((link) => link.url.includes('iana.org')));
    assert.ok(Date.now() - read.page.retrievedAt < 15000, 'The returned text must be freshly read.');
    client.send(JSON.stringify({ type: 'navigate', url: second }));
    await until(() => messages.some((message) => message.url === second && !message.loading && message.canGoBack), 'second live page');
    const offset = messages.length;
    client.send(JSON.stringify({ type: 'back' }));
    await until(() => messages.slice(offset).some((message) => message.url === first && !message.loading), 'browser back');
    client.send(JSON.stringify({ type: 'navigate', url: 'https://127.0.0.1' }));
    await until(() => messages.some((message) => message.type === 'error' && /network|restricted|private/i.test(message.message)), 'private network rejection');
    assert.ok(frames > 0, 'The real live viewport must emit JPEG frames.');
    client.send(JSON.stringify({ type: 'inspect', id: 'read-private', url: 'https://127.0.0.1' }));
    await until(() => messages.some((message) => message.type === 'result' && message.id === 'read-private'), 'unsafe assistant navigation rejected');
    assert.ok(messages.find((message) => message.id === 'read-private').error);
  } catch (error) {
    error.message += `\nBrowser service output:\n${output}`;
    throw error;
  } finally {
    client?.close();
    child.kill('SIGTERM');
    const force = setTimeout(() => child.kill('SIGKILL'), 5000);
    force.unref();
    if (child.exitCode === null && child.signalCode === null) await once(child, 'exit').catch(() => {});
    clearTimeout(force);
  }
});