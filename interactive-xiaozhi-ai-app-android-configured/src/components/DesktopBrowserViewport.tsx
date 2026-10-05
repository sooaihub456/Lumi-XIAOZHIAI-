import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { desktopBridge, type DesktopAction } from '../lib/desktop';
import { getAssistantReadPermission, type BrowserHandle, type BrowserState } from '../lib/browser';

export default forwardRef<BrowserHandle, { url: string; navigationId: number; onState: (state: BrowserState) => void }>(function DesktopBrowserViewport({ url, navigationId, onState }, ref) {
  const container = useRef<HTMLDivElement>(null);
  const lease = useRef('');
  const ready = useRef(false);
  const latestUrl = useRef(url);
  const handler = useRef(onState);
  latestUrl.current = url;
  handler.current = onState;
  const fail = (error: unknown) => handler.current({ url: latestUrl.current, title: '', loading: false, canGoBack: false, canGoForward: false, connection: 'error', error: error instanceof Error ? error.message : 'The desktop browser could not load this page.' });

  useImperativeHandle(ref, () => ({
    isReady: () => ready.current,
    command: (action) => {
      if (!ready.current) return false;
      void desktopBridge()!.browser.command({ lease: lease.current, action }).then((state) => handler.current(state)).catch(fail);
      return true;
    },
    inspect: async (address) => {
      if (!ready.current) throw new Error('The local Chromium tab is still starting.');
      return desktopBridge()!.browser.inspect({ lease: lease.current, ...(address ? { url: address } : {}) });
    },
  }));

  useEffect(() => {
    const bridge = desktopBridge();
    if (!bridge) { fail(new Error('Run the Mori desktop application to use its built-in Chromium engine.')); return; }
    let disposed = false;
    let opening = false;
    let raf = 0;
    const id = crypto.randomUUID();
    lease.current = id;
    const bounds = () => {
      const rect = container.current?.getBoundingClientRect();
      return rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null;
    };
    const onState = bridge.browser.onState((state) => { if (!disposed && ready.current) handler.current(state); });
    const resize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const box = bounds();
        if (!disposed && ready.current && box) void bridge.browser.bounds({ lease: id, bounds: box }).catch(() => {});
      });
    };
    const initialize = async () => {
      const box = bounds();
      if (disposed || opening || !box || box.width < 2 || box.height < 2) return;
      opening = true;
      const openingUrl = latestUrl.current;
      try {
        await bridge.browser.sharing(getAssistantReadPermission());
        if (disposed) return;
        const state = await bridge.browser.open({ lease: id, url: openingUrl, bounds: box });
        if (disposed) { await bridge.browser.close({ lease: id }); return; }
        ready.current = true;
        handler.current(state);
        if (openingUrl !== latestUrl.current) await bridge.browser.navigate({ lease: id, url: latestUrl.current });
        resize();
      } catch (error) { if (!disposed) fail(error); }
    };
    handler.current({ url: latestUrl.current, title: '', loading: true, canGoBack: false, canGoForward: false, connection: 'connecting' });
    const observer = new ResizeObserver(() => { if (ready.current) resize(); else void initialize(); });
    if (container.current) observer.observe(container.current);
    const timer = setTimeout(() => void initialize(), 50);
    const shortcut = bridge.onShortcut((action) => { if (action === 'resize') resize(); });
    const control = (event: Event) => {
      const action = (event as CustomEvent<DesktopAction>).detail;
      if (ready.current && ['mute', 'stop', 'zoom-in', 'zoom-out', 'zoom-reset'].includes(action)) void bridge.browser.command({ lease: id, action }).then((state) => { if (!disposed) handler.current(state); }).catch((error) => { if (!disposed) fail(error); });
    };
    window.addEventListener('mori-desktop-control', control);
    window.addEventListener('resize', resize);
    window.addEventListener('scroll', resize, true);
    window.visualViewport?.addEventListener('resize', resize);
    return () => {
      disposed = true; ready.current = false; clearTimeout(timer); cancelAnimationFrame(raf);
      observer.disconnect(); onState(); shortcut();
      window.removeEventListener('mori-desktop-control', control);
      void bridge.browser.close({ lease: id }).catch(() => {});
      window.removeEventListener('resize', resize); window.removeEventListener('scroll', resize, true);
      window.visualViewport?.removeEventListener('resize', resize);
    };
  }, []);

  useEffect(() => {
    if (ready.current) void desktopBridge()!.browser.navigate({ lease: lease.current, url }).then((state) => handler.current(state)).catch(fail);
  }, [navigationId]);
  return <div className="desktop-browser-viewport" ref={container} aria-label="Local Chromium website"><p>Opening Mori's built-in Chromium browser...</p></div>;
});