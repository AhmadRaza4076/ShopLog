'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-fetch';

interface KhaataaUdhaarModalProps {
  open: boolean;
  customerName: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function KhaataaUdhaarModal({
  open,
  customerName,
  onClose,
  onSaved,
}: KhaataaUdhaarModalProps) {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setAmount('');
    setDescription('');
    setError(null);
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = Number(amount);
    if (!parsed || parsed <= 0) {
      setError('Enter a valid amount.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/khaataa/udhaar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: customerName,
          amount: parsed,
          description: description.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not record udhaar.');
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record udhaar.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="inv-modal-backdrop" onClick={onClose} role="presentation">
      <div className="inv-modal" onClick={(e) => e.stopPropagation()} role="dialog">
        <h2 className="inv-modal-title">Record manual udhaar</h2>
        <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: -8 }}>
          Add credit for {customerName}
        </p>
        <form onSubmit={handleSubmit} className="inv-modal-form">
          <label className="inv-modal-label">
            Amount
            <input
              className="inv-modal-input"
              type="number"
              step="1"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
          </label>
          <label className="inv-modal-label">
            Description (optional)
            <input
              className="inv-modal-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. goods on credit"
            />
          </label>
          {error && <p className="inv-modal-error">{error}</p>}
          <div className="inv-modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Saving…' : 'Record udhaar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
