'use client';

import { buildCustomerLedger, formatLedgerDate, formatRupees } from '@/lib/computed';
import type { Transaction } from '@/lib/types';

interface KhaataaLedgerModalProps {
  open: boolean;
  customerName: string;
  customerId: string;
  dueBalance: number;
  transactions: Transaction[];
  onClose: () => void;
}

export default function KhaataaLedgerModal({
  open,
  customerName,
  customerId,
  dueBalance,
  transactions,
  onClose,
}: KhaataaLedgerModalProps) {
  if (!open) return null;

  const entries = buildCustomerLedger(transactions, customerId);

  return (
    <div className="inv-modal-backdrop" onClick={onClose} role="presentation">
      <div className="inv-modal inv-modal-wide" onClick={(e) => e.stopPropagation()} role="dialog">
        <h2 className="inv-modal-title">Ledger — {customerName}</h2>
        <p className="inv-ledger-balance">
          Current due balance: <span className="figure">{formatRupees(Math.max(0, dueBalance))}</span>
        </p>

        {entries.length === 0 ? (
          <p className="empty-state" style={{ padding: '24px 0' }}>
            No udhaar or payment entries yet for this customer.
          </p>
        ) : (
          <div className="inv-table-wrap">
            <table className="inv-table">
              <thead>
                <tr>
                  <th>Date / time</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Description</th>
                  <th>Related</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((row) => (
                  <tr key={row.id}>
                    <td>{formatLedgerDate(row.created_at)}</td>
                    <td>{row.type}</td>
                    <td className="figure">{formatRupees(row.amount)}</td>
                    <td>{row.description ?? '—'}</td>
                    <td className="figure">{row.related_sale_id ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="inv-modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
