'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api-fetch';
import { formatPriceInput, formatRupees, stockWarningForParsed } from '@/lib/computed';
import type { CustomerRecord, InventoryRow, SaleInput, Transaction } from '@/lib/types';

interface RecordSaleModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

interface LineDraft {
  key: string;
  item_name: string;
  quantity: string;
  unit_price: string;
}

function parseNum(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function emptyLine(): LineDraft {
  return { key: crypto.randomUUID(), item_name: '', quantity: '1', unit_price: '' };
}

export default function RecordSaleModal({ open, onClose, onSaved }: RecordSaleModalProps) {
  const [payment, setPayment] = useState<'cash' | 'credit'>('cash');
  const [customerName, setCustomerName] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stockWarning, setStockWarning] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPayment('cash');
    setCustomerName('');
    setNotes('');
    setLines([emptyLine()]);
    setSelectedKeys(new Set());
    setError(null);
    setStockWarning(null);

    Promise.all([fetch('/api/customers'), fetch('/api/inventory'), fetch('/api/transactions')]).then(
      async ([cRes, iRes, tRes]) => {
        const cData = await cRes.json();
        const iData = await iRes.json();
        const tData = await tRes.json();
        setCustomers(cData.customers ?? []);
        setInventory(iData.items ?? []);
        setTransactions(tData.transactions ?? []);
      }
    );
  }, [open]);

  const inventoryByName = useMemo(() => {
    const map = new Map<string, InventoryRow>();
    for (const row of inventory) map.set(row.item_name, row);
    return map;
  }, [inventory]);

  const saleTotal = useMemo(() => {
    return lines.reduce((sum, line) => {
      const qty = parseNum(line.quantity);
      const price = parseNum(line.unit_price);
      if (qty == null || qty <= 0) return sum;
      if (price != null) return sum + price * qty;
      return sum + qty;
    }, 0);
  }, [lines]);

  useEffect(() => {
    if (!open) return;
    const warnings: string[] = [];
    for (const line of lines) {
      const qty = parseNum(line.quantity);
      if (!line.item_name.trim() || qty == null || qty <= 0) continue;
      const warning = stockWarningForParsed(transactions, {
        type: 'sale',
        item_name: line.item_name.trim(),
        quantity: qty,
      });
      if (warning) warnings.push(warning);
    }
    setStockWarning(warnings.length ? warnings.join(' ') : null);
  }, [lines, transactions, open]);

  if (!open) return null;

  const updateLine = (key: string, patch: Partial<LineDraft>) => {
    setLines((prev) =>
      prev.map((line) => {
        if (line.key !== key) return line;
        const next = { ...line, ...patch };
        if (patch.item_name != null) {
          const inv = inventoryByName.get(patch.item_name);
          if (inv?.sell_price != null) {
            next.unit_price = formatPriceInput(inv.sell_price);
          }
        }
        return next;
      })
    );
  };

  const toggleSelect = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const removeSelected = () => {
    if (selectedKeys.size === 0) return;
    setLines((prev) => {
      const remaining = prev.filter((l) => !selectedKeys.has(l.key));
      return remaining.length > 0 ? remaining : [emptyLine()];
    });
    setSelectedKeys(new Set());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (payment === 'credit' && !customerName.trim()) {
      setError('Customer is required for credit sales.');
      return;
    }

    const payloadLines = lines
      .map((line) => {
        const qty = parseNum(line.quantity);
        if (!line.item_name.trim() || qty == null || qty <= 0) return null;
        return {
          item_name: line.item_name.trim(),
          quantity: qty,
          unit_price: parseNum(line.unit_price),
        };
      })
      .filter(Boolean) as SaleInput['lines'];

    if (payloadLines.length === 0) {
      setError('Add at least one product with quantity.');
      return;
    }

    const payload: SaleInput = {
      payment,
      customer_name: customerName.trim() || null,
      notes: notes.trim() || null,
      lines: payloadLines,
    };

    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not record sale.');
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record sale.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="inv-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="inv-modal inv-modal-wide"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="record-sale-title"
      >
        <h2 id="record-sale-title" className="inv-modal-title">
          Record new sale
        </h2>

        <form onSubmit={handleSubmit} className="inv-modal-form">
          <div className="inv-modal-row">
            <label className="inv-modal-label">
              Payment method
              <select
                className="inv-modal-input"
                value={payment}
                onChange={(e) => setPayment(e.target.value as 'cash' | 'credit')}
              >
                <option value="cash">Cash</option>
                <option value="credit">Credit</option>
              </select>
            </label>
            <label className="inv-modal-label">
              Customer (required for credit)
              <select
                className="inv-modal-input"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              >
                <option value="">— None —</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink-soft)' }}>Line items</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn-secondary" style={{ fontSize: 12, padding: '6px 10px' }} onClick={() => setLines((p) => [...p, emptyLine()])}>
                  Add line
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ fontSize: 12, padding: '6px 10px' }}
                  disabled={selectedKeys.size === 0}
                  onClick={removeSelected}
                >
                  Remove selected
                </button>
              </div>
            </div>
            <div className="inv-table-wrap">
              <table className="inv-table">
                <thead>
                  <tr>
                    <th style={{ width: 32 }} />
                    <th>Product</th>
                    <th>Qty</th>
                    <th>Unit selling price</th>
                    <th>Line total</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => {
                    const qty = parseNum(line.quantity);
                    const price = parseNum(line.unit_price);
                    const lineTotal =
                      qty != null && qty > 0
                        ? price != null
                          ? price * qty
                          : qty
                        : null;
                    return (
                      <tr key={line.key}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedKeys.has(line.key)}
                            onChange={() => toggleSelect(line.key)}
                            aria-label="Select line"
                          />
                        </td>
                        <td>
                          <select
                            className="inv-modal-input"
                            style={{ width: '100%', minWidth: 140 }}
                            value={line.item_name}
                            onChange={(e) => updateLine(line.key, { item_name: e.target.value })}
                          >
                            <option value="">Select product…</option>
                            {inventory.map((item) => (
                              <option key={item.item_name} value={item.item_name}>
                                {item.item_name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input
                            className="inv-modal-input"
                            type="number"
                            step="1"
                            min="0"
                            value={line.quantity}
                            onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                            style={{ width: 80 }}
                          />
                        </td>
                        <td>
                          <input
                            className="inv-modal-input"
                            type="number"
                            step="1"
                            min="0"
                            value={line.unit_price}
                            onChange={(e) => updateLine(line.key, { unit_price: e.target.value })}
                            placeholder="0"
                            style={{ width: 100 }}
                          />
                        </td>
                        <td className="figure">{lineTotal != null ? formatRupees(lineTotal) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <label className="inv-modal-label">
            Notes (optional)
            <textarea
              className="inv-modal-input inv-modal-textarea"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. delivered to shop front"
            />
          </label>

          <p style={{ margin: 0, fontSize: 15, fontWeight: 600, textAlign: 'right' }}>
            Sale total: {formatRupees(saleTotal)}
          </p>

          {stockWarning && (
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--brass)' }}>{stockWarning}</p>
          )}

          {error && <p className="inv-modal-error">{error}</p>}

          <div className="inv-modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Saving…' : 'OK'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
