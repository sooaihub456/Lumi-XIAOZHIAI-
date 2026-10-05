import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { isNative } from './platform';

let generation = 0;
let finishCurrent: (() => void) | null = null;
let cancelNative: (() => void) | null = null;
let nativeStop: Promise<void> = Promise.resolve();

export function stopSpeech() {
  finishCurrent?.();
  cancelNative?.();
  generation += 1;
  finishCurrent = null;
  cancelNative = null;
  if (isNative) nativeStop = TextToSpeech.stop().catch(() => {});
  else window.speechSynthesis?.cancel();
}

export async function speakText(text: string, onStart: () => void, onEnd: () => void) {
  stopSpeech();
  const current = generation;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    if (generation === current) {
      finishCurrent = null;
      onEnd();
    }
  };
  finishCurrent = finish;

  if (isNative) {
    await nativeStop;
    if (generation !== current) return;
    onStart();
    const cancellation = new Promise<void>((resolve) => { cancelNative = resolve; });
    try {
      await Promise.race([
        TextToSpeech.speak({ text, lang: 'en-US', rate: 0.93, pitch: 1.1, volume: 0.8, queueStrategy: 0 }),
        cancellation,
      ]);
    } catch (error) {
      if (generation === current) throw error;
    } finally {
      if (generation === current) cancelNative = null;
      finish();
    }
    return;
  }

  if (!('speechSynthesis' in window)) {
    finish();
    throw new Error('Speech playback is unavailable in this browser.');
  }
  const utterance = new SpeechSynthesisUtterance(text);
  const voices = window.speechSynthesis.getVoices();
  utterance.voice = voices.find((voice) => /Samantha|Google UK English Female|Aria|Jenny/.test(voice.name))
    || voices.find((voice) => voice.lang.startsWith('en')) || null;
  utterance.rate = 0.93;
  utterance.pitch = 1.1;
  utterance.volume = 0.8;
  utterance.onstart = () => { if (generation === current) onStart(); };
  utterance.onend = finish;
  utterance.onerror = finish;
  window.speechSynthesis.speak(utterance);
}