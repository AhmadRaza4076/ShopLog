import { computeInventoryMerged } from './item-names';
import type { InventoryRow, ParsedTransaction, SaleRow, ShopItem, Transaction, TransactionType } from './types';

export const STOCK_ADJUSTMENT_MARKER = 'Stock adjustment';

export function isStockAdjustment(t: Pick<Transaction, 'sale_notes' | 'raw_input'>): boolean {
  const notes = t.sale_notes ?? '';
  const raw = t.raw_input ?? '';
  return notes.includes(STOCK_ADJUSTMENT_MARKER) || raw.includes(STOCK_ADJUSTMENT_MARKER);
}

export function isRealSale(t: Transaction): boolean {
  return t.type === 'sale' && !isStockAdjustment(t);
}

/** Single source of truth: does this row add to a customer's khaataa balance? */
export function countsTowardCustomerBalance(t: { type: string; is_credit: boolean }): boolean {
  if (t.type === 'payment' || t.type === 'purchase') return false;
  if (t.type === 'credit_given') return true;
  return t.is_credit;
}

/** Signed delta this transaction applies to customer balance (+ owed, − payment). */
export function customerBalanceDelta(t: {
  type: string;
  is_credit: boolean;
  total_amount: number;
}): number {
  if (t.type === 'payment') return -Number(t.total_amount);
  if (countsTowardCustomerBalance(t)) return Number(t.total_amount);
  return 0;
}

/** Enforce is_credit invariant at the write boundary (LLM output is not trusted). */
export function normalizeIsCredit(type: TransactionType, isCredit: boolean): boolean {
  if (type === 'payment' || type === 'purchase') return false;
  if (type === 'credit_given') return true;
  if (type === 'sale') return isCredit;
  return false;
}

export function normalizeParsedTransaction(parsed: ParsedTransaction): ParsedTransaction {
  return {
    ...parsed,
    is_credit: normalizeIsCredit(parsed.type, parsed.is_credit),
  };
}

