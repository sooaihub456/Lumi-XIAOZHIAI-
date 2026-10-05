const { WebContentsView, session, dialog, Menu } = require('electron');
const { randomUUID } = require('node:crypto');
const { publicUrl, resourceAllowed, boundsOf, leaseId, safeFilename } = require('./security.cjs');

const HOME = 'https://www.google.com/';
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

class MoriBrowser {
  constructor(window, readerScript, profile = 'standard') {
    this.window = window;
    this.readerScript = readerScript;
    this.tabs = new Map();
    this.activeTab = null;
    this.lease = null;
    this.bounds = { x: 0, y: 0, width: 1, height: 1 };
    this.visible = false;
    this.sharingAllowed = false;
    this.readGeneration = 0;
    this.downloads = [];
    this.fullScreenTab = null;
    this.closed = false;
    this.profile = profile === 'private' ? 'private' : 'standard';
    this.session = this.createSession();
    this.activeCheck = null;
    this.popupCount = 0;
    this.popupEpoch = Date.now();
  }

  createSession() {
    this.session = session.fromPartition(this.profile === 'standard' ? 'persist:mori-web-standard' : `mori-web-private-${randomUUID()}`, { cache: false });
    this.session.setPermissionRequestHandler((contents, permission, callback) => {
      callback(permission === 'fullscreen' && this.owns(contents) && this.visible);
    });
    this.session.setPermissionCheckHandler((contents, permission) => permission === 'fullscreen' && this.owns(contents) && this.visible);
    this.session.setDevicePermissionHandler(() => false);
    this.session.setDisplayMediaRequestHandler((_request, callback) => callback({}));
    this.session.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !resourceAllowed(details.url) }));
    this.onDownload = (event, item, contents) => this.handleDownload(event, item, contents);
    this.session.on('will-download', this.onDownload);
    return this.session;
  }

  owns(contents) { return !!contents && [...this.tabs.values()].some((tab) => tab.view.webContents === contents); }
  active() { return this.tabs.get(this.activeTab); }
  send(channel, value) { if (!this.window.isDestroyed() && !this.window.webContents.isDestroyed()) this.window.webContents.send(channel, value); }
  emit() { this.send('mori:browser-state', this.state()); }

  state() {
    const tab = this.active();
    const contents = tab?.view.webContents;
    const alive = contents && !contents.isDestroyed();
    return {
      url: alive ? contents.isLoading() ? tab.requestedUrl : contents.getURL() || tab.requestedUrl : '', title: alive ? contents.getTitle() || 'New tab' : '',
      loading: !!alive && contents.isLoading(), canGoBack: !!alive && contents.navigationHistory.canGoBack(), canGoForward: !!alive && contents.navigationHistory.canGoForward(),
      connection: alive ? 'ready' : 'connecting', engine: 'electron', activeTabId: this.activeTab,
      sharingAllowed: this.sharingAllowed, zoom: alive ? contents.getZoomFactor() : 1, muted: tab?.muted || false,
      profile: this.profile,
      security: alive ? (contents.getURL().startsWith('https://') && !tab.errorCode?.includes('CERT') ? 'secure' : contents.getURL().startsWith('http://') ? 'insecure' : 'unknown') : 'unknown',
      httpStatus: tab?.httpStatus || undefined,
      errorCode: tab?.errorCode || undefined,
      ...(tab?.error ? { error: tab.error } : {}),
      tabs: [...this.tabs.values()].filter((item) => !item.view.webContents.isDestroyed()).map((item) => ({ id: item.id, title: item.view.webContents.getTitle() || 'New tab', url: item.view.webContents.isLoading() ? item.requestedUrl : item.view.webContents.getURL() || item.requestedUrl, loading: item.view.webContents.isLoading(), audible: item.view.webContents.isCurrentlyAudible() })),
    };
  }

  layout() {
    if (this.window.isDestroyed()) return;
    const [width, height] = this.window.getContentSize();
    const bounds = boundsOf(this.bounds, { width, height });
    for (const tab of this.tabs.values()) {
      if (tab.view.webContents.isDestroyed()) continue;
      const show = this.visible && tab.id === this.activeTab && !this.window.isMinimized();
      tab.view.setBounds(this.fullScreenTab === tab.id && this.visible ? { x: 0, y: 0, width, height } : bounds);
      tab.view.setVisible(show);
      tab.view.webContents.setAudioMuted(!show || tab.muted);
    }
  }

  shortcut(action) {
    if (!this.window.isDestroyed()) this.window.webContents.focus();
    this.send('mori:shortcut', action);
  }

  createTab(address = HOME, activate = true, existingContents = null, nativePopup = false) {
    const url = nativePopup && address === 'about:blank' ? address : publicUrl(address);
    if (this.tabs.size >= 8) throw new Error('Eight tabs are open. Close a tab before opening another.');
    const view = new WebContentsView({ ...(existingContents ? { webContents: existingContents } : {}), webPreferences: {
      session: this.session, nodeIntegration: false, nodeIntegrationInWorker: false, nodeIntegrationInSubFrames: false,
      contextIsolation: true, sandbox: true, webSecurity: true, allowRunningInsecureContent: false,
      webviewTag: false, navigateOnDragDrop: false, spellcheck: true, backgroundThrottling: true,
    } });
    view.setBackgroundColor('#ffffff');
    view.setVisible(false);
    this.window.contentView.addChildView(view);
    const tab = { id: randomUUID(), view, requestedUrl: url, error: '', errorCode: '', httpStatus: 0, domReady: false, muted: false, document: 0, crashed: false };
    this.tabs.set(tab.id, tab);
    const contents = view.webContents;
    const emit = () => this.emit();
    for (const event of ['did-start-loading', 'did-stop-loading', 'page-title-updated', 'media-started-playing', 'media-paused', 'audio-state-changed']) contents.on(event, emit);
    contents.on('did-start-navigation', (event, _url, _inPlace, legacyMainFrame) => {
      if (event.isMainFrame ?? legacyMainFrame) { tab.document += 1; tab.requestedUrl = event.url || _url || tab.requestedUrl; tab.error = ''; tab.errorCode = ''; tab.httpStatus = 0; tab.domReady = false; this.emit(); }
    });
    contents.on('did-navigate', (_event, _url, code) => {
      tab.requestedUrl = _url;
      tab.httpStatus = code;
      if (code >= 400) tab.error = `This website returned HTTP ${code}. It may require verification or your default browser.`;
      this.emit();
    });
    contents.on('dom-ready', () => { tab.domReady = true; this.emit(); });
    contents.on('did-navigate-in-page', () => { tab.domReady = true; tab.requestedUrl = contents.getURL(); this.emit(); });
    contents.on('enter-html-full-screen', () => { this.fullScreenTab = tab.id; this.layout(); });
    contents.on('leave-html-full-screen', () => { this.fullScreenTab = null; this.layout(); });
    const guardNavigation = (event, oldUrl) => {
      try { publicUrl(event.url || oldUrl); } catch {
        event.preventDefault(); tab.errorCode = 'MORI_UNSAFE_SCHEME'; tab.error = 'This link is not a public HTTP/HTTPS website. Local files and app-control URLs stay blocked.'; this.emit();
      }
    };
    contents.on('will-navigate', guardNavigation);
    contents.on('will-redirect', (event, oldUrl, _inPlace, legacyMainFrame) => {
      if (event.isMainFrame ?? legacyMainFrame) guardNavigation(event, oldUrl);
    });
    contents.on('will-attach-webview', (event) => event.preventDefault());
    contents.on('content-bounds-updated', (event) => event.preventDefault());
    contents.on('did-fail-load', (_event, code, description, _url, mainFrame) => {
      if (!mainFrame || code === -3) return;
      tab.errorCode = description || String(code);
      tab.error = `The page could not load (${description}). Check the connection, reload, or use your default browser.`; this.emit();
    });
    contents.on('render-process-gone', () => { tab.error = 'This tab stopped unexpectedly. Reload to recover it.'; tab.crashed = true; this.emit(); });
    contents.setWindowOpenHandler((details) => {
      if (Date.now() - this.popupEpoch > 10000) { this.popupEpoch = Date.now(); this.popupCount = 0; }
      if (this.closed || this.tabs.size >= 8 || ++this.popupCount > 5) { tab.error = 'Too many popups. Close a tab before trying this link again.'; this.emit(); return { action: 'deny' }; }
      try { if (details.url !== 'about:blank') publicUrl(details.url); }
      catch { tab.error = 'This popup uses a non-web address and was not opened.'; this.emit(); return { action: 'deny' }; }
      // Preserve Chromium's native popup WebContents, opener, redirects, and POST
      // requests instead of turning every popup into a second GET request.
      return {
        action: 'allow',
        overrideBrowserWindowOptions: { webPreferences: { session: this.session, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, webviewTag: false } },
        createWindow: (options) => {
          const popup = this.createTab(details.url || 'about:blank', details.disposition !== 'background-tab', options.webContents || null, true);
          if (!options.webContents && details.disposition === 'background-tab' && details.url !== 'about:blank') void this.load(popup, details.url);
          return popup.view.webContents;
        },
      };
    });
    contents.on('destroyed', () => {
      if (!this.tabs.has(tab.id)) return;
      this.tabs.delete(tab.id);
      if (!this.window.isDestroyed()) this.window.contentView.removeChildView(tab.view);
      if (this.activeTab === tab.id) this.activeTab = [...this.tabs.keys()].pop() || null;
      if (!this.closed && !this.activeTab) this.createTab(HOME);
      this.layout(); this.emit();
    });
    contents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return;
      const modifier = process.platform === 'darwin' ? input.meta : input.control;
      if (modifier && ['l', 't', 'w', 'r'].includes(input.key.toLowerCase())) {
        event.preventDefault();
        if (input.key.toLowerCase() === 'l') this.shortcut('address');
        if (input.key.toLowerCase() === 't') { try { this.createTab(); } catch {} }
        if (input.key.toLowerCase() === 'w') this.closeTab(tab.id);
        if (input.key.toLowerCase() === 'r') contents.reloadIgnoringCache();
      }
      if (input.key === 'Escape' && !this.window.isFullScreen()) { event.preventDefault(); this.shortcut('close-computer'); }
      if (input.alt && input.key === 'ArrowLeft' && contents.navigationHistory.canGoBack()) { event.preventDefault(); contents.navigationHistory.goBack(); }
      if (input.alt && input.key === 'ArrowRight' && contents.navigationHistory.canGoForward()) { event.preventDefault(); contents.navigationHistory.goForward(); }
    });
    contents.on('context-menu', (_event, params) => {
      const template = [];
      if (params.linkURL) {
        try { const target = publicUrl(params.linkURL); template.push({ label: 'Open link in new tab', click: () => { try { this.createTab(target); } catch (error) { tab.error = error.message; this.emit(); } } }); } catch {}
      }
      template.push({ role: 'copy', enabled: !!params.selectionText }, { role: 'paste', enabled: params.isEditable }, { type: 'separator' }, { label: 'Back', enabled: contents.navigationHistory.canGoBack(), click: () => contents.navigationHistory.goBack() }, { label: 'Reload live page', click: () => contents.reloadIgnoringCache() });
      Menu.buildFromTemplate(template).popup({ window: this.window });
    });
    if (activate || !this.activeTab) this.activeTab = tab.id;
    this.readGeneration += 1;
    this.layout();
    if (!nativePopup) void this.load(tab, url);
    this.emit();
    return tab;
  }

  async load(tab, address) {
    const url = publicUrl(address);
    tab.requestedUrl = url; tab.error = ''; tab.errorCode = ''; tab.httpStatus = 0; tab.domReady = false; tab.crashed = false;
    try { const navigation = tab.view.webContents.loadURL(url); this.emit(); await navigation; }
    catch (error) { if (!tab.view.webContents.isDestroyed() && !String(error.message).includes('ERR_ABORTED')) { tab.errorCode ||= error.code || 'LOAD_FAILED'; tab.error ||= `The website did not load (${tab.errorCode}). Run Check browser for the exact network result.`; this.emit(); } }
  }

  assertLease(value) {
    if (leaseId(value) !== this.lease || !this.visible) throw new Error('This browser viewport is no longer active.');
    const tab = this.active();
    if (!tab || tab.view.webContents.isDestroyed()) throw new Error('Open a browser tab first.');
    return tab;
  }

  open({ lease, url, bounds }) {
    const nextLease = leaseId(lease);
    const target = publicUrl(url);
    const nextBounds = boundsOf(bounds, this.window.getContentBounds());
    this.lease = nextLease;
    this.bounds = nextBounds;
    this.visible = true;
    if (!this.active()) this.createTab(target);
    else if (this.active().requestedUrl !== target && this.active().view.webContents.getURL() !== target) void this.load(this.active(), target);
    this.layout(); this.emit(); return this.state();
  }

  navigate({ lease, url }) {
    const tab = this.assertLease(lease);
    const target = publicUrl(url);
    if (tab.view.webContents.getURL() === target || (tab.view.webContents.isLoading() && tab.requestedUrl === target)) return this.state();
    this.readGeneration += 1;
    void this.load(tab, target);
    return this.state();
  }

  updateBounds({ lease, bounds }) { this.assertLease(lease); this.bounds = boundsOf(bounds, this.window.getContentBounds()); this.layout(); }
  hide(lease) { if (lease && lease !== this.lease) return; this.visible = false; this.lease = null; this.fullScreenTab = null; this.readGeneration += 1; this.layout(); }

  command({ lease, action }) {
    const tab = this.assertLease(lease);
    const contents = tab.view.webContents;
    this.readGeneration += 1;
    switch (action) {
      case 'back': if (contents.navigationHistory.canGoBack()) contents.navigationHistory.goBack(); break;
      case 'forward': if (contents.navigationHistory.canGoForward()) contents.navigationHistory.goForward(); break;
      case 'reload': tab.error = ''; tab.crashed = false; contents.reloadIgnoringCache(); break;
      case 'stop': contents.stop(); break;
      case 'mute': tab.muted = !tab.muted; this.layout(); break;
      case 'zoom-in': contents.setZoomFactor(Math.min(2, contents.getZoomFactor() + 0.1)); break;
      case 'zoom-out': contents.setZoomFactor(Math.max(0.5, contents.getZoomFactor() - 0.1)); break;
      case 'zoom-reset': contents.setZoomFactor(1); break;
      default: throw new Error('Unsupported browser control.');
    }
    this.emit(); return this.state();
  }

  selectTab(id) { if (!this.tabs.has(id)) throw new Error('This tab is no longer open.'); this.activeTab = id; this.readGeneration += 1; this.layout(); this.emit(); return this.state(); }
  closeTab(id) {
    const tab = this.tabs.get(id);
    if (!tab) return this.state();
    this.tabs.delete(id);
    this.window.contentView.removeChildView(tab.view);
    if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close({ waitForBeforeUnload: false });
    if (this.activeTab === id) this.activeTab = [...this.tabs.keys()].pop() || null;
    this.readGeneration += 1;
    if (!this.activeTab && !this.closed) this.createTab(HOME);
    this.layout(); this.emit(); return this.state();
  }

  tabAction({ action, id, url }) {
    if (!this.visible) throw new Error('Open the computer before changing tabs.');
    if (action === 'new') { this.createTab(url || HOME); return this.state(); }
    if (action === 'select') return this.selectTab(id);
    if (action === 'close') return this.closeTab(id);
    throw new Error('Unknown tab action.');
  }

  setSharing(enabled) { if (typeof enabled !== 'boolean') throw new Error('Invalid sharing permission.'); if (enabled !== this.sharingAllowed) this.readGeneration += 1; this.sharingAllowed = enabled; this.emit(); return enabled; }

  async inspect({ lease, url }) {
    const tab = this.assertLease(lease);
    if (!this.sharingAllowed) throw new Error('Enable page sharing before Xiaozhi can read this tab.');
    const generation = ++this.readGeneration;
    const check = () => {
      if (this.closed || !this.sharingAllowed || !this.visible || this.lease !== lease || this.activeTab !== tab.id || generation !== this.readGeneration || tab.view.webContents.isDestroyed()) throw new Error('Page sharing was stopped or the user changed tabs. No page was returned.');
    };
    if (url) {
      const target = publicUrl(url);
      if (tab.view.webContents.getURL() !== target && !(tab.view.webContents.isLoading() && tab.requestedUrl === target)) void this.load(tab, target);
    }
    const deadline = Date.now() + 24000;
    while (!tab.domReady) { check(); if (tab.error) throw new Error(tab.error); if (Date.now() > deadline) throw new Error('The main webpage took too long to load. Complete any verification in the live tab and try again.'); await delay(100); }
    check();
    if (tab.error || tab.crashed) throw new Error(tab.error || 'Reload the stopped tab.');
    publicUrl(tab.view.webContents.getURL());
    const document = tab.document;
    await delay(500);
    check();
    if (document !== tab.document) throw new Error('The page changed while it was being read. Try again.');
    let timer;
    try {
      const snapshot = await Promise.race([
        tab.view.webContents.executeJavaScriptInIsolatedWorld(1004, [{ code: this.readerScript }]),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('This page did not respond to the reader.')), 6000); }),
      ]);
      check();
      if (document !== tab.document || !snapshot || typeof snapshot.text !== 'string') throw new Error('The page changed or could not be read.');
      return snapshot;
    } finally { clearTimeout(timer); }
  }

  handleDownload(event, item, contents) {
    if (!this.owns(contents) || !this.visible || !item.hasUserGesture() || this.downloads.filter((entry) => entry.status === 'progressing').length >= 3) { event.preventDefault(); return; }
    try {
      const name = safeFilename(item.getFilename());
      // Electron's built-in download dialog must be configured synchronously.
      item.setSaveDialogOptions({ title: 'Save this website download?', defaultPath: name, buttonLabel: 'Save download' });
      const entry = { id: randomUUID(), name, received: 0, total: item.getTotalBytes(), status: 'progressing' };
      this.downloads = [entry, ...this.downloads].slice(0, 20);
      const update = () => this.send('mori:download', this.downloads);
      item.on('updated', (_event, state) => { entry.received = item.getReceivedBytes(); entry.total = item.getTotalBytes(); entry.status = state; update(); });
      item.once('done', (_event, state) => { entry.status = state; entry.received = item.getReceivedBytes(); update(); });
      update();
    } catch { try { item.cancel(); } catch { /* The download may already have ended. */ } }
  }

  async clearData() {
    const answer = await dialog.showMessageBox(this.window, { type: 'question', title: 'Clear browser session?', message: 'Close all browser tabs and remove their cookies and website storage?', detail: 'Mori conversations, memories, and avatar settings will not be changed.', buttons: ['Keep my tabs', 'Clear browser'], defaultId: 0, cancelId: 0 });
    if (answer.response !== 1 || this.closed) return false;
    this.destroyTabs();
    await this.session.clearData();
    await this.session.clearAuthCache();
    this.sharingAllowed = false;
    if (this.visible && !this.closed) this.createTab(HOME);
    this.emit(); return true;
  }

  destroyTabs() {
    this.readGeneration += 1;
    const tabs = [...this.tabs.values()];
    this.tabs.clear(); this.activeTab = null;
    for (const tab of tabs) {
      if (!this.window.isDestroyed()) this.window.contentView.removeChildView(tab.view);
      if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close({ waitForBeforeUnload: false });
    }
  }

  async setProfile(profile) {
    if (!['standard', 'private'].includes(profile)) throw new Error('Choose a standard or private browser profile.');
    if (profile === this.profile) return this.profile;
    const answer = await dialog.showMessageBox(this.window, { type: 'question', title: 'Change browser profile?', message: profile === 'standard' ? 'Remember website cookies and sessions on this computer?' : 'Start a private browser session?', detail: 'This closes the current tabs. Mori conversations remain separate. Saved standard-profile data is not removed; use Clear website data to delete it.', buttons: ['Cancel', 'Change profile'], defaultId: 0, cancelId: 0 });
    if (this.closed || answer.response !== 1) return this.profile;
    this.destroyTabs(); this.session.removeListener('will-download', this.onDownload);
    this.profile = profile; this.sharingAllowed = false;
    this.session = this.createSession();
    if (this.visible) this.createTab(HOME);
    this.emit();
    return profile;
  }

  async diagnose(address) {
    if (this.activeCheck) throw new Error('A website check is already running.');
    const target = publicUrl(address);
    const started = Date.now();
    const checkSession = session.fromPartition(`mori-diagnostic-${randomUUID()}`, { cache: false });
    checkSession.setPermissionCheckHandler(() => false);
    checkSession.setPermissionRequestHandler((_page, _permission, callback) => callback(false));
    checkSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !resourceAllowed(details.url) }));
    const view = new WebContentsView({ webPreferences: { session: checkSession, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, webviewTag: false } });
    this.activeCheck = view;
    const contents = view.webContents;
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    contents.on('will-navigate', (event, legacyUrl) => { try { publicUrl(event.url || legacyUrl); } catch { event.preventDefault(); } });
    contents.on('will-redirect', (event) => { if (event.isMainFrame) { try { publicUrl(event.url); } catch { event.preventDefault(); } } });
    let statusCode = 0;
    let code = '';
    let timer;
    contents.on('did-navigate', (_event, _url, status) => { statusCode = status; });
    contents.on('did-fail-load', (_event, errorCode, description, _url, mainFrame) => { if (mainFrame && errorCode !== -3) code = description || String(errorCode); });
    try {
      await Promise.race([contents.loadURL(target), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('The website check timed out after 20 seconds.')), 20000); })]);
      let needsUserAction = false;
      try {
        const health = await Promise.race([contents.executeJavaScriptInIsolatedWorld(1005, [{ code: `(function () { const page = ${this.readerScript.trim().replace(/;$/, '')}; return { needsUserAction: !!page.needsUserAction }; })()` }]), delay(1500).then(() => ({ needsUserAction: false }))]);
        needsUserAction = health.needsUserAction;
      } catch { /* The network result remains useful when a page disallows inspection. */ }
      return { engine: 'Electron Chromium', target, finalUrl: contents.getURL(), title: contents.getTitle(), status: statusCode >= 200 && statusCode < 400 && !needsUserAction ? 'passed' : 'failed', httpStatus: statusCode, code: needsUserAction ? 'USER_ACTION_REQUIRED' : code, message: needsUserAction ? 'The site loaded a consent, verification, sign-in, or access-denied screen. A person must complete it in the visible browser; Mori will not bypass it.' : statusCode >= 200 && statusCode < 400 ? 'A real Chromium page loaded this address. This checks connectivity, not account sign-in or video playback.' : `The website responded with HTTP ${statusCode}.`, checkedAt: Date.now(), durationMs: Date.now() - started };
    } catch (error) {
      return { engine: 'Electron Chromium', target, finalUrl: contents.isDestroyed() ? target : contents.getURL(), title: '', status: 'failed', httpStatus: statusCode || undefined, code: code || error.code || 'CHECK_FAILED', message: error.message, checkedAt: Date.now(), durationMs: Date.now() - started };
    } finally {
      clearTimeout(timer); this.activeCheck = null;
      if (!contents.isDestroyed()) contents.close({ waitForBeforeUnload: false });
    }
  }

  destroy() { this.closed = true; this.visible = false; this.sharingAllowed = false; this.destroyTabs(); this.session.removeListener('will-download', this.onDownload); if (this.activeCheck && !this.activeCheck.webContents.isDestroyed()) this.activeCheck.webContents.close({ waitForBeforeUnload: false }); }
}

module.exports = { MoriBrowser };