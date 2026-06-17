import type { InventoryRow, Transaction } from './types';

export function isToday(isoDate: string): boolean {
  const d = new Date(isoDate);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export interface DashboardSummary {
  todaySalesTotal: number;
  todayTransactionCount: number;
  totalOwedAcrossAllCustomers: number;
  distinctItemsTracked: number;
}

export function summarizeDashboard(transactions: Transaction[]): DashboardSummary {
  const todays = transactions.filter((t) => isToday(t.created_at));
  const todaySales = todays.filter((t) => t.type === 'sale');

  const owedByCustomer = computeCustomerBalances(transactions);
  const totalOwed = Object.values(owedByCustomer).reduce((sum, c) => sum + c.balance, 0);

  const items = new Set(transactions.filter((t) => t.item_name).map((t) => t.item_name));

  return {
    todaySalesTotal: todaySales.reduce((sum, t) => sum + Number(t.total_amount), 0),
    todayTransactionCount: todays.length,
    totalOwedAcrossAllCustomers: totalOwed,
    distinctItemsTracked: items.size,
  };
}

export interface CustomerBalance {
  customer_id: string;
  name: string;
  balance: number;
  lastActivityAt: string;
}

export function computeCustomerBalances(transactions: Transaction[]): Record<string, CustomerBalance> {
  const byCustomer: Record<string, CustomerBalance> = {};

  for (const t of transactions) {
    if (!t.customer_id || !t.customer_name) continue;
    if (!byCustomer[t.customer_id]) {
      byCustomer[t.customer_id] = {
        customer_id: t.customer_id,
        name: t.customer_name,
        balance: 0,
        lastActivityAt: t.created_at,
      };
    }
    const entry = byCustomer[t.customer_id];
    if (t.type === 'payment') {
      entry.balance -= Number(t.total_amount);
    } else if (t.is_credit) {
      entry.balance += Number(t.total_amount);
    }
    if (new Date(t.created_at) > new Date(entry.lastActivityAt)) {
      entry.lastActivityAt = t.created_at;
    }
  }

  return byCustomer;
}

export function computeInventory(transactions: Transaction[]): InventoryRow[] {
  const byItem: Record<string, InventoryRow> = {};

  for (const t of transactions) {
    if (!t.item_name || t.quantity == null) continue;
    if (!byItem[t.item_name]) {
      byItem[t.item_name] = {
        item_name: t.item_name,
        quantity_on_hand: 0,
        last_unit_price: t.unit_price ?? null,
        last_movement_at: t.created_at,
      };
    }
    const row = byItem[t.item_name];
    if (t.type === 'purchase') row.quantity_on_hand += Number(t.quantity);
    if (t.type === 'sale') row.quantity_on_hand -= Number(t.quantity);

    if (new Date(t.created_at) > new Date(row.last_movement_at)) {
      row.last_movement_at = t.created_at;
      if (t.unit_price != null) row.last_unit_price = t.unit_price;
    }
  }

  return Object.values(byItem).sort((a, b) => a.item_name.localeCompare(b.item_name));
}

export function formatRupees(amount: number): string {
  return `Rs. ${Math.round(amount).toLocaleString('en-PK')}`;
}

export function daysSinceLastPayment(customerId: string, transactions: Transaction[]): number | null {
  const payments = transactions
    .filter((t) => t.customer_id === customerId && t.type === 'payment')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  if (payments.length === 0) return null;

  const lastPayment = new Date(payments[0].created_at);
  const diffMs = Date.now() - lastPayment.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

export function timeAgo(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