/** Default shop timezone offset in minutes (PKT = UTC+5). Override via SHOP_TZ_OFFSET_MINUTES. */
function shopTzOffsetMinutes(): number {
  const raw = process.env.SHOP_TZ_OFFSET_MINUTES;
  if (raw != null && raw !== '') {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return 300;
}

export function isToday(isoDate: string, offsetMinutes = shopTzOffsetMinutes()): boolean {
  const now = Date.now() + offsetMinutes * 60000;
  const tx = new Date(isoDate).getTime() + offsetMinutes * 60000;
  const nowDate = new Date(now);
  const txDate = new Date(tx);
  return (
    txDate.getUTCFullYear() === nowDate.getUTCFullYear() &&
    txDate.getUTCMonth() === nowDate.getUTCMonth() &&
    txDate.getUTCDate() === nowDate.getUTCDate()
  );
}

export interface DashboardSummary {
  todaySalesTotal: number;
  todayTransactionCount: number;
  totalOwedAcrossAllCustomers: number;
  distinctItemsTracked: number;
  todayGrossProfit: number;
  todaySalesMissingCost: number;
}

export interface SaleProfitLine {
  transaction_id: string;
  item_name: string;
  quantity: number;
  sell_unit: number;
  buy_unit: number;
  profit: number;
}

export interface ProfitSummary {
  todayGrossProfit: number;
  todaySalesWithKnownCost: number;
  todaySalesMissingCost: number;
  lines: SaleProfitLine[];
}

function findInventoryRow(inventory: InventoryRow[], itemName: string): InventoryRow | undefined {
  const target = itemName.trim().toLowerCase();
  return inventory.find((r) => r.item_name.trim().toLowerCase() === target);
}

export function computeProfitSummary(
  transactions: Transaction[],
  catalog: ShopItem[] = []
): ProfitSummary {
  const inventory = computeInventoryMerged(transactions, catalog);
  const todaySales = transactions.filter((t) => isRealSale(t) && isToday(t.created_at));

  const lines: SaleProfitLine[] = [];
  let todaySalesMissingCost = 0;

  for (const t of todaySales) {
    if (!t.item_name || t.quantity == null) {
      todaySalesMissingCost += 1;
      continue;
    }

    const row = findInventoryRow(inventory, t.item_name);
    const sellUnit = t.unit_price != null ? Number(t.unit_price) : row?.sell_price;
    const buyUnit = row?.buy_price;

    if (sellUnit == null || buyUnit == null) {
      todaySalesMissingCost += 1;
      continue;
    }

    const quantity = Number(t.quantity);
    lines.push({
      transaction_id: t.id,
      item_name: row?.item_name ?? t.item_name,
      quantity,
      sell_unit: sellUnit,
      buy_unit: buyUnit,
      profit: (sellUnit - buyUnit) * quantity,
    });
  }

  return {
    todayGrossProfit: lines.reduce((sum, l) => sum + l.profit, 0),
    todaySalesWithKnownCost: lines.length,
    todaySalesMissingCost,
    lines,
  };
}

export function summarizeDashboard(
  transactions: Transaction[],
  catalog: ShopItem[] = []
): DashboardSummary {
  const todays = transactions.filter((t) => isToday(t.created_at));
  const todaySales = todays.filter((t) => isRealSale(t));

  const owedByCustomer = computeCustomerBalances(transactions);
  const totalOwed = Object.values(owedByCustomer).reduce((sum, c) => sum + c.balance, 0);

  const items = new Set(transactions.filter((t) => t.item_name).map((t) => t.item_name));
  const profit = computeProfitSummary(transactions, catalog);

  return {
    todaySalesTotal: todaySales.reduce((sum, t) => sum + Number(t.total_amount), 0),
    todayTransactionCount: todays.length,
    totalOwedAcrossAllCustomers: totalOwed,
    distinctItemsTracked: items.size,
    todayGrossProfit: profit.todayGrossProfit,
    todaySalesMissingCost: profit.todaySalesMissingCost,
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
    entry.balance += customerBalanceDelta(t);
    if (new Date(t.created_at) > new Date(entry.lastActivityAt)) {
      entry.lastActivityAt = t.created_at;
    }
  }

  return byCustomer;
}

export function computeInventory(
  transactions: Transaction[],
  catalog: ShopItem[] = [],
  hiddenKeys?: Set<string>
): InventoryRow[] {
  return computeInventoryMerged(transactions, catalog, hiddenKeys);
}

/** Project on-hand qty for an item after applying a hypothetical sale/purchase. */
export function projectStockLevel(
  transactions: Transaction[],
  itemName: string,
  delta: { type: 'sale' | 'purchase'; quantity: number }
): number {
  const inventory = computeInventoryMerged(transactions);
  const target = itemName.trim().toLowerCase();
  const row = inventory.find((r) => r.item_name.trim().toLowerCase() === target);
  const current = row?.quantity_on_hand ?? 0;
  if (delta.type === 'purchase') return current + delta.quantity;
  return current - delta.quantity;
}

export function stockWarningForParsed(
  transactions: Transaction[],
  parsed: { type: string; item_name: string | null; quantity: number | null }
): string | null {
  if (parsed.type !== 'sale' || !parsed.item_name || parsed.quantity == null) return null;
  const projected = projectStockLevel(transactions, parsed.item_name, {
    type: 'sale',
    quantity: Number(parsed.quantity),
  });
  if (projected >= 0) return null;
  return `This sale will leave ${parsed.item_name} at ${projected} on hand — record a purchase or opening stock if that is wrong.`;
}

function formatAmountCore(amount: number): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '0';
  const rounded = Math.round(n * 100) / 100;
  if (Number.isInteger(rounded) || Math.abs(rounded - Math.round(rounded)) < 0.005) {
    return Math.round(rounded).toLocaleString('en-PK');
  }
  return rounded.toFixed(2);
}

export function formatRupees(amount: number): string {
  return `Rs. ${formatAmountCore(amount)}`;
}

/** Whole units only — bags, pieces, stock count. */
export function formatQty(qty: number): string {
  return String(Math.round(Number(qty)));
}

export function formatPrice(amount: number | null): string {
  if (amount == null) return '—';
  return formatAmountCore(amount);
}

