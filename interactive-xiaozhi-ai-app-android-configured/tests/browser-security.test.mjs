import test from 'node:test';
import assert from 'node:assert/strict';
import { assertPublicUrl, isPublicAddress } from '../server/browser-security.mjs';

test('private, loopback, reserved and link-local addresses are rejected', () => {
  for (const address of ['127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.1.1', '169.254.169.254', '0.0.0.0', '224.0.0.1', '::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1']) assert.equal(isPublicAddress(address), false, address);
  for (const address of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111']) assert.equal(isPublicAddress(address), true, address);
});

test('unsafe protocols, credentials, local hosts, and nonstandard ports are rejected', async () => {
  for (const url of ['javascript:alert(1)', 'file:///etc/passwd', 'https://localhost', 'https://127.0.0.1', 'http://10.0.0.1', 'https://192.168.0.1', 'https://user:pass@example.com', 'https://example.com:8443', 'https://printer.local', 'https://device.home.arpa', 'https://[::1]']) await assert.rejects(assertPublicUrl(url), undefined, url);
});

test('remote public HTTP and HTTPS destinations use the expected web ports', async () => {
  assert.equal(await assertPublicUrl('http://8.8.8.8/'), 'http://8.8.8.8/');
  assert.equal(await assertPublicUrl('https://1.1.1.1/'), 'https://1.1.1.1/');
  assert.equal(await assertPublicUrl('ws://8.8.8.8/socket', true), 'ws://8.8.8.8/socket');
  assert.equal(await assertPublicUrl('wss://1.1.1.1/socket', true), 'wss://1.1.1.1/socket');
});