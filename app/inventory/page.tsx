'use client';

import { useEffect, useState, useCallback } from 'react';
import { VOICE_REFRESH_EVENT } from '@/components/VoiceControl';
import { computeInventory, formatRupees, timeAgo } from '@/lib/computed';
import type { Transaction } from '@/lib/types';

export default function InventoryPage() {
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/transactions');
    const data = await res.json();
    setTransactions(data.transactions ?? []);
  }, []);

  useEffect(() => {
    load();
    window.addEventListener(VOICE_REFRESH_EVENT, load);
    return () => window.removeEventListener(VOICE_REFRESH_EVENT, load);
  }, [load]);

  if (!transactions) {
    return <div className="page-surface"><p className="empty-state">Loading stock levels…</p></div>;
  }

  const inventory = computeInventory(transactions);

  return (
    <div className="page-surface">
      <p className="page-eyebrow">Stock on hand</p>
      <h1 className="page-title">Inventory</h1>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: -16, marginBottom: 24 }}>
        Computed automatically from every purchase and sale — nothing here is entered by hand.
      </p>

      {inventory.length === 0 ? (
        <div className="empty-state">
          <p style={{ fontWeight: 500, color: 'var(--ink)' }}>No items tracked yet.</p>
          <p>Record a purchase or sale that includes an item name and quantity to see it here.</p>
        </div>
      ) : (
        <div className="ledger-rows">
          {inventory.map((row) => (
            <div className="ledger-row" key={row.item_name}>
              <div className="ledger-row-main">
                <span className="ledger-row-title">{row.item_name}</span>
                <span className="ledger-row-sub">
                  Last movement {timeAgo(row.last_movement_at)}
                  {row.last_unit_price != null ? ` · last price ${formatRupees(row.last_unit_price)}` : ''}
                </span>
              </div>
              <div className="ledger-row-amount">
                <span className="figure" style={{ color: row.quantity_on_hand < 0 ? 'var(--stamp-red)' : 'var(--ink)' }}>
                  {row.quantity_on_hand} on hand
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
