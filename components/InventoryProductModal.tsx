'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-fetch';
import { formatPriceInput, formatQtyInput } from '@/lib/computed';
import type { InventoryRow, ShopItemInput } from '@/lib/types';

export type ProductModalMode = 'add' | 'edit';

interface InventoryProductModalProps {
  mode: ProductModalMode;
  item: InventoryRow | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

function parseNum(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export default function InventoryProductModal({
  mode,
  item,
  open,
  onClose,
  onSaved,
}: InventoryProductModalProps) {
  const [name, setName] = useState('');
  const [qtyOnHand, setQtyOnHand] = useState('');
  const [buy, setBuy] = useState('');
  const [sell, setSell] = useState('');
  const [lowStock, setLowStock] = useState('5');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (mode === 'edit' && item) {
      setName(item.item_name);
      setQtyOnHand(formatQtyInput(item.quantity_on_hand));
      setBuy(formatPriceInput(item.buy_price));
      setSell(formatPriceInput(item.sell_price));
      setLowStock(formatQtyInput(item.low_stock_at));
    } else {
      setName('');
      setQtyOnHand('0');
      setBuy('');
      setSell('');
      setLowStock('5');
    }
  }, [open, mode, item]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Product name is required.');
      return;
    }

    const qtyParsed = parseNum(qtyOnHand);
    if (qtyParsed == null || qtyParsed < 0) {
      setError('Quantity on hand must be zero or greater.');
      return;
    }

    const payload: ShopItemInput = {
      item_name: name.trim(),
      buy_price: parseNum(buy),
      sell_price: parseNum(sell),
      low_stock_at: parseNum(lowStock) ?? 5,
      quantity_on_hand: qtyParsed,
    };

    setLoading(true);
    setError(null);
    try {
      const url =
        mode === 'add'
          ? '/api/inventory'
          : `/api/inventory/${encodeURIComponent(item!.item_name)}`;
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
      <div
        className="inv-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="inv-modal-title"
      >
        <h2 id="inv-modal-title" className="inv-modal-title">
          {mode === 'add' ? 'Add product' : 'Edit product'}
        </h2>

        <form onSubmit={handleSubmit} className="inv-modal-form">
          <label className="inv-modal-label">
            Product name
            <input
              className="inv-modal-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Rice"
              autoFocus
            />
          </label>

          <label className="inv-modal-label">
            Quantity on hand
            <input
              className="inv-modal-input"
              type="number"
              step="1"
              min="0"
              value={qtyOnHand}
              onChange={(e) => setQtyOnHand(e.target.value)}
            />
          </label>

          <div className="inv-modal-row">
            <label className="inv-modal-label">
              Buying price
              <input
                className="inv-modal-input"
                type="number"
                step="1"
                min="0"
                value={buy}
                onChange={(e) => setBuy(e.target.value)}
                placeholder="0"
              />
            </label>
            <label className="inv-modal-label">
              Selling price
              <input
                className="inv-modal-input"
                type="number"
                step="1"
                min="0"
                value={sell}
                onChange={(e) => setSell(e.target.value)}
                placeholder="0"
              />
            </label>
          </div>

          <label className="inv-modal-label">
            Low-stock threshold
            <input
              className="inv-modal-input"
              type="number"
              step="1"
              min="0"
              value={lowStock}
              onChange={(e) => setLowStock(e.target.value)}
            />
          </label>

          <p className="inv-modal-tip">
            Tip: low-stock alerts appear when quantity is at or below the threshold.
          </p>

          {error && <p className="inv-modal-error">{error}</p>}

          <div className="inv-modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Saving…' : mode === 'add' ? 'Add product' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
