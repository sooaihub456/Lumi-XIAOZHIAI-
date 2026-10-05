import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { safeWebUrl } from './browserRouting';
import { desktopBridge, type DesktopTab } from './desktop';
export { looksLikeUrl, safeWebUrl, webSearchUrl, resolveBrowserInput, isGoogleSignIn, isYouTube, isHttpUrl } from './browserRouting';
export type { SearchProvider } from './browserRouting';

export interface BrowserState {
  url: string;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  error?: string;
  connection?: 'connecting' | 'ready' | 'error';
  externalRecommended?: boolean;
  engine?: string;
  tabs?: DesktopTab[];
  activeTabId?: string;
  sharingAllowed?: boolean;
  zoom?: number;
  muted?: boolean;
  errorCode?: string;
  httpStatus?: number;
  security?: 'secure' | 'insecure' | 'unknown';
  profile?: 'standard' | 'private';
}
export type BrowserCommand = 'back' | 'forward' | 'reload' | 'stop';
export interface BrowserDiagnostic {
  engine: string;
  target: string;
  finalUrl: string;
  title: string;
  status: 'passed' | 'failed';
  httpStatus?: number;
  code?: string;
  message: string;
  checkedAt: number;
  durationMs: number;
}
export interface BrowserSnapshot {
  url: string;
  title: string;
  text: string;
  links: { title: string; url: string }[];
  retrievedAt: number;
  needsUserAction: boolean;
  sensitivePage?: boolean;
  note?: string;
}
export interface BrowserHandle {
  command: (command: BrowserCommand) => boolean;
  inspect: (url?: string) => Promise<BrowserSnapshot>;
  isReady: () => boolean;
}
export interface BrowserRequest { id: number; input: string; provider?: 'google' | 'youtube' | 'wikipedia' }
export interface BrowserSettings { endpoint: string; token: string }
export const emptyBrowserState: BrowserState = { url: '', title: '', loading: false, canGoBack: false, canGoForward: false };
let sessionToken = '';
let readPermission = false;
export function getBrowserToken() { return sessionToken; }
export function setBrowserToken(value: string) { sessionToken = value; }
export function getAssistantReadPermission() { return readPermission; }
export async function setAssistantReadPermission(value: boolean) {
  if (!value) readPermission = false;
  const desktop = desktopBridge();
  if (desktop) await desktop.browser.sharing(value);
  readPermission = value;
}
export function syncAssistantReadPermission(value: boolean) { readPermission = value; }

export function nativeBrowserAvailable() {
  return Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('MoriBrowser');
}

export function openDeviceBrowser(input: string): Promise<void> {
  const url = safeWebUrl(input);
  if (desktopBridge()) return desktopBridge()!.openExternal(url);
  if (Capacitor.isNativePlatform()) return Browser.open({ url, toolbarColor: '#e4ecda', presentationStyle: 'fullscreen' });
  // Open synchronously from the click. Never put protected sites into an iframe.
  const tab = window.open('about:blank', '_blank');
  if (!tab) return Promise.reject(new Error('Your browser blocked the new tab. Use the Open website link below, or allow pop-ups for Mori.'));
  try { tab.opener = null; tab.location.replace(url); } catch { tab.close(); return Promise.reject(new Error('The website could not be opened. Use the direct website link.')); }
  return Promise.resolve();
}

export async function probeBrowser(settings: BrowserSettings, testUrl?: string): Promise<BrowserDiagnostic | undefined> {
  const target = testUrl ? safeWebUrl(testUrl) : undefined;
  const endpoint = new URL(settings.endpoint);
  if (!['ws:', 'wss:'].includes(endpoint.protocol) || endpoint.username || endpoint.password) throw new Error('Enter a valid ws:// or wss:// browser address.');
  if (location.protocol === 'https:' && endpoint.protocol !== 'wss:') throw new Error('This secure app needs a wss:// browser connection.');
  if (!settings.token) throw new Error('Enter the private browser session token.');
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(endpoint);
    let settled = false;
    const finish = (message?: string, diagnostic?: BrowserDiagnostic) => {
      if (settled) return;
      settled = true; clearTimeout(timer); ws.close();
      if (message) reject(new Error(message)); else resolve(diagnostic);
    };
    const timer = setTimeout(() => finish('The browser engine did not complete the check. Check its installation and server logs.'), testUrl ? 35000 : 20000);
    ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token: settings.token, probe: true, ...(target ? { testUrl: target } : {}) }));
    ws.onmessage = (event) => {
      if (typeof event.data !== 'string') return;
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'ready') finish(!data.capabilities?.inspect ? 'This browser server is outdated. Restart the updated browser-server.mjs.' : testUrl && !data.diagnostic ? 'The server does not support live website checks. Update browser-server.mjs.' : undefined, data.diagnostic);
        if (data.type === 'error') finish(data.message);
      } catch { finish('The address did not return the Mori browser protocol.'); }
    };
    ws.onerror = () => finish('Cannot reach the browser server. Check TLS, the address, and BROWSER_ALLOWED_ORIGINS.');
    ws.onclose = () => finish('The server rejected the connection. Check the token and allowed origins.');
  });
}

interface NativeBrowserPlugin {
  open(options: { url: string; x: number; y: number; width: number; height: number }): Promise<void>;
  navigate(options: { url: string }): Promise<void>;
  bounds(options: { x: number; y: number; width: number; height: number }): Promise<void>;
  command(options: { action: BrowserCommand }): Promise<void>;
  inspect(options: { url?: string }): Promise<BrowserSnapshot>;
  info(): Promise<{ engine: string; version: string; supportsHttp: boolean }>;
  diagnose(options: { url: string }): Promise<BrowserDiagnostic>;
  close(): Promise<void>;
  addListener(event: 'state', callback: (state: BrowserState) => void): Promise<PluginListenerHandle>;
}

export const NativeBrowser = registerPlugin<NativeBrowserPlugin>('MoriBrowser');

export async function checkBrowserWebsite(input: string, settings: BrowserSettings): Promise<BrowserDiagnostic> {
  const url = safeWebUrl(input);
  const desktop = desktopBridge();
  if (desktop) {
    if (!desktop.browser.diagnose) throw new Error('Update and relaunch Mori Desktop to include the website diagnostic.');
    return desktop.browser.diagnose(url);
  }
  if (nativeBrowserAvailable()) return NativeBrowser.diagnose({ url });
  if (settings.endpoint && settings.token) {
    const result = await probeBrowser(settings, url);
    if (!result) throw new Error('The remote browser did not return a website check.');
    return result;
  }
  throw new Error('No embedded engine is running in this web preview. Start Mori Desktop, install the updated Android app, or connect a running Chromium service. A webpage alone cannot create a native browser engine.');
}