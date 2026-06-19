'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import KhaataaCustomerModal from '@/components/KhaataaCustomerModal';
import KhaataaLedgerModal from '@/components/KhaataaLedgerModal';
import KhaataaPaymentModal from '@/components/KhaataaPaymentModal';
import KhaataaUdhaarModal from '@/components/KhaataaUdhaarModal';
import { CreditScoreCard } from '@/components/CreditScoreCard';
import { StampBadge } from '@/components/StampBadge';
import { VOICE_REFRESH_EVENT, PENDING_REMINDER_KEY } from '@/components/VoiceControl';
import { apiFetch } from '@/lib/api-fetch';
import { computeCustomerBalances, formatRupees } from '@/lib/computed';
import { computeCreditScore } from '@/lib/scoring';
import { whatsAppSendUrl } from '@/lib/whatsapp';
import type { CustomerRecord, Transaction } from '@/lib/types';

interface CustomerRow extends CustomerRecord {
  balance: number;
}

function KhaataaContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const urlQuery = searchParams.get('q')?.trim().toLowerCase() ?? '';

  const [transactions, setTransactions] = useState<Transaction[] | null>(null);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [customerModal, setCustomerModal] = useState<'add' | 'edit' | null>(null);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [udhaarOpen, setUdhaarOpen] = useState(false);
  const [reminder, setReminder] = useState<string | null>(null);
  const [reminderLoading, setReminderLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [txnRes, custRes] = await Promise.all([
        fetch('/api/transactions'),
        fetch('/api/customers'),
      ]);
      const txnData = await txnRes.json();
      const custData = await custRes.json();
      if (!txnRes.ok) {
        throw new Error(txnData.error ?? 'Could not load transactions.');
      }
      if (!custRes.ok) {
        throw new Error(custData.error ?? 'Could not load customers.');
      }
      setLoadError(null);
      setTransactions(txnData.transactions ?? []);
      setCustomers(custData.customers ?? []);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Something went wrong.');
      setTransactions([]);
      setCustomers([]);
    }
  }, []);

  useEffect(() => {
    load();
    window.addEventListener(VOICE_REFRESH_EVENT, load);
    return () => window.removeEventListener(VOICE_REFRESH_EVENT, load);
  }, [load]);

  useEffect(() => {
    if (urlQuery) setSearch(urlQuery);
  }, [urlQuery]);

  const rows: CustomerRow[] = useMemo(() => {
    if (!transactions) return [];
    const balanceById = computeCustomerBalances(transactions);
    return customers
      .map((c) => ({
        ...c,
        balance: balanceById[c.id]?.balance ?? 0,
      }))
      .sort((a, b) => b.balance - a.balance);
  }, [customers, transactions]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.phone?.toLowerCase().includes(q) ?? false)
    );
  }, [rows, search]);

  const selected = rows.find((r) => r.id === selectedId) ?? null;
  const selectedScore = useMemo(() => {
    if (!selected || !transactions) return null;
    return computeCreditScore(selected.id, transactions);
  }, [selected, transactions]);

  useEffect(() => {
    if (!transactions || rows.length === 0) return;

    const customerParam = searchParams.get('customer');
    const pendingRaw = sessionStorage.getItem(PENDING_REMINDER_KEY);
    if (pendingRaw) {
      sessionStorage.removeItem(PENDING_REMINDER_KEY);
      try {
        const pending = JSON.parse(pendingRaw) as { customer_name: string; message: string };
        const match = rows.find((c) => c.name.toLowerCase() === pending.customer_name.toLowerCase());
        if (match) {
          setSelectedId(match.id);
          setReminder(pending.message);
          return;
        }
      } catch {
        // ignore
      }
    }

    if (customerParam) {
      const match =
        rows.find((c) => c.name.toLowerCase() === customerParam.toLowerCase()) ??
        rows.find((c) => c.name.toLowerCase().includes(customerParam.toLowerCase()));
      if (match) setSelectedId(match.id);
    }
  }, [transactions, searchParams, rows]);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    const params = new URLSearchParams(searchParams.toString());
    if (value.trim()) params.set('q', value.trim());
    else params.delete('q');
    const customer = searchParams.get('customer');
    if (customer) params.set('customer', customer);
    router.replace(params.size ? `/khaataa?${params}` : '/khaataa');
  };

  const handleDelete = async () => {
    if (!selected) return;
    if (
      !window.confirm(
        `Delete "${selected.name}"? Only allowed if they have no ledger history and zero balance.`
      )
    ) {
      return;
    }
    const res = await apiFetch(`/api/customers/${selected.id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error ?? 'Delete failed.');
      return;
    }
    setSelectedId(null);
    setCustomers(data.customers ?? []);
    await load();
  };

  const requestReminder = async () => {
    if (!selected) return;
    setReminderLoading(true);
    setReminder(null);
    setCopied(false);
    try {
      const res = await apiFetch('/api/reminder-draft', {
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

  const copyReminder = () => {
    if (!reminder) return;
    navigator.clipboard.writeText(reminder);
    setCopied(true);
  };

  const sendWhatsApp = () => {
    if (!reminder || !selected?.phone) return;
    const url = whatsAppSendUrl(selected.phone, reminder);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };

  if (loadError) {
    return (
      <div className="page-surface">
        <p style={{ color: 'var(--stamp-red)' }}>{loadError}</p>
      </div>
    );
  }

  if (!transactions) {
    return (
      <div className="page-surface">
        <p className="empty-state">Loading credit ledger…</p>
      </div>
    );
  }

  return (
    <div className="page-surface">
      <p className="page-eyebrow">Customer credit</p>
      <h1 className="page-title">Credit</h1>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: -16, marginBottom: 20 }}>
        Track who owes what, record payments and udhaar, open each customer&apos;s ledger.
      </p>

      <div className="page-actions">
        <button type="button" className="btn-secondary" onClick={() => setCustomerModal('add')}>
          Add customer…
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={!selected}
          onClick={() => setCustomerModal('edit')}
        >
          Edit…
        </button>
        <button
          type="button"
          className="btn-secondary inv-btn-delete"
          disabled={!selected}
          onClick={handleDelete}
        >
          Delete (safe only)
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={!selected}
          onClick={() => setLedgerOpen(true)}
        >
          Open ledger…
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={!selected || selected.balance <= 0}
          onClick={() => setPaymentOpen(true)}
        >
          Record payment…
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={!selected}
          onClick={() => setUdhaarOpen(true)}
        >
          Record manual udhaar…
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={!selected || selected.balance <= 0 || reminderLoading}
          onClick={requestReminder}
        >
          {reminderLoading ? 'Drafting…' : 'Draft reminder…'}
        </button>
      </div>

      <div className="inv-toolbar">
        <label className="inv-search-label">
          Search:
          <input
            className="inv-search-input"
            type="search"
            placeholder="Search customers by name or contact…"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
        </label>
      </div>

      {rows.length === 0 ? (
        <div className="empty-state">
          <p style={{ fontWeight: 500, color: 'var(--ink)' }}>No customers yet.</p>
          <p>Use Add customer above to register someone, or record a credit sale from Entry.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <p style={{ fontWeight: 500, color: 'var(--ink)' }}>No customers match your search.</p>
        </div>
      ) : (
        <div className="inv-table-wrap">
          <table className="inv-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Contact</th>
                <th>Due balance</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr
                  key={row.id}
                  className={selectedId === row.id ? 'inv-row-selected' : undefined}
                  onClick={() => setSelectedId(row.id)}
                  onDoubleClick={() => {
                    setSelectedId(row.id);
                    setCustomerModal('edit');
                  }}
                >
                  <td>{row.name}</td>
                  <td>{row.phone ?? '—'}</td>
                  <td className="figure">{formatRupees(Math.max(0, row.balance))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && selectedScore && (
        <>
          <div className="customer-detail-strip">
            <div className="customer-detail-main">
              <strong>{selected.name}</strong>
              <span className="customer-detail-phone">{selected.phone ?? 'No phone on file'}</span>
            </div>
            <div className="customer-detail-meta">
              <span className="figure customer-detail-balance">
                Due: {formatRupees(Math.max(0, selected.balance))}
              </span>
              <StampBadge variant="score">{selectedScore.tier}</StampBadge>
            </div>
          </div>
          <CreditScoreCard customerName={selected.name} score={selectedScore} />
        </>
      )}

      {reminder && selected && (
        <div className="inv-banner" style={{ marginBottom: 16, border: '1px solid var(--rule-line)' }}>
          <p className="page-eyebrow" style={{ marginBottom: 8 }}>
            Reminder for {selected.name}
          </p>
          <p style={{ fontSize: 14, lineHeight: 1.6, margin: '0 0 10px' }}>{reminder}</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" className="btn-secondary" onClick={copyReminder}>
              {copied ? 'Copied ✓' : 'Copy message'}
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={sendWhatsApp}
              disabled={!selected.phone}
              title={selected.phone ? 'Open WhatsApp with this message' : 'Add a phone number in Edit customer to send via WhatsApp'}
            >
              Send on WhatsApp
            </button>
          </div>
          {!selected.phone && (
            <p style={{ fontSize: 12, color: 'var(--ink-soft)', margin: '8px 0 0' }}>
              Add a phone number in Edit customer to send via WhatsApp.
            </p>
          )}
        </div>
      )}

      <KhaataaCustomerModal
        mode={customerModal === 'edit' ? 'edit' : 'add'}
        customer={customerModal === 'edit' ? selected : null}
        open={customerModal != null}
        onClose={() => setCustomerModal(null)}
        onSaved={load}
      />

      {selected && (
        <>
          <KhaataaLedgerModal
            open={ledgerOpen}
            customerName={selected.name}
            customerId={selected.id}
            dueBalance={selected.balance}
            transactions={transactions}
            onClose={() => setLedgerOpen(false)}
          />
          <KhaataaPaymentModal
            open={paymentOpen}
            customerName={selected.name}
            defaultAmount={selected.balance}
            onClose={() => setPaymentOpen(false)}
            onSaved={load}
          />
          <KhaataaUdhaarModal
            open={udhaarOpen}
            customerName={selected.name}
            onClose={() => setUdhaarOpen(false)}
            onSaved={load}
          />
        </>
      )}
    </div>
  );
}

export default function KhaataaPage() {
  return (
    <Suspense
      fallback={
        <div className="page-surface">
          <p className="empty-state">Loading credit ledger…</p>
        </div>
      }
    >
      <KhaataaContent />
    </Suspense>
  );
}
