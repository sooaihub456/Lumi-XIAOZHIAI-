import { lookup } from 'node:dns/promises';
import ipaddr from 'ipaddr.js';

export function isPublicAddress(address) {
  try { return ipaddr.process(address).range() === 'unicast'; } catch { return false; }
}

export async function assertPublicUrl(value, websocket = false) {
  if (typeof value !== 'string' || value.length > 8192) throw new Error('Invalid website address.');
  const url = new URL(value);
  const protocols = websocket ? ['ws:', 'wss:'] : ['http:', 'https:'];
  if (!protocols.includes(url.protocol) || url.username || url.password || (url.port && !['80', '443'].includes(url.port))) throw new Error('This remote browser supports public HTTP/HTTPS sites on ports 80 and 443. Use the desktop browser for other public ports.');
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase().replace(/\.$/, '');
  if ((!host.includes('.') && !ipaddr.isValid(host)) || /(^localhost$|\.localhost$|\.local$|\.internal$|\.home\.arpa$)/.test(host)) throw new Error('Local and internal network addresses are not accessible.');
  if (ipaddr.isValid(host)) {
    if (!isPublicAddress(host)) throw new Error('Private or reserved network addresses are not accessible.');
  } else {
    let timeout;
    try {
      const addresses = await Promise.race([
        lookup(host, { all: true, verbatim: true }),
        new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Website DNS lookup timed out.')), 5000); }),
      ]);
      if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) throw new Error('This hostname resolves to a restricted network.');
    } finally { clearTimeout(timeout); }
  }
  return url.href;
}