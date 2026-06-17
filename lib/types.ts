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
  is_credit: boolean;
  source: EntrySource;
  raw_input: string | null;
  created_at: string;
}

export interface Customer {
  id: string;
  shop_id: string;
  name: string;
  phone: string | null;
  total_owed: number;
  last_payment_at: string | null;
  created_at: string;
}

export interface InventoryRow {
  item_name: string;
  quantity_on_hand: number;
  last_unit_price: number | null;
  last_movement_at: string;
}

export interface CreditScoreResult {
  customer_id: string;
  customer_name: string;
  score: number; // 0-100
  band: 'Strong' | 'Fair' | 'Risky' | 'Insufficient history';
  factors: {
    label: string;
    detail: string;
    weight: 'positive' | 'negative' | 'neutral';
  }[];
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
