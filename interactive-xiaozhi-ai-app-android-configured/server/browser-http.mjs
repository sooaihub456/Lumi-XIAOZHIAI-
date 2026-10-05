import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };

export async function browserHttp(request, response) {
  const json = (status, data) => { response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(data)); };
  if (!['GET', 'HEAD'].includes(request.method)) { json(405, { error: 'Method not allowed' }); return; }
  const url = new URL(request.url || '/', 'http://localhost');
  if (url.pathname === '/health') { json(200, { service: 'mori-live-chromium', status: 'ok' }); return; }
  if (url.pathname === '/api/browser-config') {
    json(200, { service: 'mori-live-chromium', protocol: 2, websocketPath: '/browser', tokenRequired: true, capabilities: ['live-screen', 'navigation', 'page-reader'] });
    return;
  }
  if (process.env.BROWSER_SERVE_APP === '0') { json(404, { error: 'Not found' }); return; }
  try {
    const pathname = decodeURIComponent(url.pathname);
    const file = await realpath(resolve(directory, `.${pathname === '/' ? '/index.html' : pathname}`));
    const root = await realpath(directory);
    if (!file.startsWith(root + sep) || !(await stat(file)).isFile()) { json(404, { error: 'Not found' }); return; }
    response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin' });
    if (request.method === 'HEAD') { response.end(); return; }
    createReadStream(file).on('error', () => response.destroy()).pipe(response);
  } catch { json(404, { error: 'The app has not been built, or this file does not exist. Build the Vite app before starting this server.' }); }
}