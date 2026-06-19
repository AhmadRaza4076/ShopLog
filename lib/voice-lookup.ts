import { computeInventory, computeCustomerBalances, projectStockLevel } from './computed';
import { customerNameMatchScore } from './customer-match';
import { canonicalItemName, collectKnownItemNames, getItemAliases } from './item-names';
import type { InventoryRow, ParsedTransaction, ShopItem, Transaction } from './types';

export interface CustomerLookupRow {
  id: string;
  name: string;
  phone: string | null;
  balance: number;
}

function normalizeQuery(q: string): string {
  return q.trim().toLowerCase();
}

/** Resolve spoken alias (e.g. "cement") to canonical inventory name. */
export function resolveItemName(
  query: string,
  inventory: InventoryRow[],
  transactions: Transaction[] = []
): string {
  const known = [...new Set([...collectKnownItemNames(transactions), ...inventory.map((r) => r.item_name)])];
  return canonicalItemName(query, known);
}

export function findInventoryItems(
  transactions: Transaction[],
  query: string,
  catalog: ShopItem[] = []
): { best: InventoryRow | null; matches: InventoryRow[] } {
  const q = normalizeQuery(query);
  if (!q) return { best: null, matches: [] };

  const inventory = computeInventory(transactions, catalog);
  const aliases = getItemAliases();
  const canonicalFromAlias = aliases[q];

  let matches = inventory.filter((r) => r.item_name.toLowerCase().includes(q));

  if (canonicalFromAlias) {
    const aliasMatch = inventory.find((r) => r.item_name === canonicalFromAlias);
    if (aliasMatch && !matches.some((m) => m.item_name === aliasMatch.item_name)) {
      matches = [aliasMatch, ...matches];
    }
  }

  for (const [alias, canonical] of Object.entries(aliases)) {
    if (q.includes(alias) || alias.includes(q)) {
      const row = inventory.find((r) => r.item_name === canonical);
      if (row && !matches.some((m) => m.item_name === row.item_name)) {
        matches = [row, ...matches];
      }
    }
  }

  const exact = matches.find((r) => r.item_name.toLowerCase() === q);
  const best = exact ?? matches[0] ?? null;
  return { best, matches };
}

export function findCustomers(
  customers: { id: string; name: string; phone: string | null }[],
  transactions: Transaction[],
  query: string
): { best: CustomerLookupRow | null; matches: CustomerLookupRow[] } {
  const q = normalizeQuery(query);
  if (!q) return { best: null, matches: [] };

  const balances = computeCustomerBalances(transactions);
  const rows: CustomerLookupRow[] = customers.map((c) => {
    const bal = balances[c.id];
    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      balance: bal?.balance ?? 0,
    };
  });

  const matches = rows
    .map((c) => ({ row: c, score: customerNameMatchScore(c.name, q) }))
    .filter((m): m is { row: CustomerLookupRow; score: number } => m.score != null)
    .sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score;
      return a.row.name.length - b.row.name.length;
    })
    .map((m) => m.row);

  const exact = matches.find((c) => c.name.toLowerCase() === q);
  return { best: exact ?? matches[0] ?? null, matches };
}

/** Build a purchase or adjustment sale to reach target on-hand quantity. */
export function buildSetStockParsed(
  transactions: Transaction[],
  itemName: string,
  targetQty: number,
  unitPrice?: number | null,
  catalog: ShopItem[] = []
): ParsedTransaction {
  const inventory = computeInventory(transactions, catalog);
  const resolved = resolveItemName(itemName, inventory, transactions);
  const row = inventory.find((r) => r.item_name === resolved);
  const current = projectStockLevel(transactions, resolved, { type: 'purchase', quantity: 0 });
  const delta = targetQty - current;

  if (delta === 0) {
    return {
      type: 'purchase',
      item_name: resolved,
      quantity: 0,
      unit_price: unitPrice ?? row?.buy_price ?? null,
      total_amount: 0,
      customer_name: null,
      is_credit: false,
      confidence: 'high',
      note: 'No change needed',
    };
  }

  if (delta > 0) {
    const price = unitPrice ?? row?.buy_price ?? null;
    const total = price != null ? price * delta : delta;
    return {
      type: 'purchase',
      item_name: resolved,
      quantity: delta,
      unit_price: price,
      total_amount: total,
      customer_name: null,
      is_credit: false,
      confidence: 'high',
      note: `Stock adjustment: set to ${targetQty}`,
    };
  }

  const reduceBy = Math.abs(delta);
  const price = unitPrice ?? row?.sell_price ?? null;
  return {
    type: 'sale',
    item_name: resolved,
    quantity: reduceBy,
    unit_price: price,
    total_amount: price != null ? price * reduceBy : 0,
    customer_name: null,
    is_credit: false,
    confidence: 'high',
    note: `Stock adjustment: set to ${targetQty}`,
  };
}

export function buildAddStockParsed(
  transactions: Transaction[],
  itemName: string,
  quantity: number,
  unitPrice?: number | null,
  catalog: ShopItem[] = []
): ParsedTransaction {
  const inventory = computeInventory(transactions, catalog);
  const resolved = resolveItemName(itemName, inventory, transactions);
  const row = inventory.find((r) => r.item_name === resolved);
  const price = unitPrice ?? row?.buy_price ?? null;
  const total = price != null ? price * quantity : quantity;
  return {
    type: 'purchase',
    item_name: resolved,
    quantity,
    unit_price: price,
    total_amount: total,
    customer_name: null,
    is_credit: false,
    confidence: 'high',
  };
}

