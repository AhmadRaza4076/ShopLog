'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import InventoryProductModal from '@/components/InventoryProductModal';
import { formatQty, formatRupees } from '@/lib/computed';
import { useInventory } from '@/lib/hooks/use-inventory';
import type { InventoryRow } from '@/lib/types';

function statusClass(status: InventoryRow['status']): string {
  if (status === 'Low stock') return 'inv-status inv-status-low';
  if (status === 'Oversold') return 'inv-status inv-status-over';
  return 'inv-status inv-status-ok';
}

function InventoryContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const urlQuery = searchParams.get('q')?.trim().toLowerCase() ?? '';

  const { items, error: loadError, reload: load, setItems } = useInventory();
  const [search, setSearch] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<'add' | 'edit' | null>(null);
  const [sortLowStock, setSortLowStock] = useState<'asc' | 'desc' | null>(null);

  useEffect(() => {
    if (urlQuery) setSearch(urlQuery);
  }, [urlQuery]);

  const filtered = useMemo(() => {
    if (!items) return [];
    let rows = items;
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter((r) => r.item_name.toLowerCase().includes(q));
    }
    if (lowStockOnly) {
      rows = rows.filter((r) => r.status === 'Low stock' || r.status === 'Oversold');
    }
    if (sortLowStock) {
      rows = [...rows].sort((a, b) => {
        const diff = a.low_stock_at - b.low_stock_at;
        return sortLowStock === 'asc' ? diff : -diff;
      });
    }
    return rows;
  }, [items, search, lowStockOnly, sortLowStock]);

  const selectedRow = items?.find((r) => r.item_name === selected) ?? null;
  const hasNegative = items?.some((r) => r.quantity_on_hand < 0) ?? false;

  const handleSearchChange = (value: string) => {
    setSearch(value);
    const params = new URLSearchParams(searchParams.toString());
    if (value.trim()) params.set('q', value.trim());
    else params.delete('q');
    router.replace(params.size ? `/inventory?${params}` : '/inventory');
  };

  const handleDelete = async () => {
    if (!selectedRow) return;
    const msg = selectedRow.has_transaction_history
      ? `"${selectedRow.item_name}" has purchase/sale history in the ledger. Remove catalog entry only? Stock qty from past transactions will remain.`
      : `Delete "${selectedRow.item_name}" from inventory?`;
    if (!window.confirm(msg)) return;

    const res = await fetch(`/api/inventory/${encodeURIComponent(selectedRow.item_name)}`, {
      method: 'DELETE',
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error ?? 'Delete failed.');
      return;
    }
    setSelected(null);
    setItems(data.items ?? []);
  };

  if (loadError) {
    return (
      <div className="page-surface">
        <p style={{ color: 'var(--stamp-red)' }}>{loadError}</p>
      </div>
    );
  }

  if (!items) {
    return (
      <div className="page-surface">
        <p className="empty-state">Loading inventory…</p>
      </div>
    );
  }

  return (
    <div className="page-surface">
      <p className="page-eyebrow">Stock on hand</p>
      <h1 className="page-title">Inventory</h1>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: -16, marginBottom: 20 }}>
        Product catalog with buy/sell prices and low-stock alerts. Qty is computed from purchases and sales.
      </p>

      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <Link href="/entry?mode=bulk" className="btn-secondary" style={{ textDecoration: 'none', fontSize: 13 }}>
          Import stock list
        </Link>
      </div>

      <div className="inv-toolbar">
        <label className="inv-search-label">
          Search:
          <input
            className="inv-search-input"
            type="search"
            placeholder="Search products by name…"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
        </label>
        <label className="inv-filter-check">
          <input
            type="checkbox"
            checked={lowStockOnly}
            onChange={(e) => setLowStockOnly(e.target.checked)}
          />
          Show low stock only
        </label>
      </div>

      {hasNegative && !lowStockOnly && (
        <div className="inv-banner inv-banner-warn">
          <p style={{ fontWeight: 600, margin: '0 0 6px' }}>Some items show oversold stock</p>
          <p style={{ margin: 0 }}>
            Negative qty means more was sold than purchased.{' '}
            <Link href="/entry?intent=purchase">Add stock</Link> to fix.
          </p>
        </div>
      )}

      {items.length === 0 ? (
        <div className="empty-state">
          <p style={{ fontWeight: 500, color: 'var(--ink)' }}>No products yet.</p>
          <p>Use Add product below to create your first item.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <p style={{ fontWeight: 500, color: 'var(--ink)' }}>No products match your filters.</p>
        </div>
      ) : (
        <div className="inv-table-wrap">
          <table className="inv-table">
            <thead>
              <tr>
                <th>Name</th>
                <th className="figure">Qty</th>
                <th className="figure">Buy</th>
                <th className="figure">Sell</th>
                <th className="figure">
                  <button
                    type="button"
                    className="inv-sort-btn"
                    onClick={() =>
                      setSortLowStock((s) => (s === 'asc' ? 'desc' : s === 'desc' ? null : 'asc'))
                    }
                  >
                    Low-stock at
                    {sortLowStock === 'asc' ? ' ↑' : sortLowStock === 'desc' ? ' ↓' : ''}
                  </button>
                </th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr
                  key={row.item_name}
                  className={selected === row.item_name ? 'inv-row-selected' : undefined}
                  onClick={() => setSelected(row.item_name)}
                  onDoubleClick={() => {
                    setSelected(row.item_name);
                    setModalMode('edit');
                  }}
                >
                  <td>{row.item_name}</td>
                  <td className="figure">{formatQty(row.quantity_on_hand)}</td>
                  <td className="figure">{row.buy_price != null ? formatRupees(row.buy_price) : '—'}</td>
                  <td className="figure">{row.sell_price != null ? formatRupees(row.sell_price) : '—'}</td>
                  <td className="figure">{formatQty(row.low_stock_at)}</td>
                  <td>
                    <span className={statusClass(row.status)}>{row.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="inv-actions">
        <button type="button" className="btn-secondary" onClick={() => setModalMode('add')}>
          Add product…
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={!selectedRow}
          onClick={() => setModalMode('edit')}
        >
          Edit…
        </button>
        <button
          type="button"
          className="btn-secondary inv-btn-delete"
          disabled={!selectedRow}
          onClick={handleDelete}
        >
          Delete
        </button>
      </div>

      <InventoryProductModal
        mode={modalMode === 'edit' ? 'edit' : 'add'}
        item={modalMode === 'edit' ? selectedRow : null}
        open={modalMode != null}
        onClose={() => setModalMode(null)}
        onSaved={load}
      />
    </div>
  );
}

export default function InventoryPage() {
  return (
    <Suspense
      fallback={
        <div className="page-surface">
          <p className="empty-state">Loading inventory…</p>
        </div>
      }
    >
      <InventoryContent />
    </Suspense>
  );
}
