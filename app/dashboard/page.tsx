'use client';

import { useState } from 'react';
import Link from 'next/link';
import { StampBadge } from '@/components/StampBadge';
import { summarizeDashboard, formatRupees, timeAgo } from '@/lib/computed';
import { useTransactions } from '@/lib/hooks/use-transactions';
import type { Transaction } from '@/lib/types';

const TYPE_LABEL: Record<Transaction['type'], string> = {
  sale: 'Sale',
  purchase: 'Stock purchase',
  payment: 'Payment received',
  credit_given: 'Credit given',
};

export default function DashboardPage() {
  const { transactions, error: setupError, reload: load } = useTransactions();
  const [seeding, setSeeding] = useState(false);

  const handleSeed = async () => {
    let replace = false;
    if (transactions && transactions.length > 0) {
      const ok = window.confirm(
        'This replaces all demo (system) transactions with a fresh set from the supplier price lists. Your own entries are kept.'
      );
      if (!ok) return;
      replace = true;
    }
    setSeeding(true);
    await fetch('/api/seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ replace }),
    });
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
        <div className="stat-card stat-card-highlight stat-card-hero">
          <span className="stat-label">Today&rsquo;s profit</span>
          <span className="stat-value">{formatRupees(summary.todayGrossProfit)}</span>
          {summary.todaySalesMissingCost > 0 && (
            <span style={{ fontSize: 11.5, color: 'var(--brass)', lineHeight: 1.4 }}>
              {summary.todaySalesMissingCost} sale{summary.todaySalesMissingCost === 1 ? '' : 's'} missing buy price — profit is partial
            </span>
          )}
        </div>
        <div className="stat-card stat-card-hero">
          <span className="stat-label">Total owed to you</span>
          <span className="stat-value">{formatRupees(summary.totalOwedAcrossAllCustomers)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Today&rsquo;s sales</span>
          <span className="stat-value">{formatRupees(summary.todaySalesTotal)}</span>
        </div>
      </div>

      {transactions.length === 0 ? (
        <div className="empty-state">
          <p style={{ fontWeight: 500, color: 'var(--ink)' }}>The ledger is empty.</p>
          <p>Load sample stock from Appollo, Phoenix, and Kiwi price lists, or add your own entries.</p>
          <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 8 }}>
            Use Chrome or Edge for full voice control.
          </p>
          <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
            <button className="btn-primary" onClick={handleSeed} disabled={seeding}>
              {seeding ? 'Loading sample data…' : 'Load sample data'}
            </button>
            <Link href="/entry" className="btn-secondary" style={{ textDecoration: 'none', fontSize: 13 }}>
              Add entry
            </Link>
            <Link href="/entry?mode=bulk" className="btn-secondary" style={{ textDecoration: 'none', fontSize: 13 }}>
              Import stock list
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, flexWrap: 'wrap', gap: 12 }}>
            <p className="page-eyebrow" style={{ margin: 0 }}>Recent activity</p>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <Link href="/history" style={{ fontSize: 13, color: 'var(--brass)' }}>
                View full history →
              </Link>
              {hasSystemData && (
                <button className="btn-secondary" onClick={handleSeed} disabled={seeding} style={{ fontSize: 12, padding: '6px 12px' }}>
                  {seeding ? 'Resetting…' : 'Reset sample data'}
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
