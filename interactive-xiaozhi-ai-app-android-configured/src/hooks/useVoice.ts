import { useCallback, useEffect, useRef, useState } from 'react';
import { SpeechRecognition as NativeRecognition } from '@capgo/capacitor-speech-recognition';
import { isNative } from '../lib/platform';
import { stopSpeech } from '../lib/speech';
import { isDesktop } from '../lib/desktop';

interface RecognitionEvent {
  results: { [key: number]: { [key: number]: { transcript: string }; isFinal: boolean }; length: number };
  resultIndex: number;
}

interface Recognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type VoiceWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};

interface VoiceOptions {
  continuous?: boolean;
  paused?: boolean;
}

const wait = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export function useVoice(onTranscript: (text: string) => void, onError: (message: string) => void, options: VoiceOptions = {}) {
  const continuous = !!options.continuous;
  const paused = !!options.paused;
  const [active, setActive] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const recognition = useRef<Recognition | null>(null);
  const nativeGeneration = useRef(0);
  const nativeActive = useRef(false);
  const browserRunning = useRef(false);
  const activeRef = useRef(false);
  const continuousRef = useRef(continuous);
  const pausedRef = useRef(paused);
  const manuallyStopped = useRef(false);
  const handlers = useRef({ onTranscript, onError });
  const cycleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const browserRestartTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const startBrowserCycleRef = useRef<() => void>(() => {});
  handlers.current = { onTranscript, onError };
  continuousRef.current = continuous;
  pausedRef.current = paused;

  const finishSession = useCallback(() => {
    activeRef.current = false;
    nativeActive.current = false;
    browserRunning.current = false;
    setActive(false);
    setListening(false);
    setInterim('');
    clearTimeout(cycleTimer.current);
    clearTimeout(browserRestartTimer.current);
  }, []);

  const stop = useCallback(() => {
    manuallyStopped.current = true;
    nativeGeneration.current += 1;
    activeRef.current = false;
    if (isNative) void NativeRecognition.forceStop({ timeout: 500 }).catch(() => {});
    recognition.current?.stop();
    finishSession();
  }, [finishSession]);

  const abort = useCallback(() => {
    manuallyStopped.current = true;
    nativeGeneration.current += 1;
    activeRef.current = false;
    if (isNative) void NativeRecognition.forceStop({ timeout: 0 }).catch(() => {});
    recognition.current?.abort();
    finishSession();
  }, [finishSession]);

  const startNative = useCallback(async () => {
    if (activeRef.current) return;
    activeRef.current = true;
    manuallyStopped.current = false;
    setActive(true);
    setInterim('');
    const generation = ++nativeGeneration.current;

    try {
      const { available } = await NativeRecognition.available();
      if (generation !== nativeGeneration.current || !activeRef.current) return;
      if (!available) throw new Error('No Android speech service is available. Enable Speech Services by Google, or use the chat box.');
      let permission = await NativeRecognition.checkPermissions();
      if (generation !== nativeGeneration.current || !activeRef.current) return;
      if (permission.speechRecognition !== 'granted') permission = await NativeRecognition.requestPermissions();
      if (generation !== nativeGeneration.current || !activeRef.current) return;
      if (permission.speechRecognition !== 'granted') throw new Error('Microphone permission is needed for voice. Allow it in Android Settings > Apps > Mori > Permissions, or type instead.');
      stopSpeech();

      while (generation === nativeGeneration.current && activeRef.current && !manuallyStopped.current) {
        if (pausedRef.current) {
          setListening(false);
          await wait(180);
          continue;
        }

        nativeActive.current = true;
        setListening(true);
        setInterim('');
        clearTimeout(cycleTimer.current);
        cycleTimer.current = setTimeout(() => {
          if (generation === nativeGeneration.current && nativeActive.current) {
            void NativeRecognition.forceStop({ timeout: 700 }).catch(() => {});
          }
        }, continuousRef.current ? 45000 : 30000);

        try {
          const { matches } = await NativeRecognition.start({ language: 'en-US', maxResults: 1, partialResults: false, popup: false });
          if (generation !== nativeGeneration.current || !activeRef.current) break;
          const text = matches?.[0]?.trim();
          if (text) {
            setListening(false);
            handlers.current.onTranscript(text);
          } else if (!continuousRef.current && !manuallyStopped.current && !pausedRef.current) {
            handlers.current.onError("I didn't catch that. Tap the microphone to try again.");
          }
        } catch (error) {
          if (generation !== nativeGeneration.current || !activeRef.current || manuallyStopped.current) break;
          if (!pausedRef.current) {
            const message = error instanceof Error ? error.message : 'Android voice recognition is unavailable. Please try again or type your message.';
            if (!continuousRef.current || !/no.?speech|timeout|aborted/i.test(message)) handlers.current.onError(message);
          }
        } finally {
          clearTimeout(cycleTimer.current);
          nativeActive.current = false;
          setListening(false);
          setInterim('');
        }

        if (!continuousRef.current) break;
        // Give React time to mark the conversation busy after a transcript. The
        // loop then waits while Lumi/Xiaozhi replies, preventing speaker audio
        // from being transcribed back into the microphone.
        await wait(350);
      }
    } catch (error) {
      if (generation === nativeGeneration.current && !manuallyStopped.current) {
        handlers.current.onError(error instanceof Error ? error.message : 'Android voice recognition is unavailable. Please try again or type your message.');
      }
    } finally {
      if (generation === nativeGeneration.current) finishSession();
    }
  }, [finishSession]);

  const startBrowserCycle = useCallback(() => {
    if (!activeRef.current || pausedRef.current || browserRunning.current) return;
    const browser = window as VoiceWindow;
    const RecognitionConstructor = browser.SpeechRecognition || browser.webkitSpeechRecognition;
    if (!RecognitionConstructor) {
      handlers.current.onError('Voice input is not supported in this browser. Try Chrome or Edge, or type a little hello instead.');
      finishSession();
      return;
    }
    if (!window.isSecureContext) {
      handlers.current.onError('Microphone access needs HTTPS or localhost. You can still type your message.');
      finishSession();
      return;
    }

    stopSpeech();
    setInterim('');
    const instance = new RecognitionConstructor();
    recognition.current = instance;
    browserRunning.current = true;
    instance.continuous = continuousRef.current;
    instance.interimResults = true;
    instance.lang = 'en-US';
    instance.onresult = (event) => {
      let preview = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal) {
          const text = result[0].transcript.trim();
          if (text) handlers.current.onTranscript(text);
          setInterim('');
          if (continuousRef.current) {
            // Stop this recognition cycle once a phrase is final. It will resume
            // automatically after the reply is finished.
            instance.stop();
          }
        } else preview += result[0].transcript;
      }
      setInterim(preview);
    };
    instance.onerror = ({ error }) => {
      browserRunning.current = false;
      setListening(false);
      clearTimeout(cycleTimer.current);
      if (error === 'aborted') return;
      if (continuousRef.current && (error === 'no-speech' || error === 'network')) return;
      handlers.current.onError(error === 'not-allowed' || error === 'service-not-allowed'
        ? 'Microphone permission was denied. Allow microphone access in your browser settings, or use the chat box.'
        : error === 'no-speech' ? "I didn't catch anything. Try the microphone again when you're ready."
          : 'Voice input is unavailable right now. Your typed conversation still works.');
    };
    instance.onend = () => {
      browserRunning.current = false;
      setListening(false);
      setInterim('');
      clearTimeout(cycleTimer.current);
      if (!activeRef.current || manuallyStopped.current) return;
      if (!continuousRef.current) {
        finishSession();
        return;
      }
      clearTimeout(browserRestartTimer.current);
      browserRestartTimer.current = setTimeout(() => startBrowserCycleRef.current(), pausedRef.current ? 400 : 250);
    };
    try {
      instance.start();
      setListening(true);
      cycleTimer.current = setTimeout(() => instance.stop(), continuousRef.current ? 45000 : 30000);
    } catch {
      browserRunning.current = false;
      if (!continuousRef.current) finishSession();
      handlers.current.onError('The microphone is already in use. Give it a moment and try again.');
    }
  }, [finishSession]);
  startBrowserCycleRef.current = startBrowserCycle;

  const start = useCallback(() => {
    if (activeRef.current) return;
    if (isDesktop) {
      handlers.current.onError('Desktop voice transcription is not configured. Use the text box to talk to Xiaozhi. Native Android voice input is still available.');
      return;
    }
    manuallyStopped.current = false;
    if (isNative) {
      void startNative();
      return;
    }
    activeRef.current = true;
    setActive(true);
    startBrowserCycleRef.current();
  }, [startNative]);

  useEffect(() => {
    pausedRef.current = paused;
    if (!activeRef.current || !continuousRef.current) return;
    if (paused) {
      if (isNative && nativeActive.current) void NativeRecognition.forceStop({ timeout: 0 }).catch(() => {});
      if (!isNative && browserRunning.current) recognition.current?.stop();
      setListening(false);
      return;
    }
    if (!isNative && !browserRunning.current) {
      clearTimeout(browserRestartTimer.current);
      browserRestartTimer.current = setTimeout(() => startBrowserCycleRef.current(), 180);
    }
    // The native session loop polls pausedRef and resumes itself.
  }, [paused]);

  useEffect(() => {
    continuousRef.current = continuous;
    if (!continuous && activeRef.current && !listening) stop();
  }, [continuous, listening, stop]);

  useEffect(() => () => {
    clearTimeout(cycleTimer.current);
    clearTimeout(browserRestartTimer.current);
    activeRef.current = false;
    manuallyStopped.current = true;
    nativeGeneration.current += 1;
    const wasNativeActive = nativeActive.current;
    nativeActive.current = false;
    recognition.current?.abort();
    if (isNative && wasNativeActive) void NativeRecognition.forceStop({ timeout: 0 }).catch(() => {});
  }, []);

  return { active, listening, interim, start, stop, abort };
}