/** For input value= when loading edit state — no thousands separators. */
export function formatQtyInput(qty: number): string {
  return String(Math.round(Number(qty)));
}

export function formatPriceInput(amount: number | null): string {
  if (amount == null) return '';
  const n = Number(amount);
  if (Number.isInteger(n) || Math.abs(n - Math.round(n)) < 0.005) return String(Math.round(n));
  return n.toFixed(2);
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

export interface LedgerEntry {
  id: string;
  created_at: string;
  type: 'Udhaar (credit)' | 'Payment';
  amount: number;
  description: string | null;
  related_sale_id: number | null;
}

function isLedgerCreditTxn(t: Transaction): boolean {
  return countsTowardCustomerBalance(t);
}

/** Build per-customer udhaar/payment history for the ledger modal. */
export function buildCustomerLedger(transactions: Transaction[], customerId: string): LedgerEntry[] {
  const customerTxns = transactions
    .filter((t) => t.customer_id === customerId)
    .filter((t) => t.type === 'payment' || isLedgerCreditTxn(t))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const saleNumberMap = buildSaleNumberMap(transactions);

  const creditSales = transactions
    .filter((t) => t.customer_id === customerId && t.type === 'sale' && t.is_credit)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const saleIdByTxnId = new Map<string, number>();
  for (const t of creditSales) {
    const groupKey = t.sale_id ?? t.id;
    const num = saleNumberMap.get(groupKey);
    if (num != null) saleIdByTxnId.set(t.id, num);
  }

  return customerTxns.map((t) => {
    const isPayment = t.type === 'payment';
    let description = t.raw_input?.trim() || null;
    let relatedSaleId: number | null = null;

    if (!isPayment && t.type === 'sale' && t.is_credit) {
      relatedSaleId = saleIdByTxnId.get(t.id) ?? null;
      if (!description) {
        description = relatedSaleId != null ? `Credit sale #${relatedSaleId}` : 'Credit sale';
      }
    } else if (!isPayment && t.type === 'credit_given' && !description) {
      description = 'Manual udhaar';
    }

    return {
      id: t.id,
      created_at: t.created_at,
      type: isPayment ? 'Payment' : 'Udhaar (credit)',
      amount: Number(t.total_amount),
      description,
      related_sale_id: relatedSaleId,
    };
  });
}

export function formatLedgerDate(isoDate: string): string {
  const d = new Date(isoDate);
  const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: false });
  return `${date} ${time}`;
}

function formatLineSummary(itemName: string | null, quantity: number | null): string {
  if (!itemName) return '';
  const qty = quantity != null ? formatQty(Number(quantity)) : '?';
  return `${itemName} × ${qty}`;
}

/** Group sale transactions into checkout receipts for the Sales page. */
export function computeSalesGrouped(transactions: Transaction[]): SaleRow[] {
  const sales = transactions.filter((t) => isRealSale(t));
  const groups = new Map<string, Transaction[]>();

  for (const t of sales) {
    const key = t.sale_id ?? t.id;
    const list = groups.get(key) ?? [];
    list.push(t);
    groups.set(key, list);
  }

  const rows: Omit<SaleRow, 'sale_number'>[] = [];

  for (const [saleId, lines] of groups) {
    lines.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const first = lines[0];
    const total = lines.reduce((sum, l) => sum + Number(l.total_amount), 0);
    const summary = lines
      .map((l) => formatLineSummary(l.item_name, l.quantity))
      .filter(Boolean)
      .join('; ');

    rows.push({
      sale_id: saleId,
      created_at: first.created_at,
      payment: first.is_credit ? 'Credit' : 'Cash',
      customer_name: first.customer_name ?? null,
      total,
      lines_summary: summary,
      line_count: lines.length,
    });
  }

  rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return rows.map((row, i) => ({
    ...row,
    sale_number: rows.length - i,
  }));
}

/** Map sale_id or transaction id → display sale # for khaataa ledger. */
export function buildSaleNumberMap(transactions: Transaction[]): Map<string, number> {
  const sales = computeSalesGrouped(transactions);
  const map = new Map<string, number>();
  for (const s of sales) {
    map.set(s.sale_id, s.sale_number);
  }
  return map;
}
