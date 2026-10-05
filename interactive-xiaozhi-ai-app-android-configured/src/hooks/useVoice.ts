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

export function useVoice(onTranscript: (text: string) => void, onError: (message: string) => void) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const recognition = useRef<Recognition | null>(null);
  const nativeGeneration = useRef(0);
  const nativeActive = useRef(false);
  const manuallyStopped = useRef(false);
  const handlers = useRef({ onTranscript, onError });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  handlers.current = { onTranscript, onError };

  const stop = useCallback(() => {
    manuallyStopped.current = true;
    if (isNative) {
      void NativeRecognition.forceStop({ timeout: 1500 }).catch(() => {});
    }
    recognition.current?.stop();
    setListening(false);
    clearTimeout(timer.current);
  }, []);

  const abort = useCallback(() => {
    nativeGeneration.current += 1;
    manuallyStopped.current = true;
    nativeActive.current = false;
    if (isNative) void NativeRecognition.forceStop({ timeout: 0 }).catch(() => {});
    recognition.current?.abort();
    clearTimeout(timer.current);
    setListening(false);
    setInterim('');
  }, []);

  const startNative = useCallback(async () => {
    if (nativeActive.current) return;
    nativeActive.current = true;
    manuallyStopped.current = false;
    const current = ++nativeGeneration.current;
    try {
      const { available } = await NativeRecognition.available();
      if (current !== nativeGeneration.current) return;
      if (!available) throw new Error('No Android speech service is available. Enable Speech Services by Google, or use the chat box.');
      let permission = await NativeRecognition.checkPermissions();
      if (current !== nativeGeneration.current) return;
      if (permission.speechRecognition !== 'granted') permission = await NativeRecognition.requestPermissions();
      if (current !== nativeGeneration.current) return;
      if (permission.speechRecognition !== 'granted') throw new Error('Microphone permission is needed for voice. Allow it in Android Settings > Apps > Mori > Permissions, or type instead.');
      stopSpeech();
      setInterim('');
      setListening(true);
      timer.current = setTimeout(() => {
        if (current === nativeGeneration.current) {
          void NativeRecognition.forceStop({ timeout: 1000 }).catch(() => {});
          setListening(false);
        }
      }, 30000);
      // The final-result promise avoids sending incomplete recognition guesses to Xiaozhi.
      const { matches } = await NativeRecognition.start({ language: 'en-US', maxResults: 1, partialResults: false, popup: false });
      if (current !== nativeGeneration.current) return;
      const text = matches?.[0]?.trim();
      if (text) handlers.current.onTranscript(text);
      else if (!manuallyStopped.current) handlers.current.onError("I didn't catch that. Tap the microphone to try again.");
    } catch (error) {
      if (current === nativeGeneration.current && !manuallyStopped.current) {
        handlers.current.onError(error instanceof Error ? error.message : 'Android voice recognition is unavailable. Please try again or type your message.');
      }
    } finally {
      if (current === nativeGeneration.current) {
        clearTimeout(timer.current);
        nativeActive.current = false;
        setListening(false);
        setInterim('');
      }
    }
  }, []);

  const start = useCallback(() => {
    if (isDesktop) {
      handlers.current.onError('Desktop voice transcription is not configured. Use the text box to talk to Xiaozhi. Native Android voice input is still available.');
      return;
    }
    if (isNative) { void startNative(); return; }
    const browser = window as VoiceWindow;
    const RecognitionConstructor = browser.SpeechRecognition || browser.webkitSpeechRecognition;
    if (!RecognitionConstructor) {
      handlers.current.onError('Voice input is not supported in this browser. Try Chrome or Edge, or type a little hello instead.');
      return;
    }
    if (!window.isSecureContext) {
      handlers.current.onError('Microphone access needs HTTPS or localhost. You can still type your message.');
      return;
    }
    stopSpeech();
    setInterim('');
    const instance = new RecognitionConstructor();
    recognition.current = instance;
    instance.continuous = false;
    instance.interimResults = true;
    instance.lang = 'en-US';
    instance.onresult = (event) => {
      let preview = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal) {
          handlers.current.onTranscript(result[0].transcript);
          setInterim('');
        } else preview += result[0].transcript;
      }
      setInterim(preview);
    };
    instance.onerror = ({ error }) => {
      setListening(false);
      clearTimeout(timer.current);
      if (error === 'aborted') return;
      handlers.current.onError(error === 'not-allowed' || error === 'service-not-allowed'
        ? 'Microphone permission was denied. Allow microphone access in your browser settings, or use the chat box.'
        : error === 'no-speech' ? "I didn't catch anything. Try the microphone again when you're ready."
          : 'Voice input is unavailable right now. Your typed conversation still works.');
    };
    instance.onend = () => { setListening(false); setInterim(''); clearTimeout(timer.current); };
    try {
      instance.start();
      setListening(true);
      timer.current = setTimeout(() => instance.stop(), 30000);
    } catch {
      handlers.current.onError('The microphone is already in use. Give it a moment and try again.');
    }
  }, [startNative]);

  useEffect(() => () => {
    clearTimeout(timer.current);
    nativeGeneration.current += 1;
    const wasActive = nativeActive.current;
    nativeActive.current = false;
    recognition.current?.abort();
    if (isNative && wasActive) void NativeRecognition.forceStop({ timeout: 0 }).catch(() => {});
  }, []);

  return { listening, interim, start, stop, abort };
}