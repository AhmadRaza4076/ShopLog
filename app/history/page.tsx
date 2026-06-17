'use client';

import { useEffect, useState, useCallback } from 'react';
import { StampBadge } from '@/components/StampBadge';
import { VOICE_REFRESH_EVENT } from '@/components/VoiceControl';
import { formatRupees, timeAgo } from '@/lib/computed';
import type { Transaction, TransactionType } from '@/lib/types';

const TYPE_LABEL: Record<Transaction['type'], string> = {
  sale: 'Sale',
  purchase: 'Stock purchase',
  payment: 'Payment received',
  credit_given: 'Credit given',
};

const SOURCE_LABEL: Record<Transaction['source'], string> = {
  typed: 'Typed',
  voice: 'Voice',
  photo: 'Photo',
  system: 'System',
};

type Filter = 'all' | TransactionType | 'credit';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'sale', label: 'Sales' },
  { id: 'purchase', label: 'Purchases' },
  { id: 'payment', label: 'Payments' },
  { id: 'credit', label: 'Credit' },
];

function matchesFilter(t: Transaction, filter: Filter): boolean {
  if (filter === 'all') return true;
  if (filter === 'credit') return t.is_credit && t.type !== 'payment';
  return t.type === filter;
}

export default function HistoryPage() {
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
    return <div className="page-surface"><p className="empty-state">Loading history…</p></div>;
  }

  const filtered = transactions.filter((t) => matchesFilter(t, filter));

  return (
    <div className="page-surface">
      <p className="page-eyebrow">Audit trail</p>
      <h1 className="page-title">Transaction history</h1>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: -16, marginBottom: 20 }}>
        Every entry keeps its original input alongside the structured result — nothing is a black box.
      </p>

      <div className="entry-bar" style={{ marginBottom: 20 }}>
        {FILTERS.map((f) => (
          <button
            key={f.id}
            className={`entry-mode-btn ${filter === f.id ? 'active' : ''}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <p style={{ fontWeight: 500, color: 'var(--ink)' }}>No transactions match this filter.</p>
        </div>
      ) : (
        <div className="ledger-rows">
          {filtered.map((t) => {
            const expanded = expandedId === t.id;
            return (
              <div key={t.id}>
                <div
                  className="ledger-row"
                  style={{ cursor: 'pointer' }}
                  onClick={() => setExpandedId(expanded ? null : t.id)}
                >
                  <div className="ledger-row-main">
                    <span className="ledger-row-title">
                      {TYPE_LABEL[t.type]}
                      {t.item_name ? ` — ${t.item_name}` : ''}
                      {t.customer_name ? ` · ${t.customer_name}` : ''}
                    </span>
                    <span className="ledger-row-sub">
                      {new Date(t.created_at).toLocaleString('en-PK')} · {SOURCE_LABEL[t.source]}
                      {expanded ? ' · tap to collapse' : ' · tap for raw input'}
                    </span>
                  </div>
                  <div className="ledger-row-amount">
                    <span className="figure">{formatRupees(t.total_amount)}</span>
                    {t.is_credit && t.type !== 'payment' ? (
                      <StampBadge variant="due">Due</StampBadge>
                    ) : t.type === 'payment' ? (
                      <StampBadge variant="paid">Paid</StampBadge>
                    ) : null}
                  </div>
                </div>
                {expanded && (
                  <div
                    style={{
                      margin: '0 0 8px 0',
                      padding: '12px 16px',
                      background: 'rgba(0,0,0,0.04)',
                      borderRadius: 6,
                      fontSize: 13.5,
                      lineHeight: 1.6,
                    }}
                  >
                    <span className="page-eyebrow">Original input</span>
                    <p style={{ margin: '6px 0 0', fontFamily: 'var(--font-mono, monospace)' }}>
                      {t.raw_input ?? '(No raw input — demo/system entry)'}
                    </p>
                    <span className="page-eyebrow" style={{ display: 'block', marginTop: 12 }}>Structured record</span>
                    <p style={{ margin: '6px 0 0', color: 'var(--ink-soft)' }}>
                      {t.type}
                      {t.quantity != null ? ` · qty ${t.quantity}` : ''}
                      {t.unit_price != null ? ` · unit ${formatRupees(Number(t.unit_price))}` : ''}
                      {t.is_credit ? ' · on credit' : ''}
                      {' · '}{timeAgo(t.created_at)}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
