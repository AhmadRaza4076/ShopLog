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
