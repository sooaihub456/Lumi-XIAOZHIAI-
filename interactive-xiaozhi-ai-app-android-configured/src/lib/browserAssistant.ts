import type { BrowserDiagnostic, BrowserSnapshot } from './browser';

export type BrowserToolResult = {
  status: 'loaded' | 'user_action_required' | 'external_browser_required' | 'permission_required';
  url: string;
  page?: BrowserSnapshot;
  note: string;
};

export interface ComputerController {
  navigate: (url: string) => Promise<BrowserToolResult>;
  readPage: () => Promise<BrowserToolResult>;
  checkWebsite: (url: string) => Promise<BrowserDiagnostic>;
  status: () => { mode: string; connected: boolean; url: string; assistantReadAllowed: boolean; error?: string };
}

let current: ComputerController | null = null;
const waiters = new Set<(controller: ComputerController) => void>();

export function registerComputer(controller: ComputerController) {
  current = controller;
  for (const ready of waiters) ready(controller);
  waiters.clear();
  return () => { if (current === controller) current = null; };
}

export function computerController(): Promise<ComputerController> {
  if (current) return Promise.resolve(current);
  return new Promise((resolve, reject) => {
    const ready = (controller: ComputerController) => { clearTimeout(timeout); resolve(controller); };
    const timeout = setTimeout(() => { waiters.delete(ready); reject(new Error('The computer is not open. Open His computer and try again.')); }, 5000);
    waiters.add(ready);
  });
}