'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { StampBadge } from '@/components/StampBadge';
import { CreditScoreCard } from '@/components/CreditScoreCard';
import { VOICE_REFRESH_EVENT, PENDING_REMINDER_KEY } from '@/components/VoiceControl';
import { computeCustomerBalances, formatRupees, timeAgo, type CustomerBalance } from '@/lib/computed';
import type { CreditScoreResult, Transaction } from '@/lib/types';

function KhaataaContent() {
  const searchParams = useSearchParams();
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);
  const [selected, setSelected] = useState<CustomerBalance | null>(null);
  const [score, setScore] = useState<CreditScoreResult | null>(null);
  const [scoreLoading, setScoreLoading] = useState(false);
  const [reminder, setReminder] = useState<string | null>(null);
  const [reminderLoading, setReminderLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/transactions');
    const data = await res.json();
    setTransactions(data.transactions ?? []);
  }, []);

  const selectCustomer = useCallback(async (customer: CustomerBalance, pendingReminder?: string) => {
    setSelected(customer);
    setScore(null);
    setReminder(pendingReminder ?? null);
    setCopied(false);
    setPaymentError(null);
    setPaymentAmount(String(Math.round(customer.balance)));
    setScoreLoading(true);
    try {
      const res = await fetch(`/api/credit-score?customer=${encodeURIComponent(customer.name)}`);
      const data = await res.json();
      setScore(data.result ?? null);
    } finally {
      setScoreLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    window.addEventListener(VOICE_REFRESH_EVENT, load);
    return () => window.removeEventListener(VOICE_REFRESH_EVENT, load);
  }, [load]);

  useEffect(() => {
    if (!transactions) return;

    const balances = Object.values(computeCustomerBalances(transactions));
    const customerParam = searchParams.get('customer');

    const pendingRaw = sessionStorage.getItem(PENDING_REMINDER_KEY);
    if (pendingRaw) {
      sessionStorage.removeItem(PENDING_REMINDER_KEY);
      try {
        const pending = JSON.parse(pendingRaw) as { customer_name: string; message: string };
        const match = balances.find((c) => c.name.toLowerCase() === pending.customer_name.toLowerCase());
        if (match) {
          selectCustomer(match, pending.message);
          return;
        }
      } catch {
        // ignore malformed storage
      }
    }

    if (customerParam) {
      const match = balances.find((c) => c.name.toLowerCase() === customerParam.toLowerCase());
      if (match) selectCustomer(match);
    }
  }, [transactions, searchParams, selectCustomer]);

  const requestReminder = async () => {
    if (!selected) return;
    setReminderLoading(true);
    setReminder(null);
    setCopied(false);
    try {
      const res = await fetch('/api/reminder-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_name: selected.name }),
      });
      const data = await res.json();
      setReminder(data.message ?? data.error ?? 'Could not draft a reminder.');
    } finally {
      setReminderLoading(false);
    }
  };

  const recordPayment = async () => {
    if (!selected) return;
    const amount = Number(paymentAmount);
    if (!amount || amount <= 0) {
      setPaymentError('Enter a valid amount.');
      return;
    }
    setPaymentLoading(true);
    setPaymentError(null);
    try {
      const res = await fetch('/api/record-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_name: selected.name, amount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not record payment.');
      await load();
      window.dispatchEvent(new CustomEvent(VOICE_REFRESH_EVENT));
      setReminder(null);
      if (selected) {
        const refreshed = await fetch('/api/transactions');
        const refreshedData = await refreshed.json();
        const txs = refreshedData.transactions ?? [];
        const balances = Object.values(computeCustomerBalances(txs));
        const updated = balances.find((c) => c.customer_id === selected.customer_id);
        if (updated) await selectCustomer(updated);
      }
    } catch (e) {
      setPaymentError(e instanceof Error ? e.message : 'Could not record payment.');
    } finally {
      setPaymentLoading(false);
    }
  };

  const copyReminder = () => {
    if (!reminder) return;
    navigator.clipboard.writeText(reminder);
    setCopied(true);
  };

  if (!transactions) {
    return <div className="page-surface"><p className="empty-state">Loading the khaataa…</p></div>;
  }

  const balances = Object.values(computeCustomerBalances(transactions)).sort((a, b) => b.balance - a.balance);

  const selectedBalance = selected
    ? balances.find((c) => c.customer_id === selected.customer_id) ?? selected
    : null;

  return (
    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
      <div className="page-surface" style={{ flex: '2 1 380px' }}>
        <p className="page-eyebrow">Customer credit</p>
        <h1 className="page-title">Khaataa</h1>

        {balances.length === 0 ? (
          <div className="empty-state">
            <p style={{ fontWeight: 500, color: 'var(--ink)' }}>No customers yet.</p>
            <p>Customers appear here automatically once you record a sale or credit for them.</p>
          </div>
        ) : (
          <div className="ledger-rows">
            {balances.map((c) => (
              <div
                className="ledger-row"
                key={c.customer_id}
                style={{ cursor: 'pointer', background: selected?.customer_id === c.customer_id ? 'rgba(0,0,0,0.04)' : 'transparent' }}
                onClick={() => selectCustomer(c)}
              >
                <div className="ledger-row-main">
                  <span className="ledger-row-title">{c.name}</span>
                  <span className="ledger-row-sub">Last activity {timeAgo(c.lastActivityAt)}</span>
                </div>
                <div className="ledger-row-amount">
                  <span className="figure">{formatRupees(Math.abs(c.balance))}</span>
                  {c.balance > 0 ? <StampBadge variant="due">Due</StampBadge> : <StampBadge variant="paid">Settled</StampBadge>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="page-surface" style={{ flex: '1 1 300px' }}>
        {!selectedBalance ? (
          <div className="empty-state">
            <p style={{ fontWeight: 500, color: 'var(--ink)' }}>Select a customer</p>
            <p>Tap anyone in the list to see their credit-readiness score and draft a reminder.</p>
          </div>
        ) : (
          <>
            <p className="page-eyebrow">{selectedBalance.name}</p>
            <h1 className="page-title" style={{ fontSize: 22 }}>
              {formatRupees(Math.abs(selectedBalance.balance))} {selectedBalance.balance > 0 ? 'owed' : 'settled'}
            </h1>

            {scoreLoading && <p className="empty-state">Calculating score…</p>}
            {score && <CreditScoreCard result={score} />}

            {selectedBalance.balance > 0 && (
              <>
                <div style={{ marginTop: 24, borderTop: '1px solid var(--rule-line)', paddingTop: 20 }}>
                  <p className="page-eyebrow">Record payment</p>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <input
                      type="number"
                      className="entry-textarea"
                      style={{ minHeight: 'auto', padding: '8px 12px', flex: 1 }}
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      min={1}
                    />
                    <button className="btn-primary" onClick={recordPayment} disabled={paymentLoading}>
                      {paymentLoading ? 'Saving…' : 'Record payment'}
                    </button>
                  </div>
                  {paymentError && (
                    <p style={{ color: 'var(--stamp-red)', fontSize: 13, marginTop: 8 }}>{paymentError}</p>
                  )}
                </div>

                <div style={{ marginTop: 24, borderTop: '1px solid var(--rule-line)', paddingTop: 20 }}>
                  {!reminder ? (
                    <button className="btn-primary" onClick={requestReminder} disabled={reminderLoading}>
                      {reminderLoading ? 'Drafting…' : 'Draft payment reminder'}
                    </button>
                  ) : (
                    <div>
                      <p className="page-eyebrow">Ready to send</p>
                      <p style={{ fontSize: 14, lineHeight: 1.6, background: 'rgba(0,0,0,0.04)', padding: 14, borderRadius: 6 }}>
                        {reminder}
                      </p>
                      <button className="btn-secondary" onClick={copyReminder}>
                        {copied ? 'Copied ✓' : 'Copy message'}
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function KhaataaPage() {
  return (
    <Suspense fallback={<div className="page-surface"><p className="empty-state">Loading the khaataa…</p></div>}>
      <KhaataaContent />
    </Suspense>
  );
}
