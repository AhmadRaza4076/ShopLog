'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { StampBadge } from '@/components/StampBadge';
import { VOICE_REFRESH_EVENT } from '@/components/VoiceControl';
import { summarizeDashboard, formatRupees, timeAgo } from '@/lib/computed';
import type { Transaction } from '@/lib/types';

const TYPE_LABEL: Record<Transaction['type'], string> = {
  sale: 'Sale',
  purchase: 'Stock purchase',
  payment: 'Payment received',
  credit_given: 'Credit given',
};

export default function DashboardPage() {
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/transactions');
      const data = await res.json();
      if (!res.ok) {
        setSetupError(data.error ?? 'Could not connect to the database.');
        setTransactions([]);
        return;
      }
      setSetupError(null);
      setTransactions(data.transactions ?? []);
    } catch {
      setSetupError('Could not reach the server. Is npm run dev still running?');
      setTransactions([]);
    }
  }, []);

  useEffect(() => {
    load();
    window.addEventListener(VOICE_REFRESH_EVENT, load);
    return () => window.removeEventListener(VOICE_REFRESH_EVENT, load);
  }, [load]);

  const handleSeed = async () => {
    if (transactions && transactions.length > 0) {
      const ok = window.confirm(
        'This replaces all demo (system) transactions with a fresh set. Your own entries are kept.'
      );
      if (!ok) return;
    }
    setSeeding(true);
    await fetch('/api/seed', { method: 'POST' });
    await load();
    setSeeding(false);
  };

  if (!transactions) {
    return <div className="page-surface"><p className="empty-state">Loading the ledger…</p></div>;
  }

  const summary = summarizeDashboard(transactions);
  const recent = transactions.slice(0, 8);
  const hasSystemData = transactions.some((t) => t.source === 'system');

  return (
    <div className="page-surface">
      <p className="page-eyebrow">Today</p>
      <h1 className="page-title">Dashboard</h1>

      {setupError && (
        <div
          style={{
            marginBottom: 24,
            padding: 16,
            borderRadius: 6,
            border: '1px solid var(--stamp-red)',
            background: 'rgba(180, 40, 40, 0.06)',
            fontSize: 14,
            lineHeight: 1.6,
          }}
        >
          <p style={{ fontWeight: 600, color: 'var(--stamp-red)', margin: '0 0 8px' }}>Setup required</p>
          <p style={{ margin: 0 }}>{setupError}</p>
          <ol style={{ margin: '12px 0 0', paddingLeft: 20 }}>
            <li>Create a free database at <strong>neon.tech</strong></li>
            <li>Run <code>scripts/schema.sql</code> in Neon&apos;s SQL editor</li>
            <li>Copy your connection string into <code>.env.local</code> as <code>DATABASE_URL</code></li>
            <li>Add your hackathon API key as <code>ANTHROPIC_API_KEY</code></li>
            <li>If organizers gave a gateway URL, add it as <code>ANTHROPIC_BASE_URL</code></li>
            <li>Stop the dev server (Ctrl+C) and run <code>npm run dev</code> again</li>
          </ol>
        </div>
      )}

      {!setupError && (
        <>
      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-label">Today&rsquo;s sales</span>
          <span className="stat-value">{formatRupees(summary.todaySalesTotal)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Entries today</span>
          <span className="stat-value">{summary.todayTransactionCount}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Total owed to you</span>
          <span className="stat-value">{formatRupees(summary.totalOwedAcrossAllCustomers)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Items tracked</span>
          <span className="stat-value">{summary.distinctItemsTracked}</span>
        </div>
      </div>

      {transactions.length === 0 ? (
        <div className="empty-state">
          <p style={{ fontWeight: 500, color: 'var(--ink)' }}>The ledger is empty.</p>
          <p>Add your first entry, or load realistic demo data to see the app in action.</p>
          <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 8 }}>
            Use Chrome or Edge for full voice control.
          </p>
          <div style={{ marginTop: 16 }}>
            <button className="btn-primary" onClick={handleSeed} disabled={seeding}>
              {seeding ? 'Loading demo data…' : 'Load demo data'}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, flexWrap: 'wrap', gap: 12 }}>
            <p className="page-eyebrow" style={{ margin: 0 }}>Recent activity</p>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <Link href="/history" style={{ fontSize: 13, color: 'var(--brass)' }}>
                View full history →
              </Link>
              {hasSystemData && (
                <button className="btn-secondary" onClick={handleSeed} disabled={seeding} style={{ fontSize: 12, padding: '6px 12px' }}>
                  {seeding ? 'Resetting…' : 'Reset demo data'}
                </button>
              )}
            </div>
          </div>
          <div className="ledger-rows">
            {recent.map((t) => (
              <div className="ledger-row" key={t.id}>
                <div className="ledger-row-main">
                  <span className="ledger-row-title">
                    {TYPE_LABEL[t.type]}
                    {t.item_name ? ` — ${t.item_name}` : ''}
                    {t.customer_name ? ` · ${t.customer_name}` : ''}
                  </span>
                  <span className="ledger-row-sub">
                    {timeAgo(t.created_at)} · via {t.source}
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
            ))}
          </div>
        </>
      )}
        </>
      )}
    </div>
  );
}
