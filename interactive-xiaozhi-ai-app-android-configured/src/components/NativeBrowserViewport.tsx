import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { PluginListenerHandle } from '@capacitor/core';
import { NativeBrowser, type BrowserHandle, type BrowserState } from '../lib/browser';

export default forwardRef<BrowserHandle, { url: string; navigationId: number; onState: (state: BrowserState) => void }>(function NativeBrowserViewport({ url, navigationId, onState }, ref) {
  const container = useRef<HTMLDivElement>(null);
  const ready = useRef(false);
  const latestUrl = useRef(url);
  const handler = useRef(onState);
  latestUrl.current = url;
  handler.current = onState;
  const fail = (error: unknown) => handler.current({ url: latestUrl.current, title: '', loading: false, canGoBack: false, canGoForward: false, connection: 'error', error: error instanceof Error ? error.message : 'The native browser is unavailable in this APK. Rebuild the app, or open this website in your device browser.' });
  useImperativeHandle(ref, () => ({
    command: (action) => { if (!ready.current) return false; void NativeBrowser.command({ action }).catch(fail); return true; },
    isReady: () => ready.current,
    inspect: async (url) => { if (!ready.current) throw new Error('The Android browser is not ready.'); return NativeBrowser.inspect(url ? { url } : {}); },
  }));

  useEffect(() => {
    let disposed = false;
    handler.current({ url: latestUrl.current, title: '', loading: true, canGoBack: false, canGoForward: false, connection: 'connecting' });
    let listener: PluginListenerHandle | undefined;
    let timer: ReturnType<typeof setTimeout>;
    const rect = () => {
      const box = container.current!.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    };
    const resize = () => { if (ready.current && container.current) void NativeBrowser.bounds(rect()).catch(fail); };
    const observer = new ResizeObserver(resize);
    if (container.current) observer.observe(container.current);
    const initialize = async () => {
      listener = await NativeBrowser.addListener('state', (state) => { if (!disposed) handler.current({ ...state, connection: 'ready' }); });
      if (disposed) { await listener.remove(); return; }
      const openingUrl = latestUrl.current;
      await NativeBrowser.open({ url: openingUrl, ...rect() });
      if (disposed) { await NativeBrowser.close(); return; }
      ready.current = true;
      if (openingUrl !== latestUrl.current) await NativeBrowser.navigate({ url: latestUrl.current });
    };
    timer = setTimeout(() => void initialize().catch(fail), 120);
    window.visualViewport?.addEventListener('resize', resize);
    window.addEventListener('resize', resize);
    return () => {
      disposed = true;
      clearTimeout(timer);
      observer.disconnect();
      ready.current = false;
      void listener?.remove();
      void NativeBrowser.close().catch(() => {});
      window.visualViewport?.removeEventListener('resize', resize);
      window.removeEventListener('resize', resize);
    };
  }, []);
  useEffect(() => { if (ready.current) void NativeBrowser.navigate({ url }).catch(fail); }, [navigationId]);
  return <div className="native-browser-viewport" ref={container}><p>Opening the live Android browser...</p></div>;
});