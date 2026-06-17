'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SpeechRecognitionLike } from '@/lib/speech';

export const VOICE_REFRESH_EVENT = 'khaataa:refresh';
export const PENDING_REMINDER_KEY = 'khaataa:pendingReminder';

export function VoiceControl() {
  const router = useRouter();
  const [supported, setSupported] = useState(true);
  const [listening, setListening] = useState(false);
  const [lastHeard, setLastHeard] = useState<string | null>(null);
  const [lastReply, setLastReply] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) {
      setSupported(false);
      return;
    }
    const recognition = new Ctor();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = async (event) => {
      const transcript = event.results[0][0].transcript;
      setLastHeard(transcript);
      setLastReply(null);

      try {
        const res = await fetch('/api/voice-command', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transcript }),
        });
        const data = await res.json();
        if (!res.ok) {
          setLastReply(data.error ?? "Sorry, something went wrong.");
          return;
        }
        setLastReply(data.speech ?? "Sorry, something went wrong.");

        if ('speechSynthesis' in window && data.speech) {
          const utterance = new SpeechSynthesisUtterance(data.speech);
          window.speechSynthesis.speak(utterance);
        }

        if (data.data?.message && data.data?.customer_name) {
          sessionStorage.setItem(
            PENDING_REMINDER_KEY,
            JSON.stringify({ customer_name: data.data.customer_name, message: data.data.message })
          );
        }

        window.dispatchEvent(new CustomEvent(VOICE_REFRESH_EVENT));

        if (data.navigate) {
          const params = new URLSearchParams(data.navigateQuery ?? {});
          const qs = params.toString();
          router.push(`/${data.navigate}${qs ? `?${qs}` : ''}`);
        }
      } catch {
        setLastReply("Couldn't reach the server — check your connection.");
      }
    };

    recognition.onerror = (event) => {
      setListening(false);
      const err = (event as Event & { error?: string }).error;
      if (err === 'not-allowed') {
        setLastReply('Microphone access denied — allow mic permission in your browser settings.');
      } else if (err === 'no-speech') {
        setLastReply("Didn't catch anything — try again.");
      }
    };
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
  }, [router]);

  const toggleListening = () => {
    if (!recognitionRef.current) return;
    if (listening) {
      recognitionRef.current.stop();
      setListening(false);
    } else {
      setLastHeard(null);
      setLastReply(null);
      recognitionRef.current.start();
      setListening(true);
    }
  };

  if (!supported) {
    return (
      <button
        className="voice-fab"
        style={{ opacity: 0.4, cursor: 'not-allowed' }}
        title="Voice control needs Chrome or Edge"
        disabled
      >
        🎤
      </button>
    );
  }

  return (
    <>
      {(lastHeard || lastReply) && (
        <div className="voice-transcript-toast">
          {lastHeard && (
            <>
              <span className="label">You said</span>
              {lastHeard}
            </>
          )}
          {lastReply && (
            <div style={{ marginTop: 8 }}>
              <span className="label">Khaataa AI</span>
              {lastReply}
            </div>
          )}
        </div>
      )}
      <button
        className={`voice-fab ${listening ? 'listening' : ''}`}
        onClick={toggleListening}
        aria-label={listening ? 'Stop listening' : 'Start voice command'}
        title="Try: 'Ali paid 500 rupees' or 'show me the khaataa'"
      >
        {listening ? '●' : '🎤'}
      </button>
    </>
  );
}
