'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { VOICE_REFRESH_EVENT } from '@/components/VoiceControl';
import type { ParsedTransaction, Transaction } from '@/lib/types';
import { formatRupees } from '@/lib/computed';
import type { SpeechRecognitionLike } from '@/lib/speech';

type Mode = 'type' | 'voice' | 'photo';

interface SavedResult {
  parsed: ParsedTransaction;
  transaction: Transaction;
}

const SOURCE_LABEL: Record<Transaction['source'], string> = {
  typed: '⌨️ Typed',
  voice: '🎙️ Voice',
  photo: '📷 Photo',
  system: '⚙️ System',
};

function dispatchRefresh() {
  window.dispatchEvent(new CustomEvent(VOICE_REFRESH_EVENT));
}

export default function EntryPage() {
  const [mode, setMode] = useState<Mode>('type');
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [photoMediaType, setPhotoMediaType] = useState<'image/jpeg' | 'image/png' | 'image/webp'>('image/jpeg');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SavedResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setText('');
    setPhotoPreview(null);
    setPhotoBase64(null);
    setPhotoMediaType('image/jpeg');
    setResult(null);
    setError(null);
  };

  const startVoiceDictation = () => {
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) {
      setError('Voice dictation needs Chrome or Edge.');
      return;
    }
    const recognition = new Ctor() as SpeechRecognitionLike;
    recognition.lang = 'en-US';
    recognition.onresult = (event) => {
      setText(event.results[0][0].transcript);
    };
    recognition.onend = () => setListening(false);
    setListening(true);
    recognition.start();
  };

  const handleSubmitText = async () => {
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/parse-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, source: mode === 'voice' ? 'voice' : 'typed' }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Something went wrong.');
      const data = await res.json();
      setResult(data);
      setText('');
      dispatchRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoSelect = (file: File) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'] as const;
    const mediaType = allowed.includes(file.type as typeof allowed[number])
      ? (file.type as typeof allowed[number])
      : 'image/jpeg';
    setPhotoMediaType(mediaType);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setPhotoPreview(dataUrl);
      setPhotoBase64(dataUrl.split(',')[1]);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmitPhoto = async () => {
    if (!photoBase64) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/parse-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: photoBase64, mediaType: photoMediaType }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Something went wrong.');
      const data = await res.json();
      setResult(data);
      setPhotoPreview(null);
      setPhotoBase64(null);
      dispatchRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-surface">
      <p className="page-eyebrow">New entry</p>
      <h1 className="page-title">Add to the ledger</h1>

      <div className="entry-bar">
        <button
          className={`entry-mode-btn ${mode === 'type' ? 'active' : ''}`}
          onClick={() => { setMode('type'); reset(); }}
        >
          ⌨️ Type
        </button>
        <button
          className={`entry-mode-btn ${mode === 'voice' ? 'active' : ''}`}
          onClick={() => { setMode('voice'); reset(); }}
        >
          🎙️ Speak
        </button>
        <button
          className={`entry-mode-btn ${mode === 'photo' ? 'active' : ''}`}
          onClick={() => { setMode('photo'); reset(); }}
        >
          📷 Photo
        </button>
      </div>

      {(mode === 'type' || mode === 'voice') && (
        <div>
          <textarea
            className="entry-textarea"
            placeholder={
              mode === 'voice'
                ? 'Press the mic, then speak — e.g. "sold 2 bags cement to Ali, 500 owed"'
                : 'e.g. sold 2 bags cement to Ali, 500 owed'
            }
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            {mode === 'voice' && (
              <button className="btn-secondary" onClick={startVoiceDictation} disabled={listening}>
                {listening ? 'Listening…' : '🎙️ Start speaking'}
              </button>
            )}
            <button className="btn-primary" onClick={handleSubmitText} disabled={loading || !text.trim()}>
              {loading ? 'Reading it…' : 'Add entry'}
            </button>
          </div>
        </div>
      )}

      {mode === 'photo' && (
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handlePhotoSelect(file);
            }}
          />
          {photoPreview ? (
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoPreview}
                alt="Receipt preview"
                style={{ maxWidth: '100%', maxHeight: 280, borderRadius: 6, border: '1px solid var(--rule-line)' }}
              />
              <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                <button className="btn-secondary" onClick={() => fileInputRef.current?.click()}>
                  Retake
                </button>
                <button className="btn-primary" onClick={handleSubmitPhoto} disabled={loading}>
                  {loading ? 'Reading it…' : 'Parse receipt'}
                </button>
              </div>
            </div>
          ) : (
            <button className="btn-secondary" onClick={() => fileInputRef.current?.click()}>
              📷 Take or upload a photo
            </button>
          )}
        </div>
      )}

      {error && (
        <p style={{ color: 'var(--stamp-red)', fontSize: 13.5, marginTop: 16 }}>{error}</p>
      )}

      {result && (
        <div className="stat-card" style={{ marginTop: 20 }}>
          <span className="stat-label">
            Saved to the ledger · {SOURCE_LABEL[result.transaction.source]}
          </span>
          <p style={{ margin: '8px 0 0', color: 'var(--paper)', fontSize: 14, lineHeight: 1.6 }}>
            {result.parsed.type === 'sale' ? 'Sale' : result.parsed.type === 'purchase' ? 'Purchase' : result.parsed.type === 'payment' ? 'Payment' : 'Credit given'}
            {result.parsed.item_name ? ` — ${result.parsed.item_name}` : ''}
            {result.parsed.customer_name ? ` · ${result.parsed.customer_name}` : ''}
            {' · '}
            <span className="figure">{formatRupees(result.parsed.total_amount)}</span>
            {result.parsed.confidence !== 'high' && (
              <span style={{ color: 'var(--brass)' }}> (confidence: {result.parsed.confidence} — worth double-checking)</span>
            )}
          </p>
          <Link href="/dashboard" style={{ display: 'inline-block', marginTop: 12, fontSize: 13, color: 'var(--brass)' }}>
            View on dashboard →
          </Link>
        </div>
      )}
    </div>
  );
}
