import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ArrowUp, Keyboard, LoaderCircle, WifiOff } from 'lucide-react';
import type { BrowserHandle, BrowserSettings, BrowserSnapshot, BrowserState } from '../lib/browser';

export default forwardRef<BrowserHandle, { url: string; navigationId: number; settings: BrowserSettings; onState: (state: BrowserState) => void }>(function RemoteBrowserViewport({ url, navigationId, settings, onState }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const socket = useRef<WebSocket | null>(null);
  const ready = useRef(false);
  const canInspect = useRef(false);
  const latestUrl = useRef(url);
  const handler = useRef(onState);
  const [status, setStatus] = useState('connecting');
  const [error, setError] = useState('');
  const [keyboard, setKeyboard] = useState(false);
  const [typedText, setTypedText] = useState('');
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const lastMove = useRef(0);
  const serial = useRef(0);
  const pending = useRef(new Map<string, { resolve: (page: BrowserSnapshot) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>());
  latestUrl.current = url;
  handler.current = onState;
  const send = (message: object) => { if (socket.current?.readyState === WebSocket.OPEN && ready.current) socket.current.send(JSON.stringify(message)); };
  useImperativeHandle(ref, () => ({
    command: (action) => { if (!ready.current || socket.current?.readyState !== WebSocket.OPEN) return false; setError(''); send({ type: action }); return true; },
    isReady: () => ready.current && socket.current?.readyState === WebSocket.OPEN,
    inspect: (address) => new Promise<BrowserSnapshot>((resolve, reject) => {
      if (!ready.current || socket.current?.readyState !== WebSocket.OPEN) { reject(new Error('The live browser is not connected.')); return; }
      if (!canInspect.current) { reject(new Error('This browser server does not support page reading. Update and restart the included browser service.')); return; }
      const id = `read-${++serial.current}`;
      const timer = setTimeout(() => { pending.current.delete(id); reject(new Error('The website did not finish loading. Try again or complete any verification in the browser.')); }, 35000);
      pending.current.set(id, { resolve, reject, timer });
      send({ type: 'inspect', id, ...(address ? { url: address } : {}) });
    }),
  }));

  useEffect(() => {
    let disposed = false;
    let decoding = false;
    let pendingFrame: Blob | null = null;
    let opened = false;
    let openingUrl = latestUrl.current;
    let ws: WebSocket;
    let lastState: BrowserState = { url: latestUrl.current, title: '', loading: true, canGoBack: false, canGoForward: false, connection: 'connecting' };
    setStatus('connecting');
    setError('');
    handler.current(lastState);
    const fail = (message: string) => {
      if (disposed) return;
      setStatus('error'); setError(message);
      handler.current({ ...lastState, loading: false, connection: 'error', error: message });
    };
    try {
      const endpoint = new URL(settings.endpoint);
      if (!['ws:', 'wss:'].includes(endpoint.protocol)) throw new Error('Enter a ws:// or wss:// live-browser address.');
      if (location.protocol === 'https:' && endpoint.protocol !== 'wss:') throw new Error('A secure page requires a wss:// browser service.');
      ws = new WebSocket(endpoint);
    } catch (cause) { fail(cause instanceof Error ? cause.message : 'Invalid browser service address.'); return; }
    socket.current = ws;
    ws.binaryType = 'blob';
    const timeout = setTimeout(() => { if (!ready.current) { fail('The live browser did not respond. Check that the service is running.'); ws.close(); } }, 20000);
    const size = () => ({ width: Math.max(360, Math.min(1440, Math.round(viewport.current?.clientWidth || 1000))), height: Math.max(320, Math.min(1000, Math.round(viewport.current?.clientHeight || 640))) });
    async function draw(frame: Blob) {
      if (decoding) { pendingFrame = frame; return; }
      decoding = true;
      try {
        const image = await createImageBitmap(frame);
        if (!disposed && canvas.current) {
          if (canvas.current.width !== image.width) canvas.current.width = image.width;
          if (canvas.current.height !== image.height) canvas.current.height = image.height;
          canvas.current.getContext('2d')?.drawImage(image, 0, 0);
          if (ready.current) setStatus('live');
        }
        image.close();
      } catch { /* A newer streamed frame can recover from a dropped frame. */ }
      decoding = false;
      if (pendingFrame && !disposed) { const next = pendingFrame; pendingFrame = null; void draw(next); }
    }
    ws.onopen = () => { openingUrl = latestUrl.current; ws.send(JSON.stringify({ type: 'auth', token: settings.token, url: openingUrl, ...size() })); };
    ws.onmessage = (message) => {
      if (disposed) return;
      if (message.data instanceof Blob) { void draw(message.data); return; }
      try {
        const data = JSON.parse(message.data);
        if (data.type === 'ready') { opened = true; ready.current = true; canInspect.current = !!data.capabilities?.inspect; clearTimeout(timeout); setStatus('loading'); lastState = { ...lastState, connection: 'ready' }; handler.current(lastState); if (openingUrl !== latestUrl.current) send({ type: 'navigate', url: latestUrl.current }); }
        if (data.type === 'state') { lastState = { ...data, connection: 'ready' }; handler.current(lastState); }
        if (data.type === 'result' && data.id) {
          const waiting = pending.current.get(data.id);
          if (waiting) { clearTimeout(waiting.timer); pending.current.delete(data.id); if (data.error) waiting.reject(new Error(data.error)); else waiting.resolve(data.page); }
        }
        if (data.type === 'error') { setError(data.message); if (!opened) setStatus('error'); handler.current({ ...lastState, loading: false, error: data.message }); }
      } catch { setError('An invalid live-browser message was skipped.'); }
    };
    ws.onerror = () => fail('Cannot reach the live Chromium service. Check its URL, TLS certificate, and allowed origins.');
    const rejectPending = () => { for (const request of pending.current.values()) { clearTimeout(request.timer); request.reject(new Error('The browser session closed. No page content was returned.')); } pending.current.clear(); };
    ws.onclose = () => { ready.current = false; clearTimeout(timeout); rejectPending(); fail(opened ? 'The live session ended. Reload to reconnect, or open this website in your device browser.' : 'The browser service refused the connection. Check your session token and server configuration.'); };
    let resizeTimer: ReturnType<typeof setTimeout>;
    const observer = new ResizeObserver(() => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => send({ type: 'resize', ...size() }), 150); });
    if (viewport.current) observer.observe(viewport.current);
    const wheel = (event: WheelEvent) => { event.preventDefault(); send({ type: 'scroll', x: Math.max(-1000, Math.min(1000, event.deltaX)), y: Math.max(-1000, Math.min(1000, event.deltaY)) }); };
    const element = canvas.current;
    element?.addEventListener('wheel', wheel, { passive: false });
    return () => { disposed = true; ready.current = false; rejectPending(); clearTimeout(timeout); clearTimeout(resizeTimer); observer.disconnect(); ws.close(); socket.current = null; element?.removeEventListener('wheel', wheel); };
  }, [settings.endpoint, settings.token]);
  useEffect(() => { setError(''); send({ type: 'navigate', url }); }, [navigationId]);

  return <div className="remote-browser-viewport" ref={viewport}>
    <canvas ref={canvas} tabIndex={0} aria-label="Live Chromium webpage. Click to interact; use the keyboard to type." onPointerMove={(event) => {
      if (event.pointerType !== 'mouse' || Date.now() - lastMove.current < 60 || !canvas.current) return;
      lastMove.current = Date.now();
      const bounds = canvas.current.getBoundingClientRect();
      send({ type: 'move', x: (event.clientX - bounds.left) / bounds.width * canvas.current.width, y: (event.clientY - bounds.top) / bounds.height * canvas.current.height });
    }} onPointerDown={(event) => { pointerStart.current = { x: event.clientX, y: event.clientY }; canvas.current?.focus(); }} onPointerUp={(event) => {
      const start = pointerStart.current; pointerStart.current = null;
      if (!start || !canvas.current) return;
      if (Math.abs(start.y - event.clientY) > 15 && event.pointerType === 'touch') { send({ type: 'scroll', x: 0, y: (start.y - event.clientY) * 2 }); return; }
      const bounds = canvas.current.getBoundingClientRect();
      send({ type: 'click', x: (event.clientX - bounds.left) / bounds.width * canvas.current.width, y: (event.clientY - bounds.top) / bounds.height * canvas.current.height });
    }} onKeyDown={(event) => {
      if ((event.ctrlKey || event.metaKey) && ['l', 'r', 'w', 't', 'v'].includes(event.key.toLowerCase())) return;
      if (event.key === 'Escape' || event.key === 'F5') return;
      event.preventDefault();
      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) send({ type: 'text', text: event.key });
      else send({ type: 'key', key: `${event.ctrlKey || event.metaKey ? 'Control+' : ''}${event.shiftKey && event.key.length > 1 ? 'Shift+' : ''}${event.key}` });
    }} onPaste={(event) => { event.preventDefault(); send({ type: 'text', text: event.clipboardData.getData('text').slice(0, 5000) }); }} />
    {status !== 'live' && <div className="remote-status">{status === 'error' ? <WifiOff size={29} /> : <LoaderCircle size={29} className="spin" />}<h3>{status === 'error' ? 'The live browser needs a connection.' : 'Starting your live browser...'}</h3><p>{error || 'A real Chromium session, connected to the internet. No saved pages or simulated results.'}</p></div>}
    <button className="remote-keyboard-toggle" onClick={() => setKeyboard(!keyboard)} aria-label="Toggle mobile typing controls"><Keyboard size={17} /></button>
    {keyboard && <form className="remote-keyboard" onSubmit={(event) => { event.preventDefault(); send({ type: 'text', text: typedText }); setTypedText(''); }}><input aria-label="Text to type into the focused webpage field" value={typedText} onChange={(event) => setTypedText(event.target.value)} placeholder="Tap a field on the page, then type here" /><button type="submit" aria-label="Type into webpage"><ArrowUp size={17} /></button><button type="button" onClick={() => send({ type: 'key', key: 'Enter' })}>Enter</button></form>}
  </div>;
});