import { useCallback, useEffect, useRef, useState } from 'react';
import { XiaozhiAudio } from '../lib/audio';
import { isNative } from '../lib/platform';
import { isDesktop } from '../lib/desktop';
import { moriTools, type MoriToolHandler } from '../lib/mcp';
import type { ConnectionConfig, ConnectionStatus, XiaozhiEvent } from '../types';

export function useXiaozhi(onEvent: (event: XiaozhiEvent) => void, onTool?: MoriToolHandler) {
  const [status, setStatus] = useState<ConnectionStatus>('demo');
  const [error, setError] = useState('');
  const socket = useRef<WebSocket | null>(null);
  const session = useRef('');
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const eventHandler = useRef(onEvent);
  const toolHandler = useRef(onTool);
  const audio = useRef<XiaozhiAudio | null>(null);
  eventHandler.current = onEvent;
  toolHandler.current = onTool;

  const getAudio = useCallback(() => {
    audio.current ??= new XiaozhiAudio();
    return audio.current;
  }, []);

  const disconnect = useCallback(() => {
    clearTimeout(timeout.current);
    const current = socket.current;
    socket.current = null;
    current?.close(1000, 'Leaving the conversation');
    session.current = '';
    audio.current?.stop();
    setStatus('demo');
    setError('');
  }, []);

  const connect = useCallback((config: ConnectionConfig) => {
    disconnect();
    let url: URL;
    try {
      url = new URL(config.bridgeUrl);
      if (!['ws:', 'wss:'].includes(url.protocol)) throw new Error();
    } catch {
      setError('Enter a valid ws:// or wss:// bridge URL.');
      setStatus('error');
      return;
    }
    if (isNative && (url.protocol !== 'wss:' || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
      setError('On your phone, use your deployed bridge\'s secure wss:// address. localhost means this phone, not your computer. Add https://localhost to the bridge\'s ALLOWED_ORIGINS.');
      setStatus('error');
      return;
    }
    if ((location.protocol === 'https:' || isDesktop) && url.protocol !== 'wss:' && !['localhost', '127.0.0.1'].includes(url.hostname)) {
      setError('This secure page needs a secure wss:// bridge.');
      setStatus('error');
      return;
    }
    setStatus('connecting');
    try {
      const ws = new WebSocket(url.href);
      socket.current = ws;
      ws.binaryType = 'arraybuffer';
      const fail = (message: string) => {
        if (socket.current !== ws) return;
        clearTimeout(timeout.current);
        socket.current = null;
        audio.current?.stop();
        setStatus('error');
        setError(message);
        ws.close();
      };
      timeout.current = setTimeout(() => fail('The connection timed out. Check that your bridge is running and your Xiaozhi credentials are paired.'), 15000);
      ws.onopen = () => ws.send(JSON.stringify({
        type: 'mori_connect', device_id: config.deviceId, client_id: config.clientId, token: config.token,
      }));
      ws.onmessage = (message) => {
        if (socket.current !== ws) return;
        if (message.data instanceof ArrayBuffer) {
          getAudio().enqueue(message.data, () => setError('Voice playback is unavailable, but your text conversation still works.'));
          return;
        }
        try {
          const event = JSON.parse(message.data) as XiaozhiEvent;
          if (event.type === 'mori_ready') {
            ws.send(JSON.stringify({ type: 'hello', version: 1, features: { mcp: !!toolHandler.current }, transport: 'websocket', audio_params: { format: 'opus', sample_rate: 16000, channels: 1, frame_duration: 60 } }));
          } else if (event.type === 'hello' && event.transport === 'websocket') {
            clearTimeout(timeout.current);
            session.current = event.session_id ?? '';
            setStatus('connected');
            setError('');
            eventHandler.current(event);
          } else if (event.type === 'mcp' && event.payload?.id !== undefined) {
            const payload = event.payload;
            const reply = (result: unknown, errorResult?: { code: number; message: string }) => {
              if (socket.current === ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ session_id: session.current, type: 'mcp', payload: { jsonrpc: '2.0', id: payload.id, ...(errorResult ? { error: errorResult } : { result }) } }));
            };
            if (payload.method === 'initialize') reply({ protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'Mori Companion', version: '0.5.0' } });
            else if (payload.method === 'tools/list') reply({ tools: toolHandler.current ? moriTools : [] });
            else if (payload.method === 'tools/call' && toolHandler.current && moriTools.some((tool) => tool.name === payload.params?.name)) {
              void toolHandler.current(payload.params!.name!, payload.params?.arguments || {}).then((result) => reply({ content: [{ type: 'text', text: JSON.stringify(result) }], isError: false })).catch((cause) => reply({ content: [{ type: 'text', text: cause instanceof Error ? cause.message : 'The tool could not complete this action.' }], isError: true }));
            } else reply(null, { code: -32601, message: 'Unknown Mori tool or method.' });
          } else if (event.type === 'mori_error' || event.type === 'error') {
            fail(event.message || event.text || 'Xiaozhi could not complete the connection. Check your credentials.');
          } else {
            eventHandler.current(event);
          }
        } catch {
          setError('An unrecognized server message was skipped.');
        }
      };
      ws.onerror = () => fail('Could not reach your Xiaozhi bridge. Check the URL, TLS certificate, and allowed origins.');
      ws.onclose = () => fail('The Xiaozhi connection closed. Reconnect to continue your live conversation.');
    } catch {
      setStatus('error');
      setError('Your browser could not open this WebSocket connection. Try a secure wss:// URL.');
    }
  }, [disconnect, getAudio]);

  const sendText = useCallback((text: string) => {
    if (socket.current?.readyState !== WebSocket.OPEN || !session.current && status !== 'connected') return false;
    socket.current.send(JSON.stringify({ session_id: session.current, type: 'listen', state: 'detect', text }));
    return true;
  }, [status]);

  const interrupt = useCallback(() => {
    audio.current?.stop();
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify({ session_id: session.current, type: 'abort', reason: 'wake_word_detected' }));
  }, []);

  useEffect(() => () => {
    clearTimeout(timeout.current);
    const current = socket.current;
    socket.current = null;
    current?.close();
    audio.current?.dispose();
    audio.current = null;
  }, []);

  return { status, error, connect, disconnect, sendText, interrupt, getAudio };
}