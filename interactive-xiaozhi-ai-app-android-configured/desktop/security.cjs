const path = require('node:path');
const ipaddr = require('ipaddr.js');

const APP_ORIGIN = 'mori://app';

function publicUrl(value) {
  if (typeof value !== 'string' || !value || value.length > 8192) throw new Error('Enter a public HTTP or HTTPS website.');
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Only HTTP and HTTPS websites without embedded credentials are allowed.');
  const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  if (ipaddr.isValid(host)) {
    if (ipaddr.process(host).range() !== 'unicast') throw new Error('Private and reserved addresses are not supported.');
  } else if (!host.includes('.') || /(^localhost$|\.localhost$|\.local$|\.internal$|\.home\.arpa$)/.test(host)) {
    throw new Error('Local network destinations are not supported.');
  }
  return url.href;
}

function resourceAllowed(value) {
  try {
    const url = new URL(value);
    if (url.protocol === 'data:' || url.protocol === 'blob:') return true;
    if (url.href === 'about:blank') return true;
    publicUrl(url.protocol === 'wss:' ? `https:${url.href.slice(4)}` : url.protocol === 'ws:' ? `http:${url.href.slice(3)}` : url.href);
    return true;
  } catch { return false; }
}

function isAppDocument(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'mori:' && url.hostname === 'app' && !url.port && !url.username && !url.password && ['/', '/index.html'].includes(url.pathname);
  } catch { return false; }
}

function assetPath(root, value) {
  const url = new URL(value);
  if (url.protocol !== 'mori:' || url.hostname !== 'app' || url.port || url.username || url.password) throw new Error('Unknown app origin.');
  const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  if (pathname.includes('\0') || pathname.includes('\\')) throw new Error('Invalid asset path.');
  const file = path.resolve(root, `.${pathname}`);
  const relative = path.relative(root, file);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('Asset path escapes the app bundle.');
  return file;
}

function boundsOf(value, area) {
  if (!value || !['x', 'y', 'width', 'height'].every((key) => Number.isFinite(value[key]))) throw new Error('Invalid browser viewport.');
  const x = Math.max(0, Math.min(area.width, Math.round(value.x)));
  const y = Math.max(0, Math.min(area.height, Math.round(value.y)));
  return { x, y, width: Math.max(1, Math.min(area.width - x, Math.round(value.width))), height: Math.max(1, Math.min(area.height - y, Math.round(value.height))) };
}

function leaseId(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9-]{8,80}$/.test(value)) throw new Error('Invalid browser viewport session.');
  return value;
}

function safeFilename(value) {
  if (typeof value !== 'string') throw new Error('A file name is required.');
  return path.basename(value.replace(/\\/g, '/')).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 160) || 'mori-download';
}

function launchUrl(value) {
  if (typeof value !== 'string' || value.length > 10000) throw new Error('Invalid launch link.');
  const link = new URL(value);
  if (link.protocol !== 'mori-browser:' || link.hostname !== 'open' || link.username || link.password || link.port || !['', '/'].includes(link.pathname)) throw new Error('Unknown Mori launch action.');
  return publicUrl(link.searchParams.get('url') || 'https://www.google.com/');
}

module.exports = { APP_ORIGIN, publicUrl, resourceAllowed, isAppDocument, assetPath, boundsOf, leaseId, safeFilename, launchUrl };