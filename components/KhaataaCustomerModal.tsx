'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-fetch';
import type { CustomerInput, CustomerRecord } from '@/lib/types';

export type CustomerModalMode = 'add' | 'edit';

interface KhaataaCustomerModalProps {
  mode: CustomerModalMode;
  customer: CustomerRecord | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export default function KhaataaCustomerModal({
  mode,
  customer,
  open,
  onClose,
  onSaved,
}: KhaataaCustomerModalProps) {
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (mode === 'edit' && customer) {
      setName(customer.name);
      setContact(customer.phone ?? '');
      setNotes(customer.notes ?? '');
    } else {
      setName('');
      setContact('');
      setNotes('');
    }
  }, [open, mode, customer]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Customer name is required.');
      return;
    }

    const payload: CustomerInput = {
      name: name.trim(),
      phone: contact.trim() || null,
      notes: notes.trim() || null,
    };

    setLoading(true);
    setError(null);
    try {
      const url = mode === 'add' ? '/api/customers' : `/api/customers/${customer!.id}`;
      const res = await apiFetch(url, {
        method: mode === 'add' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Save failed.');
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="inv-modal-backdrop" onClick={onClose} role="presentation">
      <div className="inv-modal" onClick={(e) => e.stopPropagation()} role="dialog">
        <h2 className="inv-modal-title">{mode === 'add' ? 'Add customer' : 'Edit customer'}</h2>
        <form onSubmit={handleSubmit} className="inv-modal-form">
          <label className="inv-modal-label">
            Customer name
            <input
              className="inv-modal-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </label>
          <label className="inv-modal-label">
            Contact (phone / address)
            <input
              className="inv-modal-input"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="e.g. 0347…"
            />
          </label>
          <label className="inv-modal-label">
            Notes
            <textarea
              className="inv-modal-input inv-modal-textarea"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes about this customer…"
              rows={3}
            />
          </label>
          {error && <p className="inv-modal-error">{error}</p>}
          <div className="inv-modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Saving…' : mode === 'add' ? 'Add customer' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
