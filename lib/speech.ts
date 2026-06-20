// Minimal shape of the Web Speech API we rely on — not all browsers ship
// full TypeScript types for this, so we declare just what we use, once,
// and import it everywhere else to avoid conflicting global declarations.

export interface SpeechRecognitionResultLike {
  transcript: string;
}

export interface SpeechRecognitionEventLike extends Event {
  // results[i] is a SpeechRecognitionResult (array-like of alternatives);
  // results[i][0] is the first/best alternative, which has `.transcript`.
  results: { 0: SpeechRecognitionResultLike }[];
}

export interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

/** BCP-47 tag for hackathon demo — English recognition and readout. */
export const VOICE_LANG = 'en-US';

export function pickEnglishVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => v.lang === VOICE_LANG) ??
    voices.find((v) => v.lang.startsWith('en') && v.localService) ??
    voices.find((v) => v.lang.startsWith('en')) ??
    null
  );
}

export function speakEnglishText(text: string): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = VOICE_LANG;
  const voice = pickEnglishVoice();
  if (voice) utterance.voice = voice;
  window.speechSynthesis.speak(utterance);
}
