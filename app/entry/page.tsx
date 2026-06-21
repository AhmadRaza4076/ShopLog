'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { VOICE_REFRESH_EVENT } from '@/components/VoiceControl';
import { apiFetch } from '@/lib/api-fetch';
import type { EntryIntent, InventorySheetRow, ParsedTransaction, Transaction } from '@/lib/types';
import { formatRupees } from '@/lib/computed';
import { resizeAndEncode } from '@/lib/photo-utils';
import { VOICE_LANG, type SpeechRecognitionLike } from '@/lib/speech';
import { MAX_UPLOAD_BYTES } from '@/lib/upload-limits';

type InputMode = 'type' | 'voice' | 'photo';
type BulkInputMode = 'type' | 'photo' | 'document';

interface SavedResult {
  parsed: ParsedTransaction;
  transaction: Transaction;
  stock_warning?: string | null;
}

const SOURCE_LABEL: Record<Transaction['source'], string> = {
  typed: '⌨️ Typed',
  voice: '🎙️ Voice',
  photo: '📷 Photo',
  system: '⚙️ System',
};

const INTENTS: { id: EntryIntent; label: string }[] = [
  { id: 'sale', label: 'Sale' },
  { id: 'purchase', label: 'Stock in' },
  { id: 'payment', label: 'Payment' },
  { id: 'credit_given', label: 'Credit' },
];

const PLACEHOLDERS: Record<EntryIntent, string> = {
  sale: 'e.g. sold 2 cement bags to Ali, 500 owed on credit',
  purchase: 'e.g. bought 50 cement bags from supplier at 950 each',
  payment: 'e.g. Ali paid 1000 rupees',
  credit_given: 'e.g. gave 3 rice bags to Bilal on udhaar, 7500 total',
};

function outcomeMessage(parsed: ParsedTransaction): string {
  if (parsed.type === 'purchase' && parsed.item_name && parsed.quantity != null) {
    return `Inventory +${parsed.quantity} ${parsed.item_name}`;
  }
  if (parsed.type === 'sale' && parsed.item_name && parsed.quantity != null) {
    return `Inventory −${parsed.quantity} ${parsed.item_name}`;
  }
  if ((parsed.is_credit || parsed.type === 'credit_given') && parsed.customer_name) {
    return `Added to ${parsed.customer_name}'s khaataa`;
  }
  if (parsed.type === 'payment' && parsed.customer_name) {
    return `Reduced ${parsed.customer_name}'s khaataa`;
  }
  return 'Saved to the ledger';
}

function dispatchRefresh() {
  window.dispatchEvent(new CustomEvent(VOICE_REFRESH_EVENT));
}

function EntryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isBulk = searchParams.get('mode') === 'bulk';

  const [intent, setIntent] = useState<EntryIntent>('sale');
  const [inputMode, setInputMode] = useState<InputMode>('type');
  const [bulkInputMode, setBulkInputMode] = useState<BulkInputMode>('type');
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [photoMediaType, setPhotoMediaType] = useState<'image/jpeg' | 'image/png' | 'image/webp'>('image/jpeg');
  const [documentBase64, setDocumentBase64] = useState<string | null>(null);
  const [documentMimeType, setDocumentMimeType] = useState<string | null>(null);
  const [documentFileName, setDocumentFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SavedResult | null>(null);
  const [bulkPreview, setBulkPreview] = useState<InventorySheetRow[] | null>(null);
  const [bulkImported, setBulkImported] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const intentParam = searchParams.get('intent');
    if (intentParam === 'purchase' || intentParam === 'sale' || intentParam === 'payment' || intentParam === 'credit_given') {
      setIntent(intentParam);
    }
  }, [searchParams]);

  const reset = () => {
    setText('');
    setPhotoPreview(null);
    setPhotoBase64(null);
    setPhotoMediaType('image/jpeg');
    setDocumentBase64(null);
    setDocumentMimeType(null);
    setDocumentFileName(null);
    setResult(null);
    setBulkPreview(null);
    setBulkImported(null);
    setError(null);
  };

  const startVoiceDictation = () => {
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) {
      setError('Voice dictation needs Chrome or Edge.');
      return;
    }
    let transcript = '';
    const recognition = new Ctor() as SpeechRecognitionLike;
    recognition.lang = VOICE_LANG;
    recognition.onresult = (event) => {
      transcript = event.results[0][0].transcript;
      setText(transcript);
    };
    recognition.onend = () => {
      setListening(false);
      if (transcript.trim()) {
        void submitTextEntry(transcript, 'voice');
      }
    };
    setListening(true);
    recognition.start();
  };

  const submitTextEntry = async (entryText: string, source: 'typed' | 'voice') => {
    if (!entryText.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await apiFetch('/api/parse-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: entryText,
          source,
          intent,
        }),
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

  const handleSubmitText = async () => {
    await submitTextEntry(text, inputMode === 'voice' ? 'voice' : 'typed');
  };

  const handlePhotoSelect = async (file: File) => {
    setError(null);
    if (file.size > MAX_UPLOAD_BYTES) {
      setError('Photo is too large — maximum size is 5 MB.');
      return;
    }
    try {
      const base64 = await resizeAndEncode(file);
      setPhotoMediaType('image/jpeg');
      setPhotoPreview(`data:image/jpeg;base64,${base64}`);
      setPhotoBase64(base64);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not process photo.');
      setPhotoPreview(null);
      setPhotoBase64(null);
    }
  };

  const handleSubmitPhoto = async () => {
    if (!photoBase64) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await apiFetch('/api/parse-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: photoBase64, mediaType: photoMediaType, intent }),
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

  const handleDocumentSelect = async (file: File) => {
    setError(null);
    const mime = file.type || '';
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (!allowed.includes(mime)) {
      setError('Use PDF or Word (.docx) only. Legacy .doc files are not supported.');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError('Document is too large — maximum size is 5 MB.');
      return;
    }
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      bytes.forEach((b) => {
        binary += String.fromCharCode(b);
      });
      setDocumentBase64(btoa(binary));
      setDocumentMimeType(mime);
      setDocumentFileName(file.name);
      setPhotoPreview(null);
      setPhotoBase64(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read document.');
      setDocumentBase64(null);
      setDocumentMimeType(null);
      setDocumentFileName(null);
    }
  };

  const handleBulkParse = async () => {
    setLoading(true);
    setError(null);
    setBulkPreview(null);
    setBulkImported(null);
    try {
      let payload: Record<string, string>;
      if (bulkInputMode === 'photo' && photoBase64) {
        payload = { image: photoBase64, mediaType: photoMediaType };
      } else if (bulkInputMode === 'document' && documentBase64 && documentMimeType) {
        payload = { document: documentBase64, documentMimeType };
      } else if (bulkInputMode === 'type' && text.trim()) {
        payload = { text };
      } else {
        setError('Type a list, upload a photo, or choose a PDF/Word file first.');
        setLoading(false);
        return;
      }
      const res = await apiFetch('/api/parse-inventory-sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Could not parse list.');
      const data = await res.json();
      if (!data.rows?.length) throw new Error('No items found — try clearer text or a sharper photo.');
      setBulkPreview(data.rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const handleBulkConfirm = async () => {
    if (!bulkPreview?.length) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/import-inventory-sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: bulkPreview,
          source: bulkInputMode === 'photo' ? 'photo' : 'typed',
          raw_input: text || documentFileName || '[Bulk inventory import]',
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Import failed.');
      const data = await res.json();
      setBulkImported(data.imported);
      setBulkPreview(null);
      setText('');
      setPhotoPreview(null);
      setPhotoBase64(null);
      setDocumentBase64(null);
      setDocumentMimeType(null);
      setDocumentFileName(null);
      dispatchRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-surface">
      <p className="page-eyebrow">New entry</p>
      <h1 className="page-title">{isBulk ? 'Import stock list' : 'Add entry'}</h1>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: -16, marginBottom: 20 }}>
        {isBulk
          ? 'Paste, photograph, or upload a PDF/Word stock list — all items import as stock purchases.'
          : 'Record sales, stock-in, payments, or credit. Stock-in updates inventory automatically.'}
      </p>

      {!isBulk && (
        <div className="entry-bar" style={{ marginBottom: 16 }}>
          {INTENTS.map((i) => (
            <button
              key={i.id}
              className={`entry-mode-btn ${intent === i.id ? 'active' : ''}`}
              onClick={() => { setIntent(i.id); reset(); }}
            >
              {i.label}
            </button>
          ))}
        </div>
      )}

      {isBulk ? (
        <>
          <div className="entry-bar" style={{ marginBottom: 16 }}>
            <button
              className={`entry-mode-btn ${bulkInputMode === 'type' ? 'active' : ''}`}
              onClick={() => { setBulkInputMode('type'); reset(); }}
            >
              ⌨️ Paste list
            </button>
            <button
              className={`entry-mode-btn ${bulkInputMode === 'photo' ? 'active' : ''}`}
              onClick={() => { setBulkInputMode('photo'); reset(); }}
            >
              📷 Photo of list
            </button>
            <button
              className={`entry-mode-btn ${bulkInputMode === 'document' ? 'active' : ''}`}
              onClick={() => { setBulkInputMode('document'); reset(); }}
            >
              📄 PDF / Word
            </button>
          </div>

          {bulkInputMode === 'type' && (
            <textarea
              className="entry-textarea"
              placeholder={'Cement (bag), 120, 950\nRice (50kg bag), 10, 7200\n...'}
              value={text}
              onChange={(e) => setText(e.target.value)}
              style={{ minHeight: 160 }}
            />
          )}

          {bulkInputMode === 'photo' && (
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
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photoPreview}
                    alt="Inventory list preview"
                    style={{ maxWidth: '100%', maxHeight: 280, borderRadius: 6, border: '1px solid var(--rule-line)' }}
                  />
                  <button className="btn-secondary" style={{ marginTop: 10 }} onClick={() => fileInputRef.current?.click()}>
                    Retake
                  </button>
                </>
              ) : (
                <button className="btn-secondary" onClick={() => fileInputRef.current?.click()}>
                  📷 Take or upload photo
                </button>
              )}
            </div>
          )}

          {bulkInputMode === 'document' && (
            <div>
              <input
                ref={documentInputRef}
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleDocumentSelect(file);
                }}
              />
              {documentFileName ? (
                <div>
                  <p style={{ fontSize: 14, margin: '0 0 10px', color: 'var(--ink)' }}>
                    Selected: <strong>{documentFileName}</strong>
                  </p>
                  <button className="btn-secondary" onClick={() => documentInputRef.current?.click()}>
                    Choose another file
                  </button>
                </div>
              ) : (
                <button className="btn-secondary" onClick={() => documentInputRef.current?.click()}>
                  📄 Upload PDF or Word (.docx)
                </button>
              )}
              <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 10 }}>
                Legacy .doc is not supported. Scanned PDFs with no text — use Photo of list instead.
              </p>
            </div>
          )}

          {!bulkPreview && (
            <button
              className="btn-primary"
              style={{ marginTop: 12 }}
              onClick={handleBulkParse}
              disabled={
                loading ||
                (bulkInputMode === 'type' && !text.trim()) ||
                (bulkInputMode === 'photo' && !photoBase64) ||
                (bulkInputMode === 'document' && !documentBase64)
              }
            >
              {loading ? 'Reading list…' : 'Preview items'}
            </button>
          )}

          {bulkPreview && (
            <div style={{ marginTop: 16 }}>
              <p className="page-eyebrow">Will import {bulkPreview.length} items</p>
              <div className="ledger-rows">
                {bulkPreview.map((row, idx) => (
                  <div className="ledger-row" key={`${row.item_name}-${idx}`}>
                    <div className="ledger-row-main">
                      <span className="ledger-row-title">{row.item_name}</span>
                      <span className="ledger-row-sub">
                        Qty {row.quantity}
                        {row.unit_price != null ? ` · ${formatRupees(row.unit_price)} each` : ''}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                <button className="btn-primary" onClick={handleBulkConfirm} disabled={loading}>
                  {loading ? 'Importing…' : 'Confirm import'}
                </button>
                <button className="btn-secondary" onClick={() => setBulkPreview(null)} disabled={loading}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {bulkImported != null && (
            <div className="stat-card" style={{ marginTop: 20 }}>
              <span className="stat-label">Stock imported</span>
              <p style={{ margin: '8px 0 0', color: 'var(--paper)', fontSize: 14 }}>
                {bulkImported} purchase{bulkImported === 1 ? '' : 's'} recorded — inventory updated.
              </p>
              <Link href="/inventory" style={{ display: 'inline-block', marginTop: 12, fontSize: 13, color: 'var(--brass)' }}>
                View inventory →
              </Link>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="entry-bar">
            <button
              className={`entry-mode-btn ${inputMode === 'type' ? 'active' : ''}`}
              onClick={() => { setInputMode('type'); reset(); }}
            >
              ⌨️ Type
            </button>
            <button
              className={`entry-mode-btn ${inputMode === 'voice' ? 'active' : ''}`}
              onClick={() => { setInputMode('voice'); reset(); }}
            >
              🎙️ Speak
            </button>
            <button
              className={`entry-mode-btn ${inputMode === 'photo' ? 'active' : ''}`}
              onClick={() => { setInputMode('photo'); reset(); }}
            >
              📷 Photo
            </button>
          </div>

          {(inputMode === 'type' || inputMode === 'voice') && (
            <div>
              <textarea
                className="entry-textarea"
                placeholder={PLACEHOLDERS[intent]}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                {inputMode === 'voice' && (
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

          {inputMode === 'photo' && (
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

          {result && (
            <div className="stat-card" style={{ marginTop: 20 }}>
              <span className="stat-label">
                {outcomeMessage(result.parsed)} · {SOURCE_LABEL[result.transaction.source]}
              </span>
              <p style={{ margin: '8px 0 0', color: 'var(--paper)', fontSize: 14, lineHeight: 1.6 }}>
                {result.parsed.type === 'sale' ? 'Sale' : result.parsed.type === 'purchase' ? 'Stock in' : result.parsed.type === 'payment' ? 'Payment' : 'Credit given'}
                {result.parsed.item_name ? ` — ${result.parsed.item_name}` : ''}
                {result.parsed.customer_name ? ` · ${result.parsed.customer_name}` : ''}
                {' · '}
                <span className="figure">{formatRupees(result.parsed.total_amount)}</span>
                {result.parsed.confidence !== 'high' && (
                  <span style={{ color: 'var(--brass)' }}> (confidence: {result.parsed.confidence})</span>
                )}
              </p>
              {result.stock_warning && (
                <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--brass)', lineHeight: 1.5 }}>
                  {result.stock_warning}
                </p>
              )}
              <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
                <Link href="/dashboard" style={{ fontSize: 13, color: 'var(--brass)' }}>
                  Dashboard →
                </Link>
                {result.parsed.type === 'purchase' && (
                  <Link href="/inventory" style={{ fontSize: 13, color: 'var(--brass)' }}>
                    Inventory →
                  </Link>
                )}
                {(result.parsed.is_credit || result.parsed.type === 'payment') && result.parsed.customer_name && (
                  <Link href={`/khaataa?customer=${encodeURIComponent(result.parsed.customer_name)}`} style={{ fontSize: 13, color: 'var(--brass)' }}>
                    Credit →
                  </Link>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {error && (
        <p style={{ color: 'var(--stamp-red)', fontSize: 13.5, marginTop: 16 }}>{error}</p>
      )}

      {!isBulk && (
        <p style={{ marginTop: 24, fontSize: 13, color: 'var(--ink-soft)' }}>
          Importing many items at once?{' '}
          <button
            type="button"
            onClick={() => router.push('/entry?mode=bulk')}
            style={{ background: 'none', border: 'none', color: 'var(--brass)', cursor: 'pointer', padding: 0, font: 'inherit' }}
          >
            Import stock list →
          </button>
        </p>
      )}
    </div>
  );
}

export default function EntryPage() {
  return (
    <Suspense fallback={<div className="page-surface"><p className="empty-state">Loading…</p></div>}>
      <EntryContent />
    </Suspense>
  );
}
