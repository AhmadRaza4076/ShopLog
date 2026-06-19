'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-fetch';

interface KhaataaPaymentModalProps {
  open: boolean;
  customerName: string;
  defaultAmount: number;
  onClose: () => void;
  onSaved: () => void;
}

export default function KhaataaPaymentModal({
  open,
  customerName,
  defaultAmount,
  onClose,
  onSaved,
}: KhaataaPaymentModalProps) {
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setAmount(defaultAmount > 0 ? String(Math.round(defaultAmount)) : '');
    setError(null);
  }, [open, defaultAmount]);

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
      const res = await apiFetch('/api/record-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_name: customerName, amount: parsed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Payment failed.');
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="inv-modal-backdrop" onClick={onClose} role="presentation">
      <div className="inv-modal" onClick={(e) => e.stopPropagation()} role="dialog">
        <h2 className="inv-modal-title">Record payment</h2>
        <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: -8 }}>
          Payment from {customerName}
        </p>
        <form onSubmit={handleSubmit} className="inv-modal-form">
          <label className="inv-modal-label">
            Amount received
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
          {error && <p className="inv-modal-error">{error}</p>}
          <div className="inv-modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Saving…' : 'Record payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
