'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import RecordSaleModal from '@/components/RecordSaleModal';
import { VOICE_REFRESH_EVENT } from '@/components/VoiceControl';
import { formatLedgerDate, formatRupees } from '@/lib/computed';
import type { SaleRow } from '@/lib/types';

function SalesContent() {
  const [sales, setSales] = useState<SaleRow[] | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/sales');
    const data = await res.json();
    setSales(data.sales ?? []);
  }, []);

  useEffect(() => {
    load();
    window.addEventListener(VOICE_REFRESH_EVENT, load);
    return () => window.removeEventListener(VOICE_REFRESH_EVENT, load);
  }, [load]);

  if (!sales) {
    return (
      <div className="page-surface">
        <p className="empty-state">Loading sales…</p>
      </div>
    );
  }

  return (
    <div className="page-surface">
      <p className="page-eyebrow">Point of sale</p>
      <h1 className="page-title">Sales</h1>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: -16, marginBottom: 20 }}>
        Grouped checkout receipts. Credit sales add to khaataa; cash sales with a customer are recorded for history only.
      </p>

      {sales.length === 0 ? (
        <div className="empty-state">
          <p style={{ fontWeight: 500, color: 'var(--ink)' }}>No sales yet.</p>
          <p>Record your first multi-line sale below.</p>
        </div>
      ) : (
        <div className="inv-table-wrap">
          <table className="inv-table">
            <thead>
              <tr>
                <th>Sale #</th>
                <th>Date / time</th>
                <th>Payment</th>
                <th>Customer</th>
                <th>Total</th>
                <th>Lines (summary)</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((sale) => (
                <tr key={sale.sale_id}>
                  <td className="figure">{sale.sale_number}</td>
                  <td>{formatLedgerDate(sale.created_at)}</td>
                  <td>{sale.payment}</td>
                  <td>{sale.customer_name ?? '—'}</td>
                  <td className="figure">{formatRupees(sale.total)}</td>
                  <td style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{sale.lines_summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="inv-actions">
        <button type="button" className="btn-primary" onClick={() => setModalOpen(true)}>
          Record new sale…
        </button>
      </div>

      <RecordSaleModal open={modalOpen} onClose={() => setModalOpen(false)} onSaved={load} />
    </div>
  );
}

export default function SalesPage() {
  return (
    <Suspense
      fallback={
        <div className="page-surface">
          <p className="empty-state">Loading sales…</p>
        </div>
      }
    >
      <SalesContent />
    </Suspense>
  );
}
