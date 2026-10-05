const { app, BrowserWindow, Menu, ipcMain, protocol, session, net, shell, dialog, clipboard } = require('electron');
const { readFile, realpath, stat, writeFile } = require('node:fs/promises');
const { createHash } = require('node:crypto');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { MoriBrowser } = require('./browser.cjs');
const { APP_ORIGIN, publicUrl, isAppDocument, assetPath, safeFilename, launchUrl } = require('./security.cjs');

const root = path.resolve(__dirname, '..');
const webDirectory = path.join(root, 'dist');
let window;
let browser;
let csp;
let appSession;
let savePrompt = false;
let ipcCount = 0;
let ipcEpoch = Date.now();
let pendingLaunchUrl = null;

app.setName('Mori');
const gotInstanceLock = app.requestSingleInstanceLock();
if (!gotInstanceLock) app.quit();
app.enableSandbox();
protocol.registerSchemesAsPrivileged([{ scheme: 'mori', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

function receiveLaunch(value) {
  try { pendingLaunchUrl = launchUrl(value); } catch { return; }
  if (window && !window.isDestroyed()) {
    if (window.isMinimized()) window.restore();
    window.show(); window.focus();
    send('mori:launch-ready', true);
  } else if (app.isReady() && appSession) void createWindow().catch(() => {});
}
app.on('open-url', (event, value) => { event.preventDefault(); receiveLaunch(value); });
app.on('second-instance', (_event, argv) => {
  const link = argv.find((value) => value.startsWith('mori-browser:'));
  if (link) receiveLaunch(link);
  else if (window) { if (window.isMinimized()) window.restore(); window.focus(); }
});
const coldLaunch = process.argv.find((value) => value.startsWith('mori-browser:'));
if (coldLaunch) receiveLaunch(coldLaunch);

function trusted(event) {
  const frame = event.senderFrame;
  if (!window || window.isDestroyed() || event.sender !== window.webContents || frame !== window.webContents.mainFrame || frame.origin !== APP_ORIGIN || !isAppDocument(frame.url)) throw new Error('Untrusted desktop request.');
  if (Date.now() - ipcEpoch > 1000) { ipcEpoch = Date.now(); ipcCount = 0; }
  if (++ipcCount > 240) throw new Error('Too many desktop requests.');
}

function handle(channel, callback) {
  ipcMain.handle(channel, (event, options) => { trusted(event); return callback(options); });
}

function send(channel, value) { if (window && !window.isDestroyed()) window.webContents.send(channel, value); }
function shortcut(action) { if (window && !window.isDestroyed()) { window.webContents.focus(); send('mori:shortcut', action); } }
function currentBrowser() { if (!browser) throw new Error('The desktop browser is not ready.'); return browser; }

async function registerAppProtocol() {
  const html = await readFile(path.join(webDirectory, 'index.html'), 'utf8');
  const hashes = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(([, attributes]) => !/\bsrc\s*=/.test(attributes))
    .map(([, , contents]) => `'sha256-${createHash('sha256').update(contents).digest('base64')}'`);
  csp = ["default-src 'self'", `script-src 'self' 'wasm-unsafe-eval' ${hashes.join(' ')}`, "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob: https:", "font-src 'self' data:", "connect-src 'self' https: wss: ws://localhost:* ws://127.0.0.1:*", "media-src 'self' blob: https:", "worker-src 'self' blob:", "object-src 'none'", "frame-src 'none'", "frame-ancestors 'none'", "base-uri 'none'", "form-action 'none'"].join('; ');
  appSession = session.fromPartition('persist:mori-ui');
  appSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  appSession.setPermissionCheckHandler(() => false);
  appSession.on('will-download', (event) => event.preventDefault());
  appSession.protocol.handle('mori', async (request) => {
    try {
      if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405 });
      const file = await realpath(assetPath(webDirectory, request.url));
      const assets = await realpath(webDirectory);
      if (!file.startsWith(assets + path.sep) || !(await stat(file)).isFile()) return new Response('Not found', { status: 404 });
      const response = await net.fetch(pathToFileURL(file).href);
      const headers = new Headers(response.headers);
      headers.set('Content-Security-Policy', csp);
      headers.set('X-Content-Type-Options', 'nosniff');
      headers.set('Cache-Control', 'no-store');
      return new Response(request.method === 'HEAD' ? null : response.body, { status: response.status, headers });
    } catch { return new Response('This file is not part of Mori.', { status: 404 }); }
  });
}

function registerIpc() {
  handle('mori:take-launch-url', () => { const url = pendingLaunchUrl; pendingLaunchUrl = null; return url; });
  handle('mori:info', () => ({ app: 'Mori', version: app.getVersion(), platform: process.platform, electron: process.versions.electron, chromium: process.versions.chrome, browserProtocol: 2, profile: currentBrowser().profile }));
  handle('mori:external', ({ url }) => shell.openExternal(publicUrl(url)));
  handle('mori:clipboard', ({ text }) => { if (typeof text !== 'string' || text.length > 1000000) throw new Error('Invalid clipboard text.'); clipboard.writeText(text); });
  handle('mori:save-file', async ({ name, bytes }) => {
    if (savePrompt) throw new Error('Another save dialog is already open.');
    const filename = safeFilename(name);
    if (!/\.(png|txt|json)$/i.test(filename) || !(bytes instanceof Uint8Array) || bytes.byteLength > 16 * 1024 * 1024) throw new Error('Only Mori PNG images or text exports up to 16 MB can be saved.');
    savePrompt = true;
    try {
      const result = await dialog.showSaveDialog(window, { title: 'Save your little moment', defaultPath: filename, filters: [{ name: 'Mori export', extensions: [path.extname(filename).slice(1)] }] });
      if (result.canceled || !result.filePath) return { saved: false };
      await writeFile(result.filePath, bytes);
      return { saved: true };
    } finally { savePrompt = false; }
  });
  handle('mori:browser-open', (options) => currentBrowser().open(options));
  handle('mori:browser-navigate', (options) => currentBrowser().navigate(options));
  handle('mori:browser-bounds', (options) => currentBrowser().updateBounds(options));
  handle('mori:browser-command', (options) => currentBrowser().command(options));
  handle('mori:browser-inspect', (options) => currentBrowser().inspect(options));
  handle('mori:browser-close', ({ lease }) => currentBrowser().hide(lease));
  handle('mori:browser-state', () => currentBrowser().state());
  handle('mori:browser-tab', (options) => currentBrowser().tabAction(options));
  handle('mori:browser-sharing', ({ enabled }) => currentBrowser().setSharing(enabled));
  handle('mori:browser-clear', () => currentBrowser().clearData());
  handle('mori:browser-diagnose', ({ url }) => currentBrowser().diagnose(url));
  handle('mori:browser-profile', async ({ profile }) => {
    const selected = await currentBrowser().setProfile(profile);
    await writeFile(path.join(app.getPath('userData'), 'browser-preferences.json'), JSON.stringify({ profile: selected }));
    return selected;
  });
  handle('mori:downloads', () => currentBrowser().downloads);
}

function createMenu() {
  const template = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { label: 'Mori', submenu: [{ label: "Open Lumi's computer", accelerator: 'CmdOrCtrl+Shift+B', click: () => shortcut('open-computer') }, { type: 'separator' }, { role: 'minimize' }, { role: process.platform === 'darwin' ? 'close' : 'quit' }] },
    { role: 'editMenu' },
    { label: 'Browser', submenu: [
      { label: 'Address bar', accelerator: 'CmdOrCtrl+L', click: () => shortcut('address') },
      { label: 'New tab', accelerator: 'CmdOrCtrl+T', click: () => shortcut('new-tab') },
      { label: 'Close tab', accelerator: 'CmdOrCtrl+W', click: () => shortcut('close-tab') },
      { label: 'Reload page', accelerator: 'CmdOrCtrl+R', click: () => shortcut('reload') },
      { type: 'separator' },
      { label: 'Clear website data...', click: () => { void browser?.clearData().catch(() => {}); } },
    ] },
    { label: 'Window', submenu: [{ role: 'togglefullscreen' }, { role: 'minimize' }, ...(process.platform === 'darwin' ? [{ role: 'front' }] : [])] },
    { label: 'Help', submenu: [{ label: 'About Mori Desktop', click: () => { void dialog.showMessageBox(window, { type: 'info', title: 'Mori Desktop', message: `Mori ${app.getVersion()}`, detail: `Your little companion, with a local Chromium browser.\nElectron ${process.versions.electron} / Chromium ${process.versions.chrome}\n\nThis preview has no automatic updates. Rebuild with current Electron releases for security updates.` }); } }, ...(!app.isPackaged ? [{ label: 'Inspect Mori UI', click: () => window.webContents.openDevTools({ mode: 'detach' }) }] : [])] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function createWindow() {
  window = new BrowserWindow({
    title: 'Mori | Your Little World', width: 1380, height: 940, minWidth: 900, minHeight: 650,
    icon: path.join(root, 'resources/icon.png'),
    backgroundColor: '#fcfcf9', show: false, autoHideMenuBar: process.platform !== 'darwin',
    webPreferences: { session: appSession, preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, nodeIntegrationInWorker: false, nodeIntegrationInSubFrames: false, webSecurity: true, allowRunningInsecureContent: false, webviewTag: false, navigateOnDragDrop: false },
  });
  let profile = 'standard';
  try { const preferences = JSON.parse(await readFile(path.join(app.getPath('userData'), 'browser-preferences.json'), 'utf8')); if (preferences.profile === 'private') profile = 'private'; } catch { /* First desktop launch uses a standard browser profile. */ }
  browser = new MoriBrowser(window, await readFile(path.join(webDirectory, 'browser-reader.js'), 'utf8'), profile);
  const contents = window.webContents;
  contents.setWindowOpenHandler(({ url }) => { try { const safe = publicUrl(url); void shell.openExternal(safe).catch(() => {}); } catch {} return { action: 'deny' }; });
  contents.on('will-navigate', (event, oldUrl) => { if (!isAppDocument(event.url || oldUrl)) event.preventDefault(); });
  contents.on('will-redirect', (event) => { if (!isAppDocument(event.url)) event.preventDefault(); });
  contents.on('will-attach-webview', (event) => event.preventDefault());
  contents.on('did-start-navigation', (event, _url, _inPlace, legacyMainFrame) => { if (event.isMainFrame ?? legacyMainFrame) { browser.hide(); browser.setSharing(false); } });
  contents.on('render-process-gone', () => { browser.hide(); browser.setSharing(false); });
  contents.on('zoom-changed', () => contents.setZoomFactor(1));
  window.on('resize', () => { browser.layout(); send('mori:shortcut', 'resize'); });
  window.on('minimize', () => { browser.layout(); send('mori:app-state', { isActive: false }); });
  window.on('restore', () => { browser.layout(); send('mori:app-state', { isActive: true }); });
  window.on('close', () => { browser.destroy(); });
  window.on('closed', () => { browser = null; window = null; });
  window.once('ready-to-show', () => window.show());
  contents.on('did-finish-load', () => { if (pendingLaunchUrl) send('mori:launch-ready', true); });
  await contents.loadURL(`${APP_ORIGIN}/`);
}

app.on('certificate-error', (_event, _contents, _url, _error, _certificate, callback) => callback(false));
app.on('web-contents-created', (_event, contents) => contents.on('will-attach-webview', (event) => event.preventDefault()));
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

app.whenReady().then(async () => {
  if (!gotInstanceLock) return;
  if (process.env.MORI_DESKTOP_TEST !== '1') {
    if (process.defaultApp && process.argv.length >= 2) app.setAsDefaultProtocolClient('mori-browser', process.execPath, [root]);
    else if (app.isPackaged) app.setAsDefaultProtocolClient('mori-browser');
  }
  await registerAppProtocol();
  registerIpc();
  createMenu();
  await createWindow();
  app.on('activate', () => { if (!window) void createWindow().catch((error) => dialog.showErrorBox('Mori could not open', error.message)); });
}).catch((error) => { dialog.showErrorBox('Mori could not start', `${error.message}\n\nBuild the web app and run scripts/prepare-desktop.mjs before launching.`); app.quit(); });