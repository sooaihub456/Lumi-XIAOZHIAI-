import { useCallback, useEffect, useRef, useState } from 'react';
import { moriTools, type MoriToolHandler } from '../lib/mcp';
import { proactiveCuePrompt } from '../lib/lumiPrompt';
import type { ConnectionConfig, ConnectionStatus, XiaozhiEvent } from '../types';

type RealtimeServerEvent = {
  type?: string;
  transcript?: string;
  delta?: string;
  error?: { message?: string };
  response?: {
    status?: string;
    status_details?: { error?: { message?: string } };
    output?: Array<{
      type?: string;
      name?: string;
      call_id?: string;
      arguments?: string;
    }>;
  };
};

function toolDefinitions() {
  return moriTools.map((tool) => ({
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema,
  }));
}

export function useOpenAIRealtime(onEvent: (event: XiaozhiEvent) => void, onTool?: MoriToolHandler) {
  const [status, setStatus] = useState<ConnectionStatus>('demo');
  const [error, setError] = useState('');
  const [audioState, setAudioState] = useState<'idle' | 'ready' | 'playing'>('idle');
  const [inputState, setInputState] = useState<'idle' | 'listening'>('idle');
  const peer = useRef<RTCPeerConnection | null>(null);
  const dataChannel = useRef<RTCDataChannel | null>(null);
  const microphone = useRef<MediaStream | null>(null);
  const remoteAudio = useRef<HTMLAudioElement | null>(null);
  const connectedConfig = useRef<ConnectionConfig | null>(null);
  const eventHandler = useRef(onEvent);
  const toolHandler = useRef(onTool);
  const audioEnabled = useRef(true);
  const speaking = useRef(false);
  eventHandler.current = onEvent;
  toolHandler.current = onTool;

  const emitTtsStart = useCallback(() => {
    if (speaking.current) return;
    speaking.current = true;
    setAudioState('playing');
    eventHandler.current({ type: 'tts', state: 'start' });
  }, []);

  const sendEvent = useCallback((event: unknown) => {
    const channel = dataChannel.current;
    if (!channel || channel.readyState !== 'open') return false;
    channel.send(JSON.stringify(event));
    return true;
  }, []);

  const disconnect = useCallback(() => {
    speaking.current = false;
    dataChannel.current?.close();
    dataChannel.current = null;
    peer.current?.close();
    peer.current = null;
    microphone.current?.getTracks().forEach((track) => track.stop());
    microphone.current = null;
    if (remoteAudio.current) {
      remoteAudio.current.pause();
      remoteAudio.current.srcObject = null;
      remoteAudio.current.remove();
    }
    remoteAudio.current = null;
    connectedConfig.current = null;
    setStatus('demo');
    setError('');
    setAudioState('idle');
    setInputState('idle');
  }, []);

  const runToolCalls = useCallback(async (items: NonNullable<RealtimeServerEvent['response']>['output']) => {
    if (!items || !toolHandler.current) return false;
    const calls = items.filter((item) => item.type === 'function_call' && item.name && item.call_id);
    if (!calls.length) return false;

    for (const call of calls) {
      let args: Record<string, unknown> = {};
      try { args = call.arguments ? JSON.parse(call.arguments) : {}; } catch { args = {}; }
      try {
        const result = await toolHandler.current(call.name!, args);
        sendEvent({
          type: 'conversation.item.create',
          item: { type: 'function_call_output', call_id: call.call_id, output: JSON.stringify(result) },
        });
      } catch (cause) {
        sendEvent({
          type: 'conversation.item.create',
          item: {
            type: 'function_call_output',
            call_id: call.call_id,
            output: JSON.stringify({ error: cause instanceof Error ? cause.message : 'The tool could not complete this action.' }),
          },
        });
      }
    }
    sendEvent({ type: 'response.create' });
    return true;
  }, [sendEvent]);

  const connect = useCallback((config: ConnectionConfig) => {
    disconnect();
    const tokenUrl = config.openaiTokenUrl.trim();
    if (!tokenUrl) {
      setStatus('error');
      setError('Enter your OpenAI Realtime token endpoint URL. Keep the real OpenAI API key on that server, not inside the app.');
      return;
    }
    let parsed: URL;
    try {
      parsed = new URL(tokenUrl);
      if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error();
      if (location.protocol === 'https:' && parsed.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(parsed.hostname)) throw new Error();
    } catch {
      setStatus('error');
      setError('Enter a valid HTTPS OpenAI Realtime token endpoint URL.');
      return;
    }

    setStatus('connecting');
    setError('');
    connectedConfig.current = config;

    void (async () => {
      try {
        const tokenResponse = await fetch(parsed.href, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'gpt-realtime-2.1', voice: config.openaiVoice, instructions: config.systemPrompt }),
        });
        const tokenBody = await tokenResponse.json().catch(() => ({})) as { value?: string; client_secret?: { value?: string }; error?: string | { message?: string } };
        const ephemeralKey = tokenBody.value || tokenBody.client_secret?.value;
        if (!tokenResponse.ok || !ephemeralKey) {
          const message = typeof tokenBody.error === 'string' ? tokenBody.error : tokenBody.error?.message;
          throw new Error(message || `Token endpoint returned HTTP ${tokenResponse.status}.`);
        }

        const pc = new RTCPeerConnection();
        peer.current = pc;
        const audio = document.createElement('audio');
        audio.autoplay = true;
        audio.muted = !audioEnabled.current;
        audio.setAttribute('playsinline', 'true');
        audio.style.display = 'none';
        document.body.appendChild(audio);
        remoteAudio.current = audio;
        pc.ontrack = (event) => {
          audio.srcObject = event.streams[0];
          void audio.play().catch(() => setError('Tap Connect or the voice button once to allow realtime audio playback.'));
        };
        pc.onconnectionstatechange = () => {
          if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
            setStatus('error');
            setError('The OpenAI Realtime connection closed. Reconnect to continue.');
            setInputState('idle');
            setAudioState('idle');
          }
        };

        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        microphone.current = stream;
        for (const track of stream.getAudioTracks()) {
          track.enabled = false;
          pc.addTrack(track, stream);
        }

        const channel = pc.createDataChannel('oai-events');
        dataChannel.current = channel;
        channel.onopen = () => {
          sendEvent({
            type: 'session.update',
            session: {
              type: 'realtime',
              tools: toolDefinitions(),
              tool_choice: 'auto',
              audio: {
                input: {
                  transcription: { model: 'gpt-live-transcribe' },
                  turn_detection: { type: 'semantic_vad', create_response: true, interrupt_response: true },
                },
              },
            },
          });
          setStatus('connected');
          setAudioState('ready');
          setError('');
          eventHandler.current({ type: 'hello', transport: 'webrtc' });
        };
        channel.onclose = () => {
          if (peer.current === pc && pc.connectionState !== 'closed') {
            setStatus('error');
            setError('The OpenAI Realtime data channel closed. Reconnect to continue.');
          }
        };
        channel.onmessage = (message) => {
          let event: RealtimeServerEvent;
          try { event = JSON.parse(String(message.data)); } catch { return; }
          if (event.type === 'conversation.item.input_audio_transcription.completed' && event.transcript?.trim()) {
            eventHandler.current({ type: 'stt', text: event.transcript.trim() });
          } else if (event.type === 'response.output_audio.delta') {
            emitTtsStart();
          } else if (event.type === 'response.output_audio_transcript.done' && event.transcript?.trim()) {
            eventHandler.current({ type: 'tts', state: 'sentence_start', text: event.transcript.trim() });
          } else if (event.type === 'response.done') {
            void runToolCalls(event.response?.output).then((continued) => {
              if (continued) return;
              if (speaking.current) eventHandler.current({ type: 'tts', state: 'stop' });
              speaking.current = false;
              setAudioState('ready');
              const failure = event.response?.status_details?.error?.message;
              if (event.response?.status === 'failed' && failure) setError(failure);
            });
          } else if (event.type === 'error') {
            setError(event.error?.message || 'OpenAI Realtime reported an error.');
          }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        if (!offer.sdp) throw new Error('Could not create the realtime audio offer.');
        const answerResponse = await fetch('https://api.openai.com/v1/realtime/calls', {
          method: 'POST',
          body: offer.sdp,
          headers: { Authorization: `Bearer ${ephemeralKey}`, 'Content-Type': 'application/sdp' },
        });
        if (!answerResponse.ok) throw new Error(`OpenAI Realtime rejected the audio session (HTTP ${answerResponse.status}).`);
        await pc.setRemoteDescription({ type: 'answer', sdp: await answerResponse.text() });
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : 'Could not start OpenAI Realtime.';
        disconnect();
        setStatus('error');
        setError(message);
      }
    })();
  }, [disconnect, emitTtsStart, runToolCalls, sendEvent]);

  const sendText = useCallback((text: string) => {
    if (status !== 'connected' || !text.trim()) return false;
    if (!sendEvent({
      type: 'conversation.item.create',
      item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] },
    })) return false;
    sendEvent({ type: 'response.create' });
    return true;
  }, [sendEvent, status]);

  const sendContext = useCallback((text: string) => sendText(text), [sendText]);

  const startListening = useCallback(async (_mode: 'auto' | 'manual' | 'realtime' = 'auto') => {
    if (status !== 'connected' || !microphone.current) return false;
    microphone.current.getAudioTracks().forEach((track) => { track.enabled = true; });
    setInputState('listening');
    return true;
  }, [status]);

  const stopListening = useCallback(async () => {
    microphone.current?.getAudioTracks().forEach((track) => { track.enabled = false; });
    setInputState('idle');
  }, []);

  const triggerProactive = useCallback(async (cue = 'Start a natural conversation.') => {
    if (status !== 'connected') return false;
    const config = connectedConfig.current;
    if (!config) return false;
    return sendEvent({
      type: 'response.create',
      response: {
        output_modalities: ['audio'],
        instructions: `${config.systemPrompt}\n\n${proactiveCuePrompt(cue)}`,
      },
    });
  }, [sendEvent, status]);

  const interrupt = useCallback(() => {
    sendEvent({ type: 'response.cancel' });
    speaking.current = false;
    setAudioState(status === 'connected' ? 'ready' : 'idle');
    eventHandler.current({ type: 'tts', state: 'stop' });
  }, [sendEvent, status]);

  const setAudioEnabled = useCallback((enabled: boolean) => {
    audioEnabled.current = enabled;
    if (remoteAudio.current) remoteAudio.current.muted = !enabled;
  }, []);

  const unlockAudio = useCallback(async () => {
    if (remoteAudio.current?.srcObject) await remoteAudio.current.play();
  }, []);

  useEffect(() => disconnect, [disconnect]);

  return { status, error, audioState, inputState, connect, disconnect, sendText, sendContext, startListening, stopListening, triggerProactive, interrupt, unlockAudio, setAudioEnabled };
}
