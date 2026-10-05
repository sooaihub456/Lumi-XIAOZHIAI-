import { useEffect, useRef } from 'react';
import { App as NativeApp } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';
import { isAndroid } from '../lib/platform';
import { desktopBridge } from '../lib/desktop';

export function useNativeApp(onBack: () => boolean, onBackground: () => void, onForeground: () => void) {
  const handlers = useRef({ onBack, onBackground, onForeground });
  handlers.current = { onBack, onBackground, onForeground };

  useEffect(() => {
    const desktop = desktopBridge();
    if (desktop) return desktop.onAppState(({ isActive }) => { if (isActive) handlers.current.onForeground(); else handlers.current.onBackground(); });
    if (!isAndroid) return;
    let disposed = false;
    const listeners: PluginListenerHandle[] = [];
    const keep = (listener: PluginListenerHandle) => {
      if (disposed) void listener.remove();
      else listeners.push(listener);
    };
    void NativeApp.addListener('backButton', () => {
      if (!handlers.current.onBack()) void NativeApp.minimizeApp();
    }).then(keep);
    void NativeApp.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) handlers.current.onBackground();
      else handlers.current.onForeground();
    }).then(keep);
    return () => {
      disposed = true;
      listeners.forEach((listener) => void listener.remove());
    };
  }, []);
}