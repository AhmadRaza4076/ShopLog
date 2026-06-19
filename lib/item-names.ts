import type { InventoryRow, InventoryStatus, ShopItem, Transaction } from './types';

/** Demo seed aliases — voice "cement" maps to seeded product name. */
export const DEFAULT_ITEM_ALIASES: Record<string, string> = {
  cement: 'Cement (bag)',
  rice: 'Rice (50kg bag)',
};

export function getItemAliases(): Record<string, string> {
  return { ...DEFAULT_ITEM_ALIASES };
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

export function collectKnownItemNames(transactions: Transaction[]): string[] {
  const names = new Set<string>();
  for (const t of transactions) {
    if (t.item_name?.trim()) names.add(t.item_name.trim());
  }
  for (const canonical of Object.values(getItemAliases())) {
    names.add(canonical);
  }
  return [...names];
}

/** Exact case-insensitive match or explicit alias only — no substring merging. */
export function canonicalItemName(rawName: string, knownNames: string[]): string {
  const trimmed = rawName.trim();
  if (!trimmed) return trimmed;

  const q = norm(trimmed);
  const aliases = getItemAliases();

  if (aliases[q]) return aliases[q];

  const exact = knownNames.find((n) => norm(n) === q);
  if (exact) return exact;

  return trimmed;
}

export function itemNameClusters(names: string[]): Map<string, string> {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  const map = new Map<string, string>();
  for (const name of unique) {
    map.set(name, canonicalItemName(name, unique));
  }
  return map;
}

function inventoryStatus(qty: number, lowStockAt: number): InventoryStatus {
  if (qty < 0) return 'Oversold';
  if (qty <= lowStockAt) return 'Low stock';
  return 'OK';
}

interface MutableRow {
  item_name: string;
  quantity_on_hand: number;
  last_purchase_price: number | null;
  last_sale_price: number | null;
  last_movement_at: string;
  shop_item_id: string | null;
  catalog_buy: number | null;
  catalog_sell: number | null;
  catalog_low_stock: number;
  has_transaction_history: boolean;
}

export function computeInventoryMerged(
  transactions: Transaction[],
  catalog: ShopItem[] = []
): InventoryRow[] {
  const allNames = collectKnownItemNames(transactions);
  for (const item of catalog) {
    if (item.item_name?.trim() && !allNames.some((n) => norm(n) === norm(item.item_name))) {
      allNames.push(item.item_name.trim());
    }
  }

  const clusters = itemNameClusters(allNames);
  const catalogByCanonical = new Map<string, ShopItem>();

  for (const item of catalog) {
    const canonical = clusters.get(item.item_name.trim()) ?? item.item_name.trim();
    if (!catalogByCanonical.has(canonical)) {
      catalogByCanonical.set(canonical, item);
    }
  }

  const byCanonical: Record<string, MutableRow> = {};

  for (const [canonical, item] of catalogByCanonical) {
    byCanonical[canonical] = {
      item_name: canonical,
      quantity_on_hand: 0,
      last_purchase_price: null,
      last_sale_price: null,
      last_movement_at: item.updated_at,
      shop_item_id: item.id,
      catalog_buy: item.buy_price != null ? Number(item.buy_price) : null,
      catalog_sell: item.sell_price != null ? Number(item.sell_price) : null,
      catalog_low_stock: Number(item.low_stock_at) || 5,
      has_transaction_history: false,
    };
  }

  for (const t of transactions) {
    if (!t.item_name || t.quantity == null) continue;
    const canonical = clusters.get(t.item_name.trim()) ?? t.item_name.trim();

    if (!byCanonical[canonical]) {
      const cat = catalogByCanonical.get(canonical);
      byCanonical[canonical] = {
        item_name: canonical,
        quantity_on_hand: 0,
        last_purchase_price: null,
        last_sale_price: null,
        last_movement_at: t.created_at,
        shop_item_id: cat?.id ?? null,
        catalog_buy: cat?.buy_price != null ? Number(cat.buy_price) : null,
        catalog_sell: cat?.sell_price != null ? Number(cat.sell_price) : null,
        catalog_low_stock: Number(cat?.low_stock_at) || 5,
        has_transaction_history: false,
      };
    }

    const row = byCanonical[canonical];
    row.has_transaction_history = true;

    if (t.type === 'purchase') row.quantity_on_hand += Number(t.quantity);
    if (t.type === 'sale' || t.type === 'credit_given') row.quantity_on_hand -= Number(t.quantity);

    const isNewer = new Date(t.created_at) > new Date(row.last_movement_at);
    if (isNewer) {
      row.last_movement_at = t.created_at;
    }
    if (t.type === 'purchase' && t.unit_price != null) {
      if (isNewer || row.last_purchase_price == null) {
        row.last_purchase_price = Number(t.unit_price);
      }
    }
    if (t.type === 'sale' && t.unit_price != null) {
      if (isNewer || row.last_sale_price == null) {
        row.last_sale_price = Number(t.unit_price);
      }
    }
  }

  return Object.values(byCanonical)
    .map((row) => {
      const lowStockAt = row.catalog_low_stock;
      return {
        item_name: row.item_name,
        quantity_on_hand: row.quantity_on_hand,
        buy_price: row.catalog_buy ?? row.last_purchase_price,
        sell_price: row.catalog_sell ?? row.last_sale_price,
        low_stock_at: lowStockAt,
        status: inventoryStatus(row.quantity_on_hand, lowStockAt),
        last_movement_at: row.last_movement_at,
        shop_item_id: row.shop_item_id,
        has_transaction_history: row.has_transaction_history,
      };
    })
    .sort((a, b) => a.item_name.localeCompare(b.item_name));
}
