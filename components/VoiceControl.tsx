'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { SpeechRecognitionLike } from '@/lib/speech';
import type { VoiceActionPayload } from '@/lib/voice-preview';

export const VOICE_REFRESH_EVENT = 'khaataa:refresh';
export const PENDING_REMINDER_KEY = 'khaataa:pendingReminder';

interface VoiceApiResult {
  requires_confirm: boolean;
  preview?: string;
  stock_warning?: string | null;
  pending_action?: VoiceActionPayload;
  speech?: string;
  navigate?: string;
  navigateQuery?: Record<string, string>;
  data?: { message?: string; customer_name?: string };
  error?: string;
}

export function VoiceControl() {
  const router = useRouter();
  const [supported, setSupported] = useState(true);
  const [listening, setListening] = useState(false);
  const [lastHeard, setLastHeard] = useState<string | null>(null);
  const [lastReply, setLastReply] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<VoiceActionPayload | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [stockWarning, setStockWarning] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    if (pendingPreview) return;
    if (!lastHeard && !lastReply) return;
    const timer = window.setTimeout(() => {
      setLastHeard(null);
      setLastReply(null);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [lastHeard, lastReply, pendingPreview]);

  const applyResult = useCallback(
    (data: VoiceApiResult) => {
      if (data.speech) setLastReply(data.speech);

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

      if ('speechSynthesis' in window && data.speech) {
        const utterance = new SpeechSynthesisUtterance(data.speech);
        window.speechSynthesis.speak(utterance);
      }
    },
    [router]
  );

  const clearPending = () => {
    setPendingAction(null);
    setPendingPreview(null);
    setStockWarning(null);
  };

  const handleConfirm = async () => {
    if (!pendingAction) return;
    setExecuting(true);
    try {
      const res = await fetch('/api/voice-command/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pendingAction),
      });
      const data = (await res.json()) as VoiceApiResult;
      if (!res.ok) {
        setLastReply(data.error ?? 'Could not complete that action.');
        clearPending();
        return;
      }
      clearPending();
      applyResult(data);
    } catch {
      setLastReply("Couldn't reach the server — check your connection.");
    } finally {
      setExecuting(false);
    }
  };

  useEffect(() => {
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) {
      setSupported(false);
      return;
    }
    const recognition = new Ctor();
    recognition.lang = 'en-PK';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = async (event) => {
      const transcript = event.results[0][0].transcript;
      setLastHeard(transcript);
      setLastReply(null);
      clearPending();

      try {
        const res = await fetch('/api/voice-command/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transcript }),
        });
        const data = (await res.json()) as VoiceApiResult;
        if (!res.ok) {
          setLastReply(data.error ?? 'Sorry, something went wrong.');
          return;
        }

        if (data.requires_confirm && data.pending_action) {
          setPendingAction(data.pending_action);
          setPendingPreview(data.preview ?? 'Confirm this action?');
          setStockWarning(data.stock_warning ?? null);
          setLastReply('Review below, then confirm or cancel.');
          return;
        }

        setLastReply(data.speech ?? data.preview ?? 'Done.');
        applyResult(data);
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
  }, [applyResult]);

  const toggleListening = () => {
    if (!recognitionRef.current) return;
    if (listening) {
      recognitionRef.current.stop();
      setListening(false);
    } else {
      setLastHeard(null);
      setLastReply(null);
      clearPending();
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
      {(lastHeard || lastReply || pendingPreview) && (
        <div className="voice-transcript-toast">
          {lastHeard && (
            <>
              <span className="label">You said</span>
              {lastHeard}
            </>
          )}
          {pendingPreview && (
            <div style={{ marginTop: 8 }}>
              <span className="label">Will do</span>
              {pendingPreview}
              {stockWarning && (
                <p style={{ margin: '8px 0 0', fontSize: 12.5, color: 'var(--brass)' }}>{stockWarning}</p>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button className="btn-primary" onClick={handleConfirm} disabled={executing}>
                  {executing ? 'Saving…' : 'Confirm'}
                </button>
                <button className="btn-secondary" onClick={clearPending} disabled={executing}>
                  Cancel
                </button>
              </div>
            </div>
          )}
          {lastReply && !pendingPreview && (
            <div style={{ marginTop: 8 }}>
              <span className="label">Khaataa AI</span>
              {lastReply}
            </div>
          )}
        </div>
      )}
      {!lastHeard && !lastReply && !pendingPreview && !listening && (
        <p className="voice-hint" aria-hidden>
          Try: &ldquo;Ali kitna baqi hai?&rdquo;
        </p>
      )}
      <button
        className={`voice-fab ${listening ? 'listening' : ''}`}
        onClick={toggleListening}
        aria-label={listening ? 'Stop listening' : 'Start voice command'}
        title="Try: 'add 50 cement bags', 'how much cement', 'find Ali', 'open khaataa', 'Ali paid 500'"
      >
        {listening ? '●' : '🎤'}
      </button>
    </>
  );
}
