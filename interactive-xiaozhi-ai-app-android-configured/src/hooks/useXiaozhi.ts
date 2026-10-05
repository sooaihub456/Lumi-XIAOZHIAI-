import { useCallback, useEffect, useRef, useState } from 'react';
import type { PluginListenerHandle } from '@capacitor/core';
import { XiaozhiAudio } from '../lib/audio';
import { isNative } from '../lib/platform';
import { isDesktop } from '../lib/desktop';
import { moriTools, type MoriToolHandler } from '../lib/mcp';
import { NativeXiaozhi } from '../lib/xiaozhiNative';
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
  const nativeListeners = useRef<PluginListenerHandle[]>([]);
  const nativeGeneration = useRef(0);
  const nativeActive = useRef(false);
  eventHandler.current = onEvent;
  toolHandler.current = onTool;

  const getAudio = useCallback(() => {
    audio.current ??= new XiaozhiAudio();
    return audio.current;
  }, []);

  const removeNativeListeners = useCallback(() => {
    const listeners = nativeListeners.current.splice(0);
    listeners.forEach((listener) => { void listener.remove().catch(() => {}); });
  }, []);

  const disconnect = useCallback(() => {
    clearTimeout(timeout.current);
    nativeGeneration.current += 1;
    nativeActive.current = false;
    removeNativeListeners();
    if (isNative) void NativeXiaozhi.disconnect().catch(() => {});
    const current = socket.current;
    socket.current = null;
    current?.close(1000, 'Leaving the conversation');
    session.current = '';
    audio.current?.stop();
    setStatus('demo');
    setError('');
  }, [removeNativeListeners]);

  const connect = useCallback((config: ConnectionConfig) => {
    disconnect();

    const hello = JSON.stringify({
      type: 'hello',
      version: 1,
      features: { mcp: !!toolHandler.current },
      transport: 'websocket',
      audio_params: { format: 'opus', sample_rate: 16000, channels: 1, frame_duration: 60 },
    });

    const handleTextMessage = (raw: string, send: (text: string) => void, fail: (message: string) => void) => {
      try {
        const event = JSON.parse(raw) as XiaozhiEvent;
        if (event.type === 'mori_ready') {
          send(hello);
        } else if (event.type === 'hello' && event.transport === 'websocket') {
          clearTimeout(timeout.current);
          session.current = event.session_id ?? '';
          setStatus('connected');
          setError('');
          eventHandler.current(event);
        } else if (event.type === 'mcp' && event.payload?.id !== undefined) {
          const payload = event.payload;
          const reply = (result: unknown, errorResult?: { code: number; message: string }) => {
            const response = JSON.stringify({
              session_id: session.current,
              type: 'mcp',
              payload: { jsonrpc: '2.0', id: payload.id, ...(errorResult ? { error: errorResult } : { result }) },
            });
            send(response);
          };
          if (payload.method === 'initialize') reply({ protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'Mori Companion', version: '0.6.0' } });
          else if (payload.method === 'tools/list') reply({ tools: toolHandler.current ? moriTools : [] });
          else if (payload.method === 'tools/call' && toolHandler.current && moriTools.some((tool) => tool.name === payload.params?.name)) {
            void toolHandler.current(payload.params!.name!, payload.params?.arguments || {})
              .then((result) => reply({ content: [{ type: 'text', text: JSON.stringify(result) }], isError: false }))
              .catch((cause) => reply({ content: [{ type: 'text', text: cause instanceof Error ? cause.message : 'The tool could not complete this action.' }], isError: true }));
          } else reply(null, { code: -32601, message: 'Unknown Mori tool or method.' });
        } else if (event.type === 'mori_error' || event.type === 'error') {
          fail(event.message || event.text || 'Xiaozhi could not complete the connection. Check your credentials.');
        } else {
          eventHandler.current(event);
        }
      } catch {
        setError('An unrecognized Xiaozhi server message was skipped.');
      }
    };

    if (isNative) {
      let url: URL;
      try {
        url = new URL(config.xiaozhiUrl);
        if (url.protocol !== 'wss:') throw new Error();
      } catch {
        setError('Enter a valid secure wss:// Xiaozhi WebSocket URL.');
        setStatus('error');
        return;
      }
      if (!config.deviceId.trim() || !config.clientId.trim()) {
        setError('A paired Xiaozhi Device ID and Client ID are required.');
        setStatus('error');
        return;
      }

      const generation = ++nativeGeneration.current;
      setStatus('connecting');
      let failed = false;
      const fail = (message: string) => {
        if (failed || generation !== nativeGeneration.current) return;
        failed = true;
        nativeGeneration.current += 1;
        nativeActive.current = false;
        clearTimeout(timeout.current);
        removeNativeListeners();
        void NativeXiaozhi.disconnect().catch(() => {});
        audio.current?.stop();
        session.current = '';
        setStatus('error');
        setError(message);
      };
      const send = (text: string) => {
        if (failed || generation !== nativeGeneration.current || !nativeActive.current) return;
        void NativeXiaozhi.send({ text }).catch((cause) => fail(cause instanceof Error ? cause.message : 'The native Xiaozhi connection could not send data.'));
      };

      timeout.current = setTimeout(() => fail('The Xiaozhi handshake timed out. Check the paired credentials and server URL.'), 15000);

      void (async () => {
        const listeners: PluginListenerHandle[] = [];
        try {
          listeners.push(await NativeXiaozhi.addListener('message', (message) => {
            if (generation !== nativeGeneration.current || failed) return;
            if (message.kind === 'binary') return; // Native Android consumes Opus frames before they reach the WebView.
            handleTextMessage(message.data, send, fail);
          }));
          listeners.push(await NativeXiaozhi.addListener('error', (event) => fail(event.message || 'The native Xiaozhi connection failed.')));
          listeners.push(await NativeXiaozhi.addListener('closed', (event) => {
            const reason = event.reason?.trim();
            fail(`Xiaozhi closed the connection${event.code ? ` (code ${event.code})` : ''}${reason ? `: ${reason}` : '.'}`);
          }));
          listeners.push(await NativeXiaozhi.addListener('audioError', (event) => {
            setError(event.message || 'Android could not play the Xiaozhi voice reply. Text chat is still available.');
          }));
          listeners.push(await NativeXiaozhi.addListener('state', () => {}));

          if (generation !== nativeGeneration.current || failed) {
            listeners.forEach((listener) => { void listener.remove().catch(() => {}); });
            return;
          }
          nativeListeners.current = listeners;
          await NativeXiaozhi.connect({
            url: url.href,
            deviceId: config.deviceId.trim(),
            clientId: config.clientId.trim(),
            token: config.token.trim(),
          });
          if (generation !== nativeGeneration.current || failed) return;
          nativeActive.current = true;
          send(hello);
        } catch (cause) {
          listeners.forEach((listener) => { if (!nativeListeners.current.includes(listener)) void listener.remove().catch(() => {}); });
          fail(cause instanceof Error ? cause.message : 'Could not open the native Xiaozhi connection.');
        }
      })();
      return;
    }

    let url: URL;
    try {
      url = new URL(config.bridgeUrl);
      if (!['ws:', 'wss:'].includes(url.protocol)) throw new Error();
    } catch {
      setError('Enter a valid ws:// or wss:// bridge URL.');
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
      const send = (text: string) => {
        if (socket.current === ws && ws.readyState === WebSocket.OPEN) ws.send(text);
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
        handleTextMessage(String(message.data), send, fail);
      };
      ws.onerror = () => fail('Could not reach your Xiaozhi bridge. Check the URL, TLS certificate, and allowed origins.');
      ws.onclose = () => fail('The Xiaozhi connection closed. Reconnect to continue your live conversation.');
    } catch {
      setStatus('error');
      setError('Your browser could not open this WebSocket connection. Try a secure wss:// URL.');
    }
  }, [disconnect, getAudio, removeNativeListeners]);

  const unlockAudio = useCallback(async () => {
    if (isNative) return;
    await getAudio().unlock();
  }, [getAudio]);

  const setAudioEnabled = useCallback((enabled: boolean) => {
    if (isNative) {
      void NativeXiaozhi.setAudioEnabled({ enabled }).catch(() => {});
      return;
    }
    getAudio().setEnabled(enabled);
  }, [getAudio]);

  const sendText = useCallback((text: string) => {
    if (status !== 'connected') return false;
    const message = JSON.stringify({ session_id: session.current, type: 'listen', state: 'detect', text });
    if (isNative) {
      if (!nativeActive.current) return false;
      void NativeXiaozhi.send({ text: message }).catch((cause) => {
        setError(cause instanceof Error ? cause.message : 'The native Xiaozhi connection could not send your message.');
        setStatus('error');
      });
      return true;
    }
    if (socket.current?.readyState !== WebSocket.OPEN) return false;
    socket.current.send(message);
    return true;
  }, [status]);

  const interrupt = useCallback(() => {
    audio.current?.stop();
    const message = JSON.stringify({ session_id: session.current, type: 'abort', reason: 'wake_word_detected' });
    if (isNative) {
      void NativeXiaozhi.stopAudio().catch(() => {});
      if (nativeActive.current) void NativeXiaozhi.send({ text: message }).catch(() => {});
      return;
    }
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(message);
  }, []);

  useEffect(() => () => {
    clearTimeout(timeout.current);
    nativeGeneration.current += 1;
    nativeActive.current = false;
    removeNativeListeners();
    if (isNative) void NativeXiaozhi.disconnect().catch(() => {});
    const current = socket.current;
    socket.current = null;
    current?.close();
    audio.current?.dispose();
    audio.current = null;
  }, [removeNativeListeners]);

  return { status, error, connect, disconnect, sendText, interrupt, getAudio, unlockAudio, setAudioEnabled };
}
