import { useCallback, useEffect, useRef, useState } from 'react';
import type { PluginListenerHandle } from '@capacitor/core';
import { SpeechRecognition as NativeRecognition } from '@capgo/capacitor-speech-recognition';
import { XiaozhiAudio } from '../lib/audio';
import { isNative } from '../lib/platform';
import { isDesktop } from '../lib/desktop';
import { moriTools, type MoriToolHandler } from '../lib/mcp';
import { NativeXiaozhi } from '../lib/xiaozhiNative';
import type { ConnectionConfig, ConnectionStatus, XiaozhiEvent } from '../types';

export function useXiaozhi(onEvent: (event: XiaozhiEvent) => void, onTool?: MoriToolHandler) {
  const [status, setStatus] = useState<ConnectionStatus>('demo');
  const [error, setError] = useState('');
  const [audioState, setAudioState] = useState<'idle' | 'ready' | 'playing'>('idle');
  const [inputState, setInputState] = useState<'idle' | 'listening'>('idle');
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
    setAudioState('idle');
    setInputState('idle');
    setError('');
  }, [removeNativeListeners]);

  const connect = useCallback((config: ConnectionConfig) => {
    disconnect();

    let officialHostedAsr = false;
    if (isNative) {
      try {
        const host = new URL(config.xiaozhiUrl).hostname.toLowerCase();
        officialHostedAsr = host === 'api.tenclass.net' || host === 'api.xiaozhi.me' || host.endsWith('.xiaozhi.me');
      } catch { /* URL validation below will surface the actual connection error. */ }
    }
    // Keep the public hosted service on the official protocol only. The bilingual
    // extension is sent only to a bridge/self-hosted endpoint that can honor it.
    const bilingualAsr = config.asrMode === 'bilingual-auto' && !officialHostedAsr;
    const asrLanguages = config.asrLanguages.split(',').map((language) => language.trim()).filter(Boolean).slice(0, 8);
    const hello = JSON.stringify({
      type: 'hello',
      version: 1,
      features: { mcp: !!toolHandler.current, ...(bilingualAsr ? { mori_bilingual_asr: true } : {}) },
      transport: 'websocket',
      audio_params: { format: 'opus', sample_rate: 16000, channels: 1, frame_duration: 60 },
      // Standard Xiaozhi servers ignore unknown fields. A compatible self-hosted
      // gateway can use this extension to select an auto-language ASR provider.
      ...(bilingualAsr ? { mori: { asr: { mode: 'auto', languages: asrLanguages.length ? asrLanguages : ['zh', 'en'] } } } : {}),
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
            setAudioState('idle');
            setError(event.message || 'Android could not play the Xiaozhi voice reply. Text chat is still available.');
          }));
          listeners.push(await NativeXiaozhi.addListener('audioState', (event) => {
            if (generation !== nativeGeneration.current || failed) return;
            if (event.state === 'playing') {
              setAudioState('playing');
              setError('');
            } else if (event.state === 'ready') {
              setAudioState('ready');
            } else if (event.state === 'stopped') {
              setAudioState('idle');
            }
          }));
          listeners.push(await NativeXiaozhi.addListener('inputState', (event) => {
            if (generation !== nativeGeneration.current || failed) return;
            setInputState(event.state === 'listening' ? 'listening' : 'idle');
          }));
          listeners.push(await NativeXiaozhi.addListener('inputError', (event) => {
            if (generation !== nativeGeneration.current || failed) return;
            setInputState('idle');
            setError(event.message || 'Android microphone streaming to Xiaozhi stopped unexpectedly.');
          }));
          listeners.push(await NativeXiaozhi.addListener('state', (event) => {
            if (generation !== nativeGeneration.current || failed) return;
            if (event.state === 'reconnecting' || event.state === 'connecting') {
              eventHandler.current({ type: 'connection', state: event.state });
              nativeActive.current = false;
              session.current = '';
              audio.current?.stop();
              setAudioState('idle');
              setInputState('idle');
              setStatus('connecting');
              setError('');
            } else if (event.state === 'open') {
              // The native layer will replay the saved hello automatically after
              // a reconnect. Keep the UI in connecting state until Xiaozhi sends
              // a fresh server hello/session_id.
              nativeActive.current = true;
              if (event.reconnected) {
                eventHandler.current({ type: 'connection', state: 'reconnected' });
                session.current = '';
                setStatus('connecting');
                setError('');
              }
            }
          }));

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
            asrMode: bilingualAsr ? 'bilingual-auto' : 'server',
            asrLanguages: config.asrLanguages,
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
        asr_mode: config.asrMode, asr_languages: config.asrLanguages,
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

    // The official Xiaozhi protocol reserves listen/state=detect for an actual
    // wake word. Recent Xiaozhi servers reject long text injected through that
    // field. Android therefore never sends user transcripts through detect;
    // normal live turns use startListening() + raw Opus microphone frames.
    if (isNative) return false;

    // Legacy web/desktop bridge compatibility. Browser JavaScript cannot attach
    // the Xiaozhi auth headers or provide the Android native Opus microphone
    // path, so older bridge deployments may still implement text injection.
    const message = JSON.stringify({ session_id: session.current, type: 'listen', state: 'detect', text });
    if (socket.current?.readyState !== WebSocket.OPEN) return false;
    socket.current.send(message);
    return true;
  }, [status]);

  const sendContext = useCallback((text: string) => {
    if (isNative) return false;
    return sendText(text);
  }, [sendText]);

  const startListening = useCallback(async (mode: 'auto' | 'manual' | 'realtime' = 'auto') => {
    if (!isNative || status !== 'connected' || !nativeActive.current) return false;
    try {
      let permission = await NativeRecognition.checkPermissions();
      if (permission.speechRecognition !== 'granted') permission = await NativeRecognition.requestPermissions();
      if (permission.speechRecognition !== 'granted') {
        setError('Microphone permission is needed for Xiaozhi voice chat. Allow it in Android Settings > Apps > Mori > Permissions.');
        return false;
      }
      await NativeXiaozhi.startListening({ mode });
      setInputState('listening');
      setError('');
      return true;
    } catch (cause) {
      setInputState('idle');
      setError(cause instanceof Error ? cause.message : 'Could not start Xiaozhi microphone streaming.');
      return false;
    }
  }, [status]);

  const triggerProactive = useCallback(async (wakeWord = '你好小智') => {
    if (!isNative || status !== 'connected' || !nativeActive.current) return false;
    try {
      const result = await NativeXiaozhi.triggerProactive({ wakeWord });
      return !!result.triggered;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not ask Xiaozhi to start a proactive conversation.');
      return false;
    }
  }, [status]);

  const stopListening = useCallback(async () => {
    if (!isNative) return;
    setInputState('idle');
    try { await NativeXiaozhi.stopListening(); } catch { /* Connection may already be reconnecting. */ }
  }, []);

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

  return { status, error, audioState, inputState, connect, disconnect, sendText, sendContext, startListening, stopListening, triggerProactive, interrupt, getAudio, unlockAudio, setAudioEnabled };
}
