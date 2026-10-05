import type { BrowserDiagnostic, BrowserSnapshot, BrowserState } from './browser';

export interface DesktopTab { id: string; title: string; url: string; loading: boolean; audible: boolean }
export interface DesktopDownload { id: string; name: string; received: number; total: number; status: string }
export interface DesktopBounds { x: number; y: number; width: number; height: number }
export type DesktopAction = 'back' | 'forward' | 'reload' | 'stop' | 'mute' | 'zoom-in' | 'zoom-out' | 'zoom-reset';
export interface DesktopInfo { app: string; version: string; platform: string; electron: string; chromium: string; browserProtocol?: number; profile?: 'standard' | 'private' }
export interface DesktopBridge {
  version: 1;
  platform: string;
  info: () => Promise<DesktopInfo>;
  takeLaunchUrl?: () => Promise<string | null>;
  onLaunchReady?: (callback: () => void) => () => void;
  openExternal: (url: string) => Promise<void>;
  copyText: (text: string) => Promise<void>;
  saveFile: (name: string, bytes: Uint8Array) => Promise<{ saved: boolean }>;
  onShortcut: (callback: (action: string) => void) => () => void;
  onAppState: (callback: (state: { isActive: boolean }) => void) => () => void;
  browser: {
    open: (options: { lease: string; url: string; bounds: DesktopBounds }) => Promise<BrowserState>;
    navigate: (options: { lease: string; url: string }) => Promise<BrowserState>;
    bounds: (options: { lease: string; bounds: DesktopBounds }) => Promise<void>;
    command: (options: { lease: string; action: DesktopAction }) => Promise<BrowserState>;
    inspect: (options: { lease: string; url?: string }) => Promise<BrowserSnapshot>;
    close: (options: { lease: string }) => Promise<void>;
    state: () => Promise<BrowserState>;
    tab: (options: { action: 'new' | 'select' | 'close'; id?: string; url?: string }) => Promise<BrowserState>;
    sharing: (enabled: boolean) => Promise<boolean>;
    clearData: () => Promise<boolean>;
    diagnose: (url: string) => Promise<BrowserDiagnostic>;
    profile: (profile: 'standard' | 'private') => Promise<'standard' | 'private'>;
    downloads: () => Promise<DesktopDownload[]>;
    onState: (callback: (state: BrowserState) => void) => () => void;
    onDownload: (callback: (downloads: DesktopDownload[]) => void) => () => void;
  };
}

declare global { interface Window { moriDesktop?: DesktopBridge } }

export function desktopBridge() { return window.moriDesktop?.version === 1 ? window.moriDesktop : undefined; }
export const isDesktop = !!desktopBridge();