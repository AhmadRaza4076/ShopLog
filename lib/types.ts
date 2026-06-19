export type TransactionType = 'sale' | 'purchase' | 'payment' | 'credit_given';
export type EntrySource = 'typed' | 'voice' | 'photo' | 'system';

export interface Transaction {
  id: string;
  shop_id: string;
  type: TransactionType;
  item_name: string | null;
  quantity: number | null;
  unit_price: number | null;
  total_amount: number;
  customer_id: string | null;
  customer_name?: string | null; // joined convenience field
  customer_phone?: string | null;
  is_credit: boolean;
  source: EntrySource;
  raw_input: string | null;
  sale_id: string | null;
  sale_notes: string | null;
  created_at: string;
}

export interface Customer {
  id: string;
  shop_id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  total_owed: number;
  last_payment_at: string | null;
  created_at: string;
}

/** Customer row for API / UI (without computed balance). */
export interface CustomerRecord {
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
}

export interface CustomerInput {
  name: string;
  phone?: string | null;
  notes?: string | null;
}

export interface ShopItem {
  id: string;
  shop_id: string;
  item_name: string;
  buy_price: number | null;
  sell_price: number | null;
  low_stock_at: number;
  updated_at: string;
}

export type InventoryStatus = 'OK' | 'Low stock' | 'Oversold';

export interface InventoryRow {
  item_name: string;
  quantity_on_hand: number;
  buy_price: number | null;
  sell_price: number | null;
  low_stock_at: number;
  status: InventoryStatus;
  last_movement_at: string;
  shop_item_id: string | null;
  has_transaction_history: boolean;
}

/** Payload for Add / Edit product modal */
export interface ShopItemInput {
  item_name: string;
  buy_price: number | null;
  sell_price: number | null;
  low_stock_at: number;
  /** Add: opening stock. Edit: target on-hand qty (creates adjustment if changed). */
  quantity_on_hand?: number | null;
  /** @deprecated use quantity_on_hand */
  opening_qty?: number | null;
}

// Structured result the parsing pipeline always normalizes to,
// regardless of whether the input was typed, spoken, or photographed.
export interface ParsedTransaction {
  type: TransactionType;
  item_name: string | null;
  quantity: number | null;
  unit_price: number | null;
  total_amount: number;
  customer_name: string | null;
  is_credit: boolean;
  confidence: 'high' | 'medium' | 'low';
  note?: string;
}

/** One row from a bulk inventory sheet (notebook photo or pasted list). */
export interface InventorySheetRow {
  item_name: string;
  quantity: number;
  unit_price: number | null;
}

export type EntryIntent = 'sale' | 'purchase' | 'payment' | 'credit_given';

export interface SaleLineInput {
  item_name: string;
  quantity: number;
  unit_price: number | null;
}

export interface SaleInput {
  payment: 'cash' | 'credit';
  customer_name: string | null;
  notes: string | null;
  lines: SaleLineInput[];
}

export interface SaleRow {
  sale_id: string;
  sale_number: number;
  created_at: string;
  payment: 'Cash' | 'Credit';
  customer_name: string | null;
  total: number;
  lines_summary: string;
  line_count: number;
}

export interface SaveTransactionOptions {
  sale_id?: string | null;
  sale_notes?: string | null;
  knownNames?: string[];
  skipShopItemUpsert?: boolean;
}
